import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getFirestore,
  doc, getDoc, setDoc, deleteDoc, onSnapshot,
  collection, getDocs, writeBatch, runTransaction,
  type Firestore,
} from 'firebase/firestore'
import type { AppSettings, MenuItem, Order } from '../types'

const cfg = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const ENABLED = Object.values(cfg).every(Boolean)

let _app: FirebaseApp | null = null
let _db: Firestore | null = null

if (ENABLED) {
  _app = initializeApp(cfg)
  _db = getFirestore(_app)
}

export const FIREBASE_ENABLED = ENABLED

// ── Settings ─────────────────────────────────────────────────────────────────

export function pushSettings(settings: AppSettings): void {
  if (!_db) return
  setDoc(doc(_db, 'app', 'settings'), settings).catch(console.error)
}

export function subscribeSettings(onUpdate: (s: AppSettings) => void): () => void {
  if (!_db) return () => {}
  return onSnapshot(
    doc(_db, 'app', 'settings'),
    snap => { if (snap.exists()) onUpdate(snap.data() as AppSettings) },
    err  => console.error('Firestore settings error:', err),
  )
}

// ── Menu ──────────────────────────────────────────────────────────────────────

export function pushMenu(items: MenuItem[]): void {
  if (!_db) return
  setDoc(doc(_db, 'app', 'menu'), { items }).catch(console.error)
}

export function subscribeMenu(onUpdate: (items: MenuItem[]) => void): () => void {
  if (!_db) return () => {}
  return onSnapshot(
    doc(_db, 'app', 'menu'),
    snap => { if (snap.exists()) onUpdate((snap.data().items ?? []) as MenuItem[]) },
    err  => console.error('Firestore menu error:', err),
  )
}

// ── Orders ────────────────────────────────────────────────────────────────────

export function pushOrder(order: Order): void {
  if (!_db) return
  // Firestore rejects undefined values — strip them via JSON round-trip
  const clean = JSON.parse(JSON.stringify(order)) as Order
  setDoc(doc(_db, 'orders', order.id), clean).catch(console.error)
}

export function subscribeOrders(onUpdate: (orders: Order[]) => void): () => void {
  if (!_db) return () => {}
  return onSnapshot(
    collection(_db, 'orders'),
    snap => onUpdate(snap.docs.map(d => d.data() as Order)),
    err  => console.error('Firestore orders error:', err),
  )
}

export async function deleteOrderDoc(id: string): Promise<void> {
  if (!_db) return
  await deleteDoc(doc(_db, 'orders', id))
}

export async function clearOrders(): Promise<void> {
  if (!_db) return
  const snap = await getDocs(collection(_db, 'orders'))
  if (snap.empty) return
  const batch = writeBatch(_db)
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
}

// ── Initial fetch (call on startup before showing the app) ────────────────────

export async function fetchInitialData(): Promise<{
  settings: AppSettings | null
  menu:     MenuItem[]   | null
  orders:   Order[]
}> {
  if (!_db) return { settings: null, menu: null, orders: [] }
  const [settingsSnap, menuSnap, ordersSnap] = await Promise.all([
    getDoc(doc(_db, 'app', 'settings')),
    getDoc(doc(_db, 'app', 'menu')),
    getDocs(collection(_db, 'orders')),
  ])
  return {
    settings: settingsSnap.exists() ? (settingsSnap.data() as AppSettings) : null,
    menu:     menuSnap.exists()     ? ((menuSnap.data().items ?? []) as MenuItem[]) : null,
    orders:   ordersSnap.docs.map(d => d.data() as Order),
  }
}

// ── Order ID counter (atomic, prevents collision on multi-device) ─────────────

export async function reserveOrderId(localMax: number): Promise<string> {
  if (!_db) return `YUU-${String(localMax + 1).padStart(4, '0')}`
  const counterRef = doc(_db, 'meta', 'orderCounter')
  let num = localMax + 1
  await runTransaction(_db, async (tx) => {
    const snap = await tx.get(counterRef)
    const serverCount = snap.exists() ? (snap.data().count as number) : 0
    num = Math.max(localMax, serverCount) + 1
    tx.set(counterRef, { count: num })
  })
  return `YUU-${String(num).padStart(4, '0')}`
}

export async function resetOrderCounter(): Promise<void> {
  if (!_db) return
  await setDoc(doc(_db, 'meta', 'orderCounter'), { count: 0 })
}
