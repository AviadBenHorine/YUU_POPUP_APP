import * as admin from 'firebase-admin'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { defineSecret } from 'firebase-functions/params'
import twilio from 'twilio'

admin.initializeApp()

const TWILIO_SID   = defineSecret('TWILIO_ACCOUNT_SID')
const TWILIO_TOKEN = defineSecret('TWILIO_AUTH_TOKEN')
const TWILIO_FROM  = defineSecret('TWILIO_PHONE_NUMBER')

/**
 * Converts an Israeli phone number to E.164 format (+972XXXXXXXXX).
 * Accepts: 05XXXXXXXX, 5XXXXXXXX, 9725XXXXXXXX, +9725XXXXXXXX
 */
function normalizeIsraeliPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('972') && digits.length === 12) return `+${digits}`
  if (digits.startsWith('0')   && digits.length === 10) return `+972${digits.slice(1)}`
  if (digits.startsWith('5')   && digits.length === 9)  return `+972${digits}`
  return null
}

export const notifyOrderReady = onDocumentUpdated(
  {
    document: 'orders/{orderId}',
    secrets: [TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM],
    region: 'europe-west1',
  },
  async (event) => {
    const before = event.data?.before.data()
    const after  = event.data?.after.data()
    if (!before || !after) return

    // Only fire when status transitions TO 'ready' for the first time
    if (before.status === 'ready') return
    if (after.status  !== 'ready') return
    if (after.smsSentAt) return              // already sent — dedup guard

    // Respect the global SMS toggle stored in app settings
    const settingsSnap = await admin.firestore().doc('app/settings').get()
    if (settingsSnap.exists && settingsSnap.data()?.smsEnabled === false) return

    const phone = after.customerPhone as string | undefined
    if (!phone) return                       // no phone provided — nothing to do

    const normalized = normalizeIsraeliPhone(phone)
    if (!normalized) {
      console.warn(`[SMS] Invalid phone "${phone}" for order ${event.params.orderId} — skipping`)
      return
    }

    const name = (after.customerName as string | undefined)?.trim()
    const greeting = name ? `היי ${name}! ` : ''
    const body = `${greeting}✅ ההזמנה שלך מוכנה לאיסוף ב-YUU 🎉`

    try {
      const client = twilio(TWILIO_SID.value(), TWILIO_TOKEN.value())
      await client.messages.create({
        body,
        from: TWILIO_FROM.value(),
        to: normalized,
      })
      // Record that SMS was dispatched — visible in History/Analytics
      await event.data!.after.ref.update({ smsSentAt: new Date().toISOString() })
      console.log(`[SMS] Sent to ${normalized} for order ${event.params.orderId}`)
    } catch (err) {
      // Log but do NOT rethrow — rethrowing causes Firebase to retry and could
      // send duplicate SMS to the customer.
      console.error(`[SMS] Failed for order ${event.params.orderId}:`, err)
    }
  }
)
