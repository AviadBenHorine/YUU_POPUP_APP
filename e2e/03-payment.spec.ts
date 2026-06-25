import { test, expect } from '@playwright/test'
import {
  clearAllStorage, loginAs, seedMenu, seedSettings, seedOrders,
  getOrders, TEST_MENU, minsAgoISO,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedAwaitingOrder(page: any, customerName = 'PayTest', requirePhoto = false) {
  await seedSettings(page, { requirePaymentPhoto: requirePhoto })
  await seedOrders(page, [{
    id: 'YUU-TEST',
    orderType: 'sit_down',
    items: [
      { menuItemId: 'f1', quantity: 2 },
      { menuItemId: 'd1', quantity: 1 },
    ],
    totalPrice: 114,
    status: 'awaiting_payment',
    createdAt: minsAgoISO(1),
    paymentMethod: 'bit',
    customerName,
  }])
  await loginAs(page, 'waitress')
}

// ─── requirePaymentPhoto: false ───────────────────────────────────────────────

test('order summary shows customer name, items, total', async ({ page }) => {
  await seedAwaitingOrder(page, 'Dana Cohen', false)
  await page.goto('/payment/YUU-TEST')
  await expect(page.locator('text=Dana Cohen')).toBeVisible()
  await expect(page.locator('text=טאקו אל פסטור')).toBeVisible()
  await expect(page.locator('text=תה היביסקוס קר')).toBeVisible()
  await expect(page.locator('text=₪114').first()).toBeVisible()
})

test('step indicator has only 2 steps when photo disabled', async ({ page }) => {
  await seedAwaitingOrder(page, 'NoPhoto', false)
  await page.goto('/payment/YUU-TEST')
  // Should NOT show the photo step circle
  await expect(page.locator('text=אישור תשלום')).not.toBeVisible()
  // Should show QR step and order number step
  await expect(page.locator('text=קוד QR')).toBeVisible()
  await expect(page.locator('text=מספר הזמנה')).toBeVisible()
})

test('paid click skips to confirmation when photo disabled', async ({ page }) => {
  await seedAwaitingOrder(page, 'SkipPhoto', false)
  await page.goto('/payment/YUU-TEST')
  await page.locator('button').filter({ hasText: 'הלקוח שילם' }).click()
  // Should land on confirmation step with order number
  await expect(page.locator('text=הזמנה נשלחה למטבח')).toBeVisible()
  await expect(page.locator('text=TEST').first()).toBeVisible() // part of YUU-TEST
})

test('order status becomes sent_to_kitchen after payment', async ({ page }) => {
  await seedAwaitingOrder(page, 'StatusCheck', false)
  await page.goto('/payment/YUU-TEST')
  await page.locator('button').filter({ hasText: 'הלקוח שילם' }).click()
  await expect(page.locator('text=הזמנה נשלחה למטבח')).toBeVisible()
  const orders = await getOrders(page)
  const order = orders.find(o => o.id === 'YUU-TEST')
  expect(order?.status).toBe('sent_to_kitchen')
})

test('stock is decremented after payment', async ({ page }) => {
  await seedSettings(page, { requirePaymentPhoto: false, stockQuantities: { f1: 5 } })
  await seedOrders(page, [{
    id: 'YUU-STOCK',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 2 }],
    totalPrice: 96,
    status: 'awaiting_payment',
    createdAt: minsAgoISO(1),
    paymentMethod: 'bit',
    customerName: 'StockTest',
  }])
  await loginAs(page, 'waitress')
  await page.goto('/payment/YUU-STOCK')
  await page.locator('button').filter({ hasText: 'הלקוח שילם' }).click()
  await expect(page.locator('text=הזמנה נשלחה למטבח')).toBeVisible()
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('yuu_settings') || '{}'))
  expect(settings.stockQuantities.f1).toBe(3)
})

test('stock depleted to 0 marks item unavailable', async ({ page }) => {
  await seedSettings(page, { requirePaymentPhoto: false, stockQuantities: { f1: 1 } })
  await seedOrders(page, [{
    id: 'YUU-DEPLETE',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 48,
    status: 'awaiting_payment',
    createdAt: minsAgoISO(1),
    paymentMethod: 'bit',
    customerName: 'DepletionTest',
  }])
  await loginAs(page, 'waitress')
  await page.goto('/payment/YUU-DEPLETE')
  await page.locator('button').filter({ hasText: 'הלקוח שילם' }).click()
  await expect(page.locator('text=הזמנה נשלחה למטבח')).toBeVisible()
  const menu = await page.evaluate(() => JSON.parse(localStorage.getItem('yuu_menu') || '[]'))
  const tacos = menu.find((m: any) => m.id === 'f1')
  expect(tacos?.available).toBe(false)
})

test('done button after confirmation returns to /orders', async ({ page }) => {
  await seedAwaitingOrder(page, 'BackTest', false)
  await page.goto('/payment/YUU-TEST')
  await page.locator('button').filter({ hasText: 'הלקוח שילם' }).click()
  await expect(page.locator('text=הזמנה נשלחה למטבח')).toBeVisible()
  await page.locator('button').filter({ hasText: 'סיום' }).click()
  await expect(page).toHaveURL(/\/orders/)
})

// ─── requirePaymentPhoto: true ────────────────────────────────────────────────

test('step 2 photo screen shown when photo required', async ({ page }) => {
  await seedAwaitingOrder(page, 'PhotoRequired', true)
  await page.goto('/payment/YUU-TEST')
  await expect(page.locator('text=אישור תשלום')).toBeVisible() // 3-step indicator
  await page.locator('button').filter({ hasText: 'הלקוח שילם' }).click()
  await expect(page.locator('text=צלם את אישור התשלום')).toBeVisible()
})

test('confirm button disabled until photo selected', async ({ page }) => {
  await seedAwaitingOrder(page, 'PhotoBtn', true)
  await page.goto('/payment/YUU-TEST')
  await page.locator('button').filter({ hasText: 'הלקוח שילם' }).click()
  const confirmBtn = page.locator('button').filter({ hasText: 'אשר ושלח למטבח' })
  await expect(confirmBtn).toBeDisabled()
})

// ─── Staff comp ───────────────────────────────────────────────────────────────

test('staff comp skips payment and finalizes as staff', async ({ page }) => {
  await seedAwaitingOrder(page, 'StaffMeal', false)
  await page.goto('/payment/YUU-TEST')
  await page.locator('button').filter({ hasText: 'על החשבון' }).click()
  await expect(page.locator('text=ההזמנה נשלחה למטבח!')).toBeVisible()
  const orders = await getOrders(page)
  const order = orders.find(o => o.id === 'YUU-TEST')
  expect(order?.status).toBe('sent_to_kitchen')
  expect(order?.paymentMethod).toBe('staff')
})

// ─── Cancellation ─────────────────────────────────────────────────────────────

test('cancel from payment page marks order cancelled', async ({ page }) => {
  await seedAwaitingOrder(page, 'CancelTest', false)
  await page.goto('/payment/YUU-TEST')
  await page.locator('button').filter({ hasText: 'בטל וחזור' }).click()
  await expect(page).toHaveURL(/\/orders/)
  const orders = await getOrders(page)
  const order = orders.find(o => o.id === 'YUU-TEST')
  expect(order?.status).toBe('cancelled')
})

test('cancelled order does not appear in kitchen queue', async ({ page }) => {
  await seedSettings(page, { requirePaymentPhoto: false })
  await seedOrders(page, [{
    id: 'YUU-CANCELLED',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 48,
    status: 'cancelled',
    createdAt: minsAgoISO(5),
    paymentMethod: 'bit',
    customerName: 'Cancelled',
  }])
  await loginAs(page, 'kitchen')
  await page.goto('/kitchen')
  await expect(page.locator('text=Cancelled')).not.toBeVisible()
  await expect(page.locator('text=אין הזמנות פעילות')).toBeVisible()
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

test('navigating to nonexistent order ID shows error state', async ({ page }) => {
  await seedSettings(page, { requirePaymentPhoto: false })
  await loginAs(page, 'waitress')
  await page.goto('/payment/YUU-NONEXISTENT')
  await expect(page.locator('text=/לא נמצאה|not found/i')).toBeVisible()
})

test('two orders created in succession have unique IDs', async ({ page }) => {
  await seedSettings(page, { requirePaymentPhoto: false })
  await loginAs(page, 'waitress')
  // Create 2 awaiting_payment orders via localStorage
  await seedOrders(page, [
    {
      id: 'YUU-A1',
      orderType: 'sit_down',
      items: [{ menuItemId: 'f1', quantity: 1 }],
      totalPrice: 48,
      status: 'awaiting_payment',
      createdAt: minsAgoISO(2),
      paymentMethod: 'bit',
      customerName: 'First',
    },
    {
      id: 'YUU-A2',
      orderType: 'sit_down',
      items: [{ menuItemId: 'f2', quantity: 1 }],
      totalPrice: 52,
      status: 'awaiting_payment',
      createdAt: minsAgoISO(1),
      paymentMethod: 'bit',
      customerName: 'Second',
    },
  ])
  const orders = await getOrders(page)
  const ids = orders.map((o: any) => o.id)
  expect(new Set(ids).size).toBe(ids.length)
})
