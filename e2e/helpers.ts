import type { Page } from '@playwright/test'

// ─── Storage ────────────────────────────────────────────────────────────────

export async function clearAllStorage(page: Page) {
  await page.evaluate(async () => {
    localStorage.clear()
    sessionStorage.clear()
    // Wipe IndexedDB yuu_images
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('yuu_images')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      req.onblocked = () => resolve() // proceed even if blocked
    })
  })
}

// ─── Auth ────────────────────────────────────────────────────────────────────

const PINS: Record<string, string> = {
  admin: '0000',
  waitress: '1111',
  kitchen: '2222',
  bar: '3333',
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  waitress: 'Orders',
  kitchen: 'Kitchen',
  bar: 'Bar',
}

export async function loginAs(page: Page, role: 'admin' | 'waitress' | 'kitchen' | 'bar') {
  await page.goto('/login')
  await page.getByText(ROLE_LABELS[role], { exact: false }).first().click()
  const pin = PINS[role]
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).first().click()
  }
  // Wait for navigation away from /login
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 5000 })
}

export async function enterWrongPin(page: Page, role: 'admin' | 'waitress' | 'kitchen' | 'bar', times = 1) {
  const wrongPin = PINS[role] === '9999' ? '8888' : '9999'
  for (let i = 0; i < times; i++) {
    for (const digit of wrongPin) {
      await page.getByRole('button', { name: digit, exact: true }).first().click()
    }
    // Wait for shake animation / PIN to clear
    await page.waitForTimeout(700)
  }
}

// ─── Data Seeding ────────────────────────────────────────────────────────────

export interface SeedMenuItem {
  id: string
  name: string
  nameHe: string
  category: 'food' | 'drink' | 'dessert'
  price: number
  emoji?: string
  available: boolean
}

export interface SeedOrder {
  id: string
  orderType: 'sit_down' | 'take_away'
  items: { menuItemId: string; quantity: number; notes?: string }[]
  totalPrice: number
  status: 'open' | 'awaiting_payment' | 'paid' | 'sent_to_kitchen' | 'ready' | 'cancelled'
  createdAt: string
  paidAt?: string
  sentToKitchenAt?: string
  readyAt?: string
  kitchenDoneAt?: string
  barDoneAt?: string
  paymentMethod: 'bit' | 'staff'
  customerName?: string
  checkedItems?: Record<string, boolean>
  paymentProofImageKey?: string
}

export async function seedMenu(page: Page, items: SeedMenuItem[]) {
  await page.evaluate((data) => {
    localStorage.setItem('yuu_menu', JSON.stringify(data))
  }, items)
}

export async function seedOrders(page: Page, orders: SeedOrder[]) {
  await page.evaluate((data) => {
    localStorage.setItem('yuu_orders', JSON.stringify(data))
  }, orders)
}

export async function seedSettings(page: Page, settings: Record<string, unknown>) {
  await page.evaluate((data) => {
    const defaults = {
      bitQR1: '/qr1.jpeg', bitQR2: '', bitQR3: '',
      activeQRSlot: 1,
      stockQuantities: {},
      pins: { admin: '0000', waitress: '1111', kitchen: '2222', bar: '3333' },
      dessertTo: 'kitchen',
      requirePaymentPhoto: false,
    }
    localStorage.setItem('yuu_settings', JSON.stringify({ ...defaults, ...data }))
  }, settings)
}

// ─── State Readers ───────────────────────────────────────────────────────────

export async function getOrders(page: Page): Promise<SeedOrder[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('yuu_orders')
    return raw ? JSON.parse(raw) : []
  })
}

export async function getSettings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('yuu_settings')
    return raw ? JSON.parse(raw) : {}
  })
}

export async function getMenu(page: Page): Promise<SeedMenuItem[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('yuu_menu')
    return raw ? JSON.parse(raw) : []
  })
}

// ─── Default test menu ───────────────────────────────────────────────────────

export const TEST_MENU: SeedMenuItem[] = [
  { id: 'f1', name: 'Tacos al Pastor',    nameHe: 'טאקו אל פסטור',    category: 'food',    price: 48, emoji: '🌮', available: true },
  { id: 'f2', name: 'Fish Tacos',         nameHe: 'טאקו דג',           category: 'food',    price: 52, emoji: '🐟', available: true },
  { id: 'f3', name: 'Mushroom Quesadilla',nameHe: 'קסדיה פטריות',      category: 'food',    price: 44, emoji: '🫓', available: true },
  { id: 'f4', name: 'Chicken Tostada',    nameHe: 'טוסטדה עוף',        category: 'food',    price: 46, emoji: '🍗', available: true },
  { id: 'f5', name: 'Elote',              nameHe: 'אלוטה תירס',        category: 'food',    price: 28, emoji: '🌽', available: true },
  { id: 'f6', name: 'Guacamole & Chips',  nameHe: 'גואקמולה ונאצ׳וס',  category: 'food',    price: 32, emoji: '🥑', available: true },
  { id: 'd1', name: 'Agua de Jamaica',    nameHe: 'תה היביסקוס קר',    category: 'drink',   price: 18, emoji: '🌺', available: true },
  { id: 'd2', name: 'Horchata',           nameHe: 'הורצ׳טה',            category: 'drink',   price: 20, emoji: '🥛', available: true },
  { id: 'd3', name: 'Michelada',          nameHe: 'מיצ׳לדה',            category: 'drink',   price: 32, emoji: '🍺', available: true },
  { id: 'ds1', name: 'Churros',           nameHe: 'צ׳ורוס',             category: 'dessert', price: 24, emoji: '🍩', available: true },
  { id: 'ds2', name: 'Tres Leches',       nameHe: 'עוגת טרס לצ׳ס',     category: 'dessert', price: 28, emoji: '🍰', available: true },
]

// ─── Today helper ────────────────────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function hoursAgoISO(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString()
}

export function minsAgoISO(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString()
}

// ─── Order builders ──────────────────────────────────────────────────────────

export function makeFoodOnlyOrder(id: string, overrides: Partial<SeedOrder> = {}): SeedOrder {
  return {
    id,
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1 }, { menuItemId: 'f2', quantity: 1 }],
    totalPrice: 100,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(3),
    sentToKitchenAt: minsAgoISO(3),
    paidAt: minsAgoISO(3),
    paymentMethod: 'bit',
    customerName: 'Test Customer',
    ...overrides,
  }
}

export function makeDrinkOnlyOrder(id: string, overrides: Partial<SeedOrder> = {}): SeedOrder {
  return {
    id,
    orderType: 'sit_down',
    items: [{ menuItemId: 'd1', quantity: 2 }],
    totalPrice: 36,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(2),
    sentToKitchenAt: minsAgoISO(2),
    paidAt: minsAgoISO(2),
    paymentMethod: 'bit',
    customerName: 'Drinks Only',
    ...overrides,
  }
}

export function makeMixedOrder(id: string, overrides: Partial<SeedOrder> = {}): SeedOrder {
  return {
    id,
    orderType: 'sit_down',
    items: [
      { menuItemId: 'f1', quantity: 1 },
      { menuItemId: 'd1', quantity: 1 },
    ],
    totalPrice: 66,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(4),
    sentToKitchenAt: minsAgoISO(4),
    paidAt: minsAgoISO(4),
    paymentMethod: 'bit',
    customerName: 'Mixed Order',
    ...overrides,
  }
}
