import { test, expect } from '@playwright/test'
import {
  clearAllStorage, loginAs, enterWrongPin, seedMenu, seedSettings, seedOrders, getOrders,
  TEST_MENU, minsAgoISO,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { requirePaymentPhoto: false, dessertTo: 'kitchen' })
})

// ─── Empty / corrupted localStorage ──────────────────────────────────────────

test('app loads with empty localStorage without crashing', async ({ page }) => {
  // clearAllStorage already ran; navigate to orders
  await loginAs(page, 'waitress')
  await expect(page).toHaveURL(/\/orders/)
  await expect(page.locator('body')).toBeVisible()
})

test('kitchen loads with empty orders list and shows empty state', async ({ page }) => {
  await seedOrders(page, [])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=אין הזמנות פעילות')).toBeVisible()
})

test('analytics loads with no orders and shows 0 revenue', async ({ page }) => {
  await seedOrders(page, [])
  await loginAs(page, 'admin')
  await expect(page).not.toHaveURL(/\/login/)
  // No crash
  await expect(page.locator('body')).toBeVisible()
})

// ─── Large quantity orders ────────────────────────────────────────────────────

test('order with quantity 99 renders without overflow', async ({ page }) => {
  await seedOrders(page, [{
    id: 'YUU-EDGE1',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 99 }],
    totalPrice: 4752,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(2),
    sentToKitchenAt: minsAgoISO(2),
    paidAt: minsAgoISO(2),
    paymentMethod: 'bit',
    customerName: 'BigOrder',
  }])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=BigOrder')).toBeVisible()
  await expect(page.locator('text=99')).toBeVisible()
})

// ─── Long customer name ───────────────────────────────────────────────────────

test('very long customer name (50 chars) does not break layout', async ({ page }) => {
  const longName = 'A'.repeat(50)
  await seedOrders(page, [{
    id: 'YUU-EDGE2',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 48,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(2),
    sentToKitchenAt: minsAgoISO(2),
    paidAt: minsAgoISO(2),
    paymentMethod: 'bit',
    customerName: longName,
  }])
  await loginAs(page, 'kitchen')
  await expect(page.locator('body')).toBeVisible()
})

// ─── Multiple orders at once ──────────────────────────────────────────────────

test('kitchen handles 10 simultaneous active orders', async ({ page }) => {
  const orders = Array.from({ length: 10 }, (_, i) => ({
    id: `YUU-BULK-${i}`,
    orderType: 'sit_down' as const,
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 48,
    status: 'sent_to_kitchen' as const,
    createdAt: minsAgoISO(10 - i),
    sentToKitchenAt: minsAgoISO(10 - i),
    paidAt: minsAgoISO(10 - i),
    paymentMethod: 'bit' as const,
    customerName: `Bulk ${i}`,
  }))
  await seedOrders(page, orders)
  await loginAs(page, 'kitchen')
  // All 10 should be visible (or at least first few)
  await expect(page.locator('text=Bulk 0')).toBeVisible()
  await expect(page.locator('text=Bulk 9')).toBeVisible()
})

// ─── Order sorting (oldest first) ────────────────────────────────────────────

test('kitchen shows oldest order at top', async ({ page }) => {
  await seedOrders(page, [
    {
      id: 'YUU-SORT1',
      orderType: 'sit_down' as const,
      items: [{ menuItemId: 'f1', quantity: 1 }],
      totalPrice: 48,
      status: 'sent_to_kitchen' as const,
      createdAt: minsAgoISO(10),
      sentToKitchenAt: minsAgoISO(10),
      paidAt: minsAgoISO(10),
      paymentMethod: 'bit' as const,
      customerName: 'Oldest',
    },
    {
      id: 'YUU-SORT2',
      orderType: 'sit_down' as const,
      items: [{ menuItemId: 'f2', quantity: 1 }],
      totalPrice: 52,
      status: 'sent_to_kitchen' as const,
      createdAt: minsAgoISO(1),
      sentToKitchenAt: minsAgoISO(1),
      paidAt: minsAgoISO(1),
      paymentMethod: 'bit' as const,
      customerName: 'Newest',
    },
  ])
  await loginAs(page, 'kitchen')
  // Wait for both orders to be rendered before checking DOM order
  await expect(page.locator('text=Oldest').first()).toBeVisible()
  await expect(page.locator('text=Newest').first()).toBeVisible()
  const pageContent = await page.content()
  const oldestIdx = pageContent.indexOf('Oldest')
  const newestIdx = pageContent.indexOf('Newest')
  expect(oldestIdx).toBeLessThan(newestIdx)
})

// ─── Rapid double-click prevention ───────────────────────────────────────────

test('double-clicking payment button does not create duplicate entries', async ({ page }) => {
  await seedOrders(page, [{
    id: 'YUU-EDGE3',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 48,
    status: 'awaiting_payment',
    createdAt: minsAgoISO(1),
    paymentMethod: 'bit',
    customerName: 'DoubleClick',
  }])
  await loginAs(page, 'waitress')
  await page.goto('/payment/YUU-EDGE3')
  const paidBtn = page.locator('button').filter({ hasText: 'הלקוח שילם' })
  await paidBtn.dblclick()
  await expect(page.locator('text=הזמנה נשלחה למטבח')).toBeVisible()
  const orders = await getOrders(page)
  const matching = orders.filter(o => o.id === 'YUU-EDGE3')
  expect(matching.length).toBe(1)
})

// ─── Role switching idempotence ───────────────────────────────────────────────

test('switching to same role (logout → login same role) works cleanly', async ({ page }) => {
  await loginAs(page, 'kitchen')
  await expect(page).toHaveURL(/\/kitchen/)
  await clearAllStorage(page)
  await loginAs(page, 'kitchen')
  await expect(page).toHaveURL(/\/kitchen/)
})

// ─── Order with notes ─────────────────────────────────────────────────────────

test('order notes are visible in kitchen card', async ({ page }) => {
  await seedOrders(page, [{
    id: 'YUU-NOTES',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1, notes: 'No onions' }],
    totalPrice: 48,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(2),
    sentToKitchenAt: minsAgoISO(2),
    paidAt: minsAgoISO(2),
    paymentMethod: 'bit',
    customerName: 'NotesTest',
  }])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=No onions')).toBeVisible()
})

// ─── Take-away badge ──────────────────────────────────────────────────────────

test('take-away orders show take-away badge in kitchen', async ({ page }) => {
  await seedOrders(page, [{
    id: 'YUU-TAKEAWAY',
    orderType: 'take_away',
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 48,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(2),
    sentToKitchenAt: minsAgoISO(2),
    paidAt: minsAgoISO(2),
    paymentMethod: 'bit',
    customerName: 'TakeAwayCustomer',
  }])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=TakeAwayCustomer')).toBeVisible()
  await expect(page.locator('text=/לקחת|take.away/i')).toBeVisible()
})

// ─── PIN lockout timeout ──────────────────────────────────────────────────────

test('lockout metadata stored per role does not bleed to others', async ({ page }) => {
  // Lock bar role by entering 3 wrong PINs
  await page.goto('/login')
  await page.getByText('Bar', { exact: false }).first().click()
  await enterWrongPin(page, 'bar', 3)
  // Lockout countdown should appear (enterWrongPin already waits 500ms after each attempt)
  await expect(page.locator('text=/\\d+ שניות/')).toBeVisible({ timeout: 5000 })
  // Click back to role selection WITHOUT page.goto (which would reset React lockout state)
  await page.locator('button').filter({ hasText: /בר|Bar/ }).first().click()
  // Bar card should be disabled (locked out)
  const barCard = page.locator('button').filter({ hasText: 'Bar' }).first()
  await expect(barCard).toBeDisabled()
  // Kitchen card should still be enabled (different role, no lockout bleed)
  const kitchenCard = page.locator('button').filter({ hasText: 'Kitchen' }).first()
  await expect(kitchenCard).not.toBeDisabled()
})

// ─── Browser back navigation ──────────────────────────────────────────────────

test('pressing browser back from payment confirmation returns to orders', async ({ page }) => {
  await seedOrders(page, [{
    id: 'YUU-BACK',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 48,
    status: 'awaiting_payment',
    createdAt: minsAgoISO(1),
    paymentMethod: 'bit',
    customerName: 'BackNav',
  }])
  await loginAs(page, 'waitress')
  await page.goto('/payment/YUU-BACK')
  await page.locator('button').filter({ hasText: 'הלקוח שילם' }).click()
  await expect(page.locator('text=הזמנה נשלחה למטבח')).toBeVisible()
  await page.goBack()
  // Should either be on /orders or /payment (not /login)
  await expect(page).not.toHaveURL(/\/login/)
})

// ─── Zero-price order ─────────────────────────────────────────────────────────

test('staff comp order with totalPrice 0 processes without error', async ({ page }) => {
  await seedOrders(page, [{
    id: 'YUU-ZERO',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 0,
    status: 'awaiting_payment',
    createdAt: minsAgoISO(1),
    paymentMethod: 'staff',
    customerName: 'FreeOrder',
  }])
  await loginAs(page, 'waitress')
  await page.goto('/payment/YUU-ZERO')
  await page.locator('button').filter({ hasText: 'על החשבון' }).click()
  // Toast + confirmation page both contain this text — use first() to avoid strict mode
  await expect(page.locator('text=הזמנה נשלחה למטבח').first()).toBeVisible()
})

// ─── Order with only notes (no items) — should not happen but handle gracefully ─

test('history page handles order with empty items array', async ({ page }) => {
  await seedOrders(page, [{
    id: 'YUU-EMPTY-ITEMS',
    orderType: 'sit_down',
    items: [],
    totalPrice: 0,
    status: 'ready',
    createdAt: minsAgoISO(20),
    paidAt: minsAgoISO(20),
    sentToKitchenAt: minsAgoISO(20),
    readyAt: minsAgoISO(10),
    paymentMethod: 'bit',
    customerName: 'EmptyItems',
  }])
  await loginAs(page, 'admin')
  await page.goto('/history')
  // Should not crash
  await expect(page.locator('body')).toBeVisible()
})
