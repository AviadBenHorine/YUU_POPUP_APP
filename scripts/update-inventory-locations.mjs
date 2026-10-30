// Update all inventory item locations to "מחסן אצל אורי"
// Run: node scripts/update-inventory-locations.mjs

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim()))
)

const db = getFirestore(initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
}))

const snap = await getDocs(collection(db, 'inventoryItems'))
const batch = writeBatch(db)
snap.docs.forEach(d => batch.update(doc(db, 'inventoryItems', d.id), { location: 'מחסן אצל אורי', updatedAt: new Date().toISOString() }))
await batch.commit()
console.log(`✅ Updated ${snap.size} items → מחסן אצל אורי`)
process.exit(0)
