import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'

const DB_NAME = 'yuu_images'
const STORE = 'payment_proofs'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE)
      },
    })
  }
  return dbPromise
}

export async function saveImage(key: string, blob: Blob): Promise<void> {
  const db = await getDB()
  await db.put(STORE, blob, key)
}

export async function getImage(key: string): Promise<string | null> {
  try {
    const db = await getDB()
    const blob = await db.get(STORE, key)
    if (!blob) return null
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

export async function deleteImage(key: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE, key)
}
