import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getFirestore,
  doc, setDoc, onSnapshot,
  collection, getDocs, deleteDoc, writeBatch,
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
console.log('[Firebase]', ENABLED ? '✅ connected to ' + cfg.projectId : '❌ not configured')

// ── Settings ────────────────────────────────────────────────────────────────

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

// ── Menu ─────────────────────────────────────────────────────────────────────

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

// ── Orders ───────────────────────────────────────────────────────────────────

export function pushOrder(order: Order): void {
  if (!_db) return
  setDoc(doc(_db, 'orders', order.id), order).catch(console.error)
}

export function subscribeOrders(onUpdate: (orders: Order[]) => void): () => void {
  if (!_db) return () => {}
  return onSnapshot(
    collection(_db, 'orders'),
    snap => onUpdate(snap.docs.map(d => d.data() as Order)),
    err  => console.error('Firestore orders error:', err),
  )
}

export async function clearOrders(): Promise<void> {
  if (!_db) return
  const snap = await getDocs(collection(_db, 'orders'))
  if (snap.empty) return
  const batch = writeBatch(_db)
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
}
