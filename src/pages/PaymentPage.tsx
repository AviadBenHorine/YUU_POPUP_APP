import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { useStore } from '../stores/useStore'
import { saveImage } from '../services/imageDB'
import { printer } from '../services/bluetoothPrinter'

type Step = 'qr' | 'photo' | 'confirmation'

export default function PaymentPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate    = useNavigate()

  const orders       = useStore(s => s.orders)
  const menuItems    = useStore(s => s.menuItems)
  const settings     = useStore(s => s.settings)
  const updateOrder  = useStore(s => s.updateOrder)
  const showToast    = useStore(s => s.showToast)
  const decrementStockForItems = useStore(s => s.decrementStockForItems)

  const order = orders.find(o => o.id === orderId)

  const [step, setStep]               = useState<Step>('qr')
  const [imageFile, setImageFile]     = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [confirming, setConfirming]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview) }
  }, [imagePreview])

  if (!order) {
    return (
      <div className="h-dvh flex flex-col bg-cream">
        <TopBar title="תשלום" titleEn="Payment" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-navy/40 font-body">הזמנה לא נמצאה / Order not found</div>
        </div>
      </div>
    )
  }

  const typeLabel   = order.orderType === 'sit_down' ? '🪑 ישיבה / Sit Down' : '🥡 לקחת / Take Away'
  const requirePhoto = settings.requirePaymentPhoto ?? true
  const activeSlot  = settings.activeQRSlot ?? 1
  const activeQRSrc = activeSlot === 1 ? (settings.bitQR1 || '/qr1.jpeg')
                    : activeSlot === 2 ? settings.bitQR2
                    : settings.bitQR3

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  // Shared post-confirm logic (called by both bit and staff paths)
  function finaliseOrder(paymentMethod: 'bit' | 'staff', imageKey?: string) {
    const now = new Date().toISOString()
    updateOrder(order!.id, {
      status: 'sent_to_kitchen',
      paidAt: paymentMethod === 'staff' ? undefined : now,
      sentToKitchenAt: now,
      paymentMethod,
      paymentProofImageKey: imageKey,
    })
    decrementStockForItems(order!.items)
    try {
      if (printer.isConnected && (settings.printerEnabled ?? false)) {
        printer.enqueuePrint({ ...order!, status: 'sent_to_kitchen', paidAt: now }, menuItems, settings.printInHebrew ?? false)
      }
    } catch {}
    setStep('confirmation')
  }

  async function handleConfirm() {
    if (!imageFile || confirming) return
    setConfirming(true)
    try {
      const imageKey = `proof_${order!.id}_${Date.now()}`
      await saveImage(imageKey, imageFile)
      finaliseOrder('bit', imageKey)
      showToast('✓ הזמנה נשלחה למטבח / Order sent to kitchen')
    } catch (err) {
      console.error(err)
      showToast('שגיאה בשמירת התשלום / Error saving payment', 'error')
    } finally {
      setConfirming(false)
    }
  }

  function handleStaffOrder() {
    finaliseOrder('staff')
    showToast('✓ הזמנה נשלחה למטבח (על החשבון)')
  }

  return (
    <div className="h-dvh flex flex-col bg-cream overflow-hidden">
      <TopBar title="תשלום" titleEn="Payment" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-6 space-y-6">

          {/* Order summary */}
          <div className="bg-white rounded-2xl border-2 border-navy/15 p-5 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div>
                {order.customerName ? (
                  <>
                    <div className="font-display font-black text-navy text-2xl">{order.customerName}</div>
                    <div className="font-body text-navy/40 text-xs mt-0.5">{order.id}</div>
                  </>
                ) : (
                  <div className="font-display font-black text-navy text-2xl">{order.id}</div>
                )}
                <div className="font-body text-navy/50 text-sm mt-0.5">{typeLabel}</div>
              </div>
              <div className="font-display font-black text-gold text-4xl">₪{order.totalPrice}</div>
            </div>
            <div className="border-t border-navy/10 pt-3 space-y-1">
              {order.items.map(oi => {
                const mi = menuItems.find(m => m.id === oi.menuItemId)
                if (!mi) return null
                return (
                  <div key={oi.menuItemId} className="flex justify-between text-sm font-body">
                    <span className="text-navy/70">{oi.quantity}× {mi.nameHe}</span>
                    <span className="text-navy/50">₪{mi.price * oi.quantity}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Step indicator */}
          {step !== 'confirmation' && (
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 text-sm font-body ${step === 'qr' ? 'text-navy font-semibold' : 'text-green-600'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'qr' ? 'bg-navy text-cream' : 'bg-green-100 text-green-600'}`}>
                  {step !== 'qr' ? '✓' : '1'}
                </span>
                קוד QR
              </div>
              {requirePhoto && (
                <>
                  <div className="h-px flex-1 bg-navy/10" />
                  <div className={`flex items-center gap-2 text-sm font-body ${step === 'photo' ? 'text-navy font-semibold' : 'text-navy/30'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 'photo' ? 'bg-navy text-cream' : 'bg-navy/10 text-navy/30'}`}>2</span>
                    אישור תשלום
                  </div>
                </>
              )}
              <div className="h-px flex-1 bg-navy/10" />
              <div className="flex items-center gap-2 text-sm font-body text-navy/30">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-navy/10 text-navy/30">
                  {requirePhoto ? '3' : '2'}
                </span>
                מספר הזמנה
              </div>
            </div>
          )}

          {/* ── Step 1: QR Code ── */}
          {step === 'qr' && (
            <div className="animate-fade-in space-y-5">
              <div className="bg-white rounded-2xl border-2 border-navy/15 p-6 flex flex-col items-center gap-4 shadow-sm">
                <div className="font-body text-navy/60 text-sm">סרוק עם Bit לתשלום / Scan with Bit to pay</div>
                {activeQRSrc ? (
                  <div className="p-3 bg-white rounded-xl border-2 border-navy/10 double-border">
                    <img src={activeQRSrc} alt="Bit QR code" className="w-52 h-52 object-contain" />
                  </div>
                ) : (
                  <div className="w-52 h-52 rounded-xl border-2 border-dashed border-navy/20 flex flex-col items-center justify-center gap-2 text-navy/30">
                    <span className="text-4xl">📷</span>
                    <div className="font-body text-xs text-center px-4">העלה תמונת QR של Bit בהגדרות</div>
                  </div>
                )}
                <div className="font-display font-black text-navy text-3xl">₪{order.totalPrice}</div>
              </div>

              <button
                onClick={() => requirePhoto ? setStep('photo') : finaliseOrder('bit')}
                className="w-full py-5 rounded-2xl bg-navy text-cream font-display font-bold text-lg shadow-md hover:bg-navy/80 active:scale-95 transition-all double-border"
              >
                <div>{requirePhoto ? 'הלקוח שילם — צלם אישור' : 'הלקוח שילם ✓'}</div>
                <div className="text-cream/60 text-sm font-body mt-0.5">
                  {requirePhoto ? 'Customer Paid — Take Photo' : 'Customer Paid — Confirm'}
                </div>
              </button>

              {/* Staff / on the house */}
              <button
                onClick={handleStaffOrder}
                className="w-full py-3 rounded-xl border-2 border-navy/25 text-navy/60 font-body text-sm hover:border-navy/50 hover:text-navy transition-colors"
              >
                🧾 על החשבון (ללא תשלום) / Staff — No Charge
              </button>

              <button
                onClick={() => { updateOrder(order!.id, { status: 'cancelled' }); navigate('/orders') }}
                className="w-full py-3 rounded-xl border-2 border-red-200 text-red-400 hover:border-red-400 font-body text-sm transition-colors"
              >
                ✕ בטל וחזור / Cancel & Go Back
              </button>
            </div>
          )}

          {/* ── Step 2: Photo proof ── */}
          {step === 'photo' && (
            <div className="animate-fade-in space-y-5">
              <div className="font-body text-navy/60 text-sm text-center">צלם את אישור התשלום על מסך הלקוח</div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment"
                onChange={handleFileChange} className="hidden" />

              {!imagePreview ? (
                <button onClick={() => fileRef.current?.click()}
                  className="w-full h-52 rounded-2xl border-2 border-dashed border-navy/30 hover:border-gold hover:bg-gold/5 transition-all flex flex-col items-center justify-center gap-3 text-navy/40">
                  <span className="text-5xl">📸</span>
                  <div className="font-body text-sm">לחץ לצילום<br /><span className="text-xs">Tap to capture</span></div>
                </button>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border-2 border-gold shadow-md">
                  <img src={imagePreview} alt="payment proof" className="w-full max-h-72 object-cover" />
                  <button onClick={() => { setImageFile(null); setImagePreview(null); fileRef.current?.click() }}
                    className="absolute top-3 left-3 bg-black/60 text-white rounded-full px-3 py-1.5 text-xs font-body">
                    צלם שוב / Retake
                  </button>
                  <div className="absolute top-3 right-3 bg-green-500 text-white rounded-full px-3 py-1.5 text-xs font-body font-semibold">✓ צולם</div>
                </div>
              )}

              <button onClick={handleConfirm} disabled={!imageFile || confirming}
                className={`w-full py-5 rounded-2xl font-display font-bold text-lg shadow-md transition-all
                  ${imageFile && !confirming ? 'bg-gold text-navy hover:bg-gold/90 active:scale-95 double-border-gold' : 'bg-navy/10 text-navy/30 cursor-not-allowed'}`}>
                {confirming ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />
                    <span className="font-body text-base">שולח...</span>
                  </div>
                ) : (
                  <>
                    <div>אשר ושלח למטבח</div>
                    <div className={`text-sm font-body mt-0.5 ${imageFile ? 'text-navy/60' : 'text-navy/20'}`}>Confirm & Send to Kitchen</div>
                  </>
                )}
              </button>

              <button onClick={() => setStep('qr')}
                className="w-full py-3 rounded-xl border-2 border-navy/20 text-navy/60 font-body text-sm hover:border-navy/50 transition-colors">
                ← חזור לקוד QR
              </button>
            </div>
          )}

          {/* ── Step 3: Order number for customer ── */}
          {step === 'confirmation' && (
            <div className="animate-fade-in space-y-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-green-500 text-3xl font-bold">✓</span>
                </div>
                <p className="font-body text-green-700 font-semibold text-sm">ההזמנה נשלחה למטבח!</p>
                <p className="font-body text-navy/40 text-xs">Order sent to kitchen</p>
              </div>

              <div className="bg-white rounded-3xl border-4 border-navy shadow-xl p-8">
                <p className="font-body text-navy/40 text-xs uppercase tracking-widest mb-3">מספר הזמנה / Order Number</p>
                <div className="font-display font-black text-navy text-7xl tracking-widest leading-none">
                  {order.id.replace('YUU-', '')}
                </div>
                <div className="text-navy/30 font-body text-sm mt-1 tracking-widest">YUU</div>
                {order.customerName && (
                  <div className="mt-3 font-body font-semibold text-navy text-lg">{order.customerName}</div>
                )}
                <div className="mt-5 border-t-2 border-navy/10 pt-4 space-y-1.5">
                  {order.items.map(oi => {
                    const mi = menuItems.find(m => m.id === oi.menuItemId)
                    if (!mi) return null
                    return (
                      <div key={oi.menuItemId} className="flex justify-between text-sm font-body">
                        <span className="text-navy/50">₪{mi.price * oi.quantity}</span>
                        <span className="text-navy/70">{oi.quantity}× {mi.nameHe}</span>
                      </div>
                    )
                  })}
                  <div className="flex justify-between font-display font-bold text-navy text-base pt-2 border-t border-navy/10 mt-2">
                    <span>₪{order.totalPrice}</span>
                    <span>סה"כ</span>
                  </div>
                </div>
                <div className="mt-4 text-xs font-body text-navy/30">{typeLabel}</div>
              </div>

              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-right">
                <span className="text-3xl shrink-0">📸</span>
                <div>
                  <p className="font-body text-sm font-semibold text-amber-800">צלם את מספר ההזמנה לזכירה</p>
                  <p className="font-body text-xs text-amber-600 mt-0.5">Take a photo of your order number</p>
                </div>
              </div>

              <button onClick={() => navigate('/orders')}
                className="w-full py-4 rounded-2xl bg-navy text-cream font-display font-bold text-lg shadow-md hover:bg-navy/80 active:scale-95 transition-all">
                <div>סיום</div>
                <div className="text-cream/50 text-sm font-body mt-0.5">Done</div>
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
