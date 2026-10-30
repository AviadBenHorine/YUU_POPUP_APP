import {
  doc, setDoc, onSnapshot, deleteDoc,
  collection, getDocs, writeBatch,
} from 'firebase/firestore'
import { getFirestoreDb } from './firebase'
import type { InventoryCategory, InventoryItem } from '../types/inventory'

export const DEFAULT_CATEGORIES: InventoryCategory[] = [
  { id: 'disposables', name: 'חד"פ',           icon: '🥡', order: 0 },
  { id: 'alcohol',     name: 'אלכוהול ושתייה',  icon: '🍷', order: 1 },
  { id: 'canned',      name: 'מזון משומר',       icon: '🥫', order: 2 },
  { id: 'dry',         name: 'יבש',              icon: '🌾', order: 3 },
  { id: 'fresh',       name: 'טרי',              icon: '🥬', order: 4 },
  { id: 'equipment',   name: 'ציוד',             icon: '🔧', order: 5 },
]

// ─── Categories ───────────────────────────────────────────────────────────────

export function subscribeInventoryCategories(cb: (cats: InventoryCategory[]) => void): () => void {
  const db = getFirestoreDb()
  if (!db) { cb(DEFAULT_CATEGORIES); return () => {} }
  return onSnapshot(
    collection(db, 'inventoryCategories'),
    snap => cb(snap.empty ? DEFAULT_CATEGORIES : snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryCategory))),
    err => console.error('inventoryCategories error:', err),
  )
}

export async function saveInventoryCategory(cat: InventoryCategory): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  await setDoc(doc(db, 'inventoryCategories', cat.id), cat)
}

export async function deleteInventoryCategory(catId: string): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  await deleteDoc(doc(db, 'inventoryCategories', catId))
}

export async function seedDefaultCategories(): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const batch = writeBatch(db)
  DEFAULT_CATEGORIES.forEach(cat => batch.set(doc(db, 'inventoryCategories', cat.id), cat))
  await batch.commit()
}

// ─── Items ────────────────────────────────────────────────────────────────────

export function subscribeInventoryItems(cb: (items: InventoryItem[]) => void): () => void {
  const db = getFirestoreDb()
  if (!db) { cb([]); return () => {} }
  return onSnapshot(
    collection(db, 'inventoryItems'),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem))),
    err => console.error('inventoryItems error:', err),
  )
}

export async function saveInventoryItem(item: InventoryItem): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const clean = JSON.parse(JSON.stringify({ ...item, updatedAt: new Date().toISOString() }))
  await setDoc(doc(db, 'inventoryItems', item.id), clean)
}

export async function updateInventoryItemQty(itemId: string, qty: number): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  await setDoc(doc(db, 'inventoryItems', itemId), { qty, updatedAt: new Date().toISOString() }, { merge: true })
}

export async function deleteInventoryItem(itemId: string): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  await deleteDoc(doc(db, 'inventoryItems', itemId))
}

export async function deleteInventoryItemsByCategory(catId: string): Promise<void> {
  const db = getFirestoreDb()
  if (!db) return
  const snap = await getDocs(collection(db, 'inventoryItems'))
  const toDelete = snap.docs.filter(d => d.data().categoryId === catId)
  if (toDelete.length === 0) return
  const batch = writeBatch(db)
  toDelete.forEach(d => batch.delete(d.ref))
  await batch.commit()
}
