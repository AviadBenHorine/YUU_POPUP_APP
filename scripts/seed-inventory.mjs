// Seed inventory: alcohol & drinks initial stock
// Run: node scripts/seed-inventory.mjs

import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, writeBatch, collection, getDocs } from 'firebase/firestore'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

const envPath = resolve(__dir, '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => l.split('=').map(s => s.trim()))
)

const app = initializeApp({
  apiKey:            env.VITE_FIREBASE_API_KEY,
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.VITE_FIREBASE_APP_ID,
})
const db = getFirestore(app)

const now = new Date().toISOString()

// ── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'disposables', name: 'חד"פ',           icon: '🥡', order: 0 },
  { id: 'alcohol',     name: 'אלכוהול ושתייה',  icon: '🍷', order: 1 },
  { id: 'canned',      name: 'מזון משומר',       icon: '🥫', order: 2 },
  { id: 'dry',         name: 'יבש',              icon: '🌾', order: 3 },
  { id: 'fresh',       name: 'טרי',              icon: '🥬', order: 4 },
  { id: 'equipment',   name: 'ציוד',             icon: '🔧', order: 5 },
]

// ── Items ─────────────────────────────────────────────────────────────────────

const ITEMS = [
  // Spirits
  { name: 'ערק',           qty: 3.5, unit: 'בקבוקים', location: 'בר' },
  { name: 'אוזו',          qty: 2,   unit: 'בקבוקים', location: 'בר' },
  { name: 'גין',           qty: 4,   unit: 'בקבוקים', location: 'בר' },
  { name: 'טקילה',         qty: 2,   unit: 'בקבוקים', location: 'בר' },
  { name: 'פרוסקו',        qty: 4,   unit: 'בקבוקים', location: 'בר' },
  { name: 'אפרול',         qty: 2,   unit: 'בקבוקים', location: 'בר' },
  { name: 'יין לבן',       qty: 4,   unit: 'בקבוקים', location: 'בר' },
  { name: 'יין אדום',      qty: 3,   unit: 'בקבוקים', location: 'בר' },
  { name: 'טריפל סק',      qty: 2,   unit: 'בקבוקים', location: 'בר' },
  // Beer crates
  { name: 'לאון',          qty: 3,   unit: 'בקבוקים', location: 'מחסן ראשי' },
  { name: 'קרלסברג',       qty: 1.5, unit: 'בקבוקים', location: 'מחסן ראשי' },
  { name: 'טובורג',        qty: 1,   unit: 'בקבוקים', location: 'מחסן ראשי' },
  // Soft drinks
  { name: 'מים קטן',       qty: 48,  unit: 'בקבוקים', location: 'מחסן ראשי' },
  { name: 'קולה',          qty: 24,  unit: 'פחיות',   location: 'מחסן ראשי' },
  { name: 'זירו',          qty: 48,  unit: 'פחיות',   location: 'מחסן ראשי' },
  { name: 'סודה',          qty: 24,  unit: 'בקבוקים', location: 'מחסן ראשי' },
].map((item, i) => ({
  id: `inv_alcohol_${i}`,
  categoryId: 'alcohol',
  minQty: 0,
  note: '',
  order: i,
  updatedAt: now,
  ...item,
}))

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  // Check if these specific items were already seeded
  const existingSnap = await getDocs(collection(db, 'inventoryItems'))
  const existingIds = new Set(existingSnap.docs.map(d => d.id))
  const alreadySeeded = ITEMS.every(item => existingIds.has(item.id))
  if (alreadySeeded) {
    console.log('⚠️  Items already seeded — nothing to do.')
    process.exit(0)
  }

  // Seed categories
  const catBatch = writeBatch(db)
  for (const cat of CATEGORIES) {
    catBatch.set(doc(db, 'inventoryCategories', cat.id), cat)
  }
  await catBatch.commit()
  console.log(`✅ Seeded ${CATEGORIES.length} categories`)

  // Seed items (batch write)
  const itemBatch = writeBatch(db)
  for (const item of ITEMS) {
    itemBatch.set(doc(db, 'inventoryItems', item.id), item)
  }
  await itemBatch.commit()
  console.log(`✅ Seeded ${ITEMS.length} inventory items`)

  console.log('\nDone! Open /inventory to see the stock.')
  process.exit(0)
}

seed().catch(err => { console.error(err); process.exit(1) })
