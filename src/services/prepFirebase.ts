import {
  doc, setDoc, onSnapshot,
  collection, getDocs, writeBatch, getDoc,
  increment,
} from 'firebase/firestore'
import { getFirestoreDb } from './firebase'
import type { PrepEvent, PrepItem, PrepSnapshot, PrepShoppingGroup, PrepOwner, PrepPortion } from '../types/prep'

// ─── Subscriptions ────────────────────────────────────────────────────────────

export function subscribePrepEvents(cb: (events: PrepEvent[]) => void): () => void {
  const db = getFirestoreDb()
  if (!db) return () => {}
  return onSnapshot(
    collection(db, 'prepEvents'),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as PrepEvent))),
    err => console.error('Firestore prepEvents error:', err),
  )
}

export function subscribePrepEvent(eventId: string, cb: (event: PrepEvent | null) => void): () => void {
  const db = getFirestoreDb()
  if (!db) return () => {}
  return onSnapshot(
    doc(db, 'prepEvents', eventId),
    snap => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as PrepEvent) : null),
    err => console.error('Firestore prepEvent error:', err),
  )
}

export function subscribePrepItems(eventId: string, cb: (items: PrepItem[]) => void): () => void {
  const db = getFirestoreDb()
  if (!db) return () => {}
  return onSnapshot(
    collection(db, 'prepEvents', eventId, 'items'),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as PrepItem))),
    err => console.error('Firestore prepItems error:', err),
  )
}

// ─── Event CRUD ───────────────────────────────────────────────────────────────

export async function createPrepEvent(event: PrepEvent): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const clean = JSON.parse(JSON.stringify(event)) as PrepEvent
  await setDoc(doc(db, 'prepEvents', event.id), clean)
}

export async function updatePrepEvent(eventId: string, partial: Partial<PrepEvent>): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const clean = JSON.parse(JSON.stringify({ ...partial, updatedAt: new Date().toISOString() }))
  await setDoc(doc(db, 'prepEvents', eventId), clean, { merge: true })
}

export async function deletePrepEvent(eventId: string): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const itemsSnap = await getDocs(collection(db, 'prepEvents', eventId, 'items'))
  const batch = writeBatch(db)
  itemsSnap.docs.forEach(d => batch.delete(d.ref))
  batch.delete(doc(db, 'prepEvents', eventId))
  await batch.commit()
}

// ─── Item CRUD ────────────────────────────────────────────────────────────────

export async function setPrepItem(eventId: string, item: PrepItem): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const clean = JSON.parse(JSON.stringify({ ...item, updatedAt: new Date().toISOString() })) as PrepItem
  await setDoc(doc(db, 'prepEvents', eventId, 'items', item.id), clean)
}

export async function updatePrepItem(
  eventId: string,
  itemId: string,
  partial: Partial<PrepItem>,
): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const clean = JSON.parse(JSON.stringify({ ...partial, updatedAt: new Date().toISOString() }))
  await setDoc(doc(db, 'prepEvents', eventId, 'items', itemId), clean, { merge: true })
}

export async function deletePrepItem(eventId: string, itemId: string): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const batch = writeBatch(db)
  batch.delete(doc(db, 'prepEvents', eventId, 'items', itemId))
  batch.set(doc(db, 'prepEvents', eventId), { totalItems: increment(-1), updatedAt: new Date().toISOString() }, { merge: true })
  await batch.commit()
}

export async function checkPrepItem(
  eventId: string,
  itemId: string,
  done: boolean,
  doneBy: string | null,
): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const batch = writeBatch(db)
  batch.set(
    doc(db, 'prepEvents', eventId, 'items', itemId),
    { done, doneBy: done ? doneBy : null, doneAt: done ? new Date().toISOString() : null, updatedAt: new Date().toISOString() },
    { merge: true },
  )
  batch.set(
    doc(db, 'prepEvents', eventId),
    { doneItems: increment(done ? 1 : -1), updatedAt: new Date().toISOString() },
    { merge: true },
  )
  await batch.commit()
}

// ─── Add item (also increments totalItems) ────────────────────────────────────

export async function addPrepItem(eventId: string, item: PrepItem): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const clean = JSON.parse(JSON.stringify(item)) as PrepItem
  const batch = writeBatch(db)
  batch.set(doc(db, 'prepEvents', eventId, 'items', item.id), clean)
  batch.set(doc(db, 'prepEvents', eventId), { totalItems: increment(1), updatedAt: new Date().toISOString() }, { merge: true })
  await batch.commit()
}

// ─── Archive snapshot ─────────────────────────────────────────────────────────

export async function fetchPrepEventSnapshot(eventId: string): Promise<PrepSnapshot | null> {
  const db = getFirestoreDb()
  if (!db) return null
  const [eventSnap, itemsSnap] = await Promise.all([
    getDoc(doc(db, 'prepEvents', eventId)),
    getDocs(collection(db, 'prepEvents', eventId, 'items')),
  ])
  if (!eventSnap.exists()) return null
  const event = { id: eventSnap.id, ...eventSnap.data() } as PrepEvent
  const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PrepItem))
  return {
    prepEventId: eventId,
    prepEventName: event.name,
    shoppingGroups: event.shoppingGroups,
    owners: event.owners,
    portions: event.portions,
    items,
    notes: event.notes,
  }
}

export async function fetchAllPrepEvents(): Promise<PrepEvent[]> {
  const db = getFirestoreDb()
  if (!db) return []
  const snap = await getDocs(collection(db, 'prepEvents'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PrepEvent))
}

// ─── Duplicate with scaling ───────────────────────────────────────────────────

export async function duplicatePrepEvent(
  sourceEventId: string,
  newId: string,
  newName: string,
  newDate: string | null,
  scaleFactor: number,
  createdBy: string,
): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return

  const [eventSnap, itemsSnap] = await Promise.all([
    getDoc(doc(db, 'prepEvents', sourceEventId)),
    getDocs(collection(db, 'prepEvents', sourceEventId, 'items')),
  ])

  if (!eventSnap.exists()) throw new Error('Source event not found')
  const src = { id: eventSnap.id, ...eventSnap.data() } as PrepEvent
  const srcItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PrepItem))

  const now = new Date().toISOString()
  const scale = scaleFactor !== 1

  const newEvent: PrepEvent = {
    ...src,
    id: newId,
    name: newName,
    date: newDate,
    status: 'planning',
    notes: src.notes,
    totalItems: srcItems.length,
    doneItems: 0,
    createdAt: now,
    updatedAt: now,
    createdBy,
  }

  const newItems: PrepItem[] = srcItems.map(item => {
    let scaledQty = item.qty
    if (scale && item.qty !== null && item.kind === 'shop') {
      const parsed = parseFloat(item.qty)
      if (!isNaN(parsed) && item.qty.match(/^[\d.]+$/)) {
        // Pure numeric → scale
        const scaled = parsed * scaleFactor
        scaledQty = scaled % 1 === 0 ? String(Math.round(scaled)) : scaled.toFixed(2).replace(/\.?0+$/, '')
      } else {
        // Range or non-numeric → flag
        scaledQty = item.qty
      }
    }
    return {
      ...item,
      qty: scaledQty,
      note: scale && item.qty !== null && !item.qty.match(/^[\d.]+$/) && item.kind === 'shop'
        ? [item.note, 'בדוק כמות'].filter(Boolean).join(' — ')
        : item.note,
      done: false,
      doneBy: null,
      doneAt: null,
      createdAt: now,
      updatedAt: now,
    }
  })

  const batch = writeBatch(db)
  const clean = JSON.parse(JSON.stringify(newEvent)) as PrepEvent
  batch.set(doc(db, 'prepEvents', newId), clean)
  for (const item of newItems) {
    const cleanItem = JSON.parse(JSON.stringify(item)) as PrepItem
    batch.set(doc(db, 'prepEvents', newId, 'items', item.id), cleanItem)
  }
  await batch.commit()
}

// ─── Seed: פופ-אפ מקסיקני ─────────────────────────────────────────────────────

const SEED_ID = 'prep-mexican-popup'

export async function seedMexicanEvent(createdBy: string): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return

  const existing = await getDoc(doc(db, 'prepEvents', SEED_ID))
  if (existing.exists()) return // idempotent

  const now = new Date().toISOString()

  const shoppingGroups: PrepShoppingGroup[] = [
    { id: 'sg-1', title: 'הזמנה מספק', subtitle: 'מוצרים מקסיקניים', order: 0 },
    { id: 'sg-2', title: 'קניות כלליות', subtitle: 'ירקות, בשר ודגים', order: 1 },
    { id: 'sg-3', title: 'תבלינים ומזווה', order: 2 },
    { id: 'sg-4', title: 'קינוח', order: 3 },
    { id: 'sg-5', title: 'סיטונאי — אלכוהול', subtitle: 'בקבוקים של 700 מ״ל אלא אם צוין אחרת', order: 4 },
    { id: 'sg-6', title: 'קוקטיילים וקרח', order: 5 },
    { id: 'sg-7', title: 'שתייה קלה', order: 6 },
  ]

  const owners: PrepOwner[] = [
    { id: 'ow-1', name: 'אביעד', order: 0 },
    { id: 'ow-2', name: 'גיא', order: 1 },
    { id: 'ow-3', name: 'אורי', order: 2 },
    { id: 'ow-4', name: 'כולם', order: 3 },
  ]

  const portions: PrepPortion[] = [
    { id: 'po-1', name: 'בקר', qty: 170, order: 0 },
    { id: 'po-2', name: 'דג', qty: 140, order: 1 },
    { id: 'po-3', name: 'נאצ׳וס', qty: 60, order: 2 },
    { id: 'po-4', name: 'פטריות', qty: 40, order: 3 },
  ]

  type RawShopItem = { g: string; name: string; qty?: string; unit?: string; note?: string }
  const shopItemsRaw: RawShopItem[] = [
    // sg-1
    { g: 'sg-1', name: 'טורטיה 10',  qty: '700',  unit: 'יח׳' },
    { g: 'sg-1', name: 'טורטיה 12',  qty: '320',  unit: 'יח׳' },
    { g: 'sg-1', name: 'צ׳יפוטלה',   qty: '500',  unit: 'גרם' },
    { g: 'sg-1', name: 'אנצ׳ו',      qty: '500',  unit: 'גרם' },
    { g: 'sg-1', name: 'נאצ׳וס',     qty: '8',    unit: 'ק״ג' },
    { g: 'sg-1', name: 'פריחולס',    qty: '4',    unit: 'ק״ג' },
    { g: 'sg-1', name: 'חלפיניו',    qty: '3',    unit: 'ק״ג' },
    // sg-2
    { g: 'sg-2', name: 'אבוקדו',           qty: '15', unit: 'ק״ג' },
    { g: 'sg-2', name: 'בצל סגול',          qty: '28', unit: 'ק״ג' },
    { g: 'sg-2', name: 'בצל לבן',           qty: '5',  unit: 'ק״ג' },
    { g: 'sg-2', name: 'בשר (כתף / חזה)',   qty: '30', unit: 'ק״ג' },
    { g: 'sg-2', name: 'גרונות בשר',        qty: '4',  unit: 'ק״ג' },
    { g: 'sg-2', name: 'דג',                qty: '18', unit: 'ק״ג' },
    { g: 'sg-2', name: 'פטריות',            qty: '10', unit: 'ק״ג' },
    { g: 'sg-2', name: 'לימון',             qty: '5',  unit: 'ק״ג' },
    { g: 'sg-2', name: 'כוסברה',            qty: '2',  unit: 'ק״ג' },
    { g: 'sg-2', name: 'חומץ',              qty: '7',  unit: 'ליטר' },
    // sg-3
    { g: 'sg-3', name: 'ציפורן' },
    { g: 'sg-3', name: 'עלי דפנה' },
    { g: 'sg-3', name: 'כמון' },
    { g: 'sg-3', name: 'קינמון' },
    { g: 'sg-3', name: 'זרעי כוסברה' },
    { g: 'sg-3', name: 'סוכר' },
    { g: 'sg-3', name: 'פלפל שחור' },
    // sg-4
    { g: 'sg-4', name: 'שמנת 38%',       qty: '6',    unit: 'ליטר' },
    { g: 'sg-4', name: 'קורנפלקס',       qty: '1.7',  unit: 'ק״ג', note: '300 גרם למוס, 1.4 ק״ג לקראמבל' },
    { g: 'sg-4', name: 'שוקולד לבן',     qty: '1.3',  unit: 'ק״ג' },
    { g: 'sg-4', name: 'חמאת קקאו',      qty: '230',  unit: 'גרם' },
    { g: 'sg-4', name: 'מסקרפונה',       qty: '1.06', unit: 'ק״ג' },
    { g: 'sg-4', name: 'חמאה',           qty: '1.5',  unit: 'ק״ג' },
    { g: 'sg-4', name: 'סוכר דמררה',     qty: '1.02', unit: 'ק״ג' },
    { g: 'sg-4', name: 'אבקת חלב',       qty: '420',  unit: 'גרם' },
    { g: 'sg-4', name: 'פולנטה',         qty: '420',  unit: 'גרם' },
    // sg-5
    { g: 'sg-5', name: 'בירה',                    qty: '100', unit: 'פחיות/בקבוקים', note: 'קרלסברג / ליון, חצי ליטר' },
    { g: 'sg-5', name: 'יין לבן',                 qty: '4',   unit: 'בקבוקים' },
    { g: 'sg-5', name: 'יין אדום',                qty: '2',   unit: 'בקבוקים' },
    { g: 'sg-5', name: 'יין מבעבע / פרוסקו',     qty: '4',   unit: 'בקבוקים' },
    { g: 'sg-5', name: 'ג׳ין',                    qty: '4',   unit: 'בקבוקים' },
    { g: 'sg-5', name: 'טקילה',                   qty: '4',   unit: 'בקבוקים' },
    { g: 'sg-5', name: 'אפרול',                   qty: '2',   unit: 'בקבוקים' },
    { g: 'sg-5', name: 'ליקר תפוזים / טריפל סק', qty: '2',   unit: 'בקבוקים' },
    { g: 'sg-5', name: 'ערק / אוזו',              qty: '2',   unit: 'בקבוקים' },
    // sg-6
    { g: 'sg-6', name: 'מיץ לימון סחוט טרי', qty: '3.5',   unit: 'ליטר', note: 'או 8–10 ק״ג לימונים לסחיטה' },
    { g: 'sg-6', name: 'מי סודה',             qty: '4',     unit: 'בקבוקים', note: '1.5 ליטר' },
    { g: 'sg-6', name: 'סוכר לבן',            qty: '2',     unit: 'ק״ג', note: 'לסירופ סוכר' },
    { g: 'sg-6', name: 'קרח',                 qty: '15–20', unit: 'ק״ג' },
    // sg-7
    { g: 'sg-7', name: 'פחיות שתייה קלה', qty: '80–100', unit: 'פחיות', note: 'קולה, זירו, ספרייט וכו׳' },
  ]

  type RawTask = { owner: string; name: string }
  const tasksRaw: RawTask[] = [
    { owner: 'ow-1', name: 'הדפסת פוסטרים באוניברסיטה' },
    { owner: 'ow-1', name: 'בשר' },
    { owner: 'ow-1', name: 'מערכת קופה: איפוס ובדיקות' },
    { owner: 'ow-1', name: 'הדרכת צוות' },
    { owner: 'ow-1', name: 'טוסטר אובן או פתרון חימום אחר' },
    { owner: 'ow-2', name: 'תליית פוסטרים' },
    { owner: 'ow-2', name: 'שיווק' },
    { owner: 'ow-2', name: 'סגירה מול בעלי מלאכה' },
    { owner: 'ow-2', name: 'וידוא צ׳ק ליסט' },
    { owner: 'ow-2', name: 'לדבר עם הצינור' },
    { owner: 'ow-2', name: 'לדבר עם דורון על ציוד מטבח' },
    { owner: 'ow-3', name: 'רשימת חד״פים + הזמנות' },
    { owner: 'ow-4', name: 'קניות (לפי לשונית הקניות)' },
  ]

  const allItems: PrepItem[] = []

  shopItemsRaw.forEach((raw, idx) => {
    const groupItems = shopItemsRaw.filter(r => r.g === raw.g)
    const orderInGroup = groupItems.indexOf(raw)
    allItems.push({
      id: `si-${idx + 1}`,
      kind: 'shop',
      groupId: raw.g,
      name: raw.name,
      qty: raw.qty ?? null,
      unit: raw.unit ?? null,
      note: raw.note ?? null,
      order: orderInGroup,
      done: false,
      doneBy: null,
      doneAt: null,
      createdAt: now,
      updatedAt: now,
    })
  })

  tasksRaw.forEach((raw, idx) => {
    const ownerTasks = tasksRaw.filter(r => r.owner === raw.owner)
    const orderInOwner = ownerTasks.indexOf(raw)
    allItems.push({
      id: `ti-${idx + 1}`,
      kind: 'task',
      groupId: raw.owner,
      name: raw.name,
      qty: null,
      unit: null,
      note: null,
      order: orderInOwner,
      done: false,
      doneBy: null,
      doneAt: null,
      createdAt: now,
      updatedAt: now,
    })
  })

  const event: PrepEvent = {
    id: SEED_ID,
    name: 'פופ-אפ מקסיקני',
    date: null,
    status: 'planning',
    notes: 'בדיקת יחס: 1,020 טורטיות ל־290 מנות טאקו (≈3.5 למנה). דג ≈130 גרם למנה, בקר ≈200 גרם למנה, פטריות 250 גרם למנה (גבוה — לוודא).',
    shoppingGroups,
    owners,
    portions,
    totalItems: allItems.length,
    doneItems: 0,
    createdAt: now,
    updatedAt: now,
    createdBy,
  }

  const batch = writeBatch(db)
  batch.set(doc(db, 'prepEvents', SEED_ID), JSON.parse(JSON.stringify(event)))
  for (const item of allItems) {
    batch.set(doc(db, 'prepEvents', SEED_ID, 'items', item.id), JSON.parse(JSON.stringify(item)))
  }
  await batch.commit()
}
