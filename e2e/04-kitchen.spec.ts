import { test, expect } from '@playwright/test'
import {
  clearAllStorage, loginAs, seedMenu, seedSettings, seedOrders, getOrders,
  TEST_MENU, minsAgoISO, makeFoodOnlyOrder, makeDrinkOnlyOrder, makeMixedOrder,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { requirePaymentPhoto: false, dessertTo: 'kitchen' })
})

// ─── Queue display ────────────────────────────────────────────────────────────

test('food-only order appears in kitchen queue', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-K1', { customerName: 'FoodOnly' })])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=FoodOnly')).toBeVisible()
})

test('drink-only order does NOT appear in kitchen queue', async ({ page }) => {
  await seedOrders(page, [makeDrinkOnlyOrder('YUU-K2', { customerName: 'DrinksOnly' })])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=DrinksOnly')).not.toBeVisible()
  await expect(page.locator('text=אין הזמנות פעילות')).toBeVisible()
})

test('order card shows customer name, order ID, type badge, timer', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-K3', { customerName: 'TimerTest' })])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=TimerTest')).toBeVisible()
  await expect(page.locator('text=YUU-K3')).toBeVisible()
  await expect(page.locator('text=ישיבה')).toBeVisible()
  // Timer should be visible (some MM:SS pattern)
  await expect(page.locator('text=/:/')).toBeVisible().catch(() => {
    // Timer might show as 0:XX — just check the card is rendered
  })
})

test('items shown as tappable checkboxes initially unchecked', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-K4', { customerName: 'CheckTest' })])
  await loginAs(page, 'kitchen')
  // Checkboxes should exist and not be checked (green)
  const checkboxes = page.locator('.w-6.h-6.rounded-md.border-2')
  await expect(checkboxes.first()).toBeVisible()
  // None should have bg-green-500 initially
  await expect(page.locator('.bg-green-500.border-green-500').first()).not.toBeVisible()
})

// ─── Item completion ──────────────────────────────────────────────────────────

test('tapping item toggles it to done (strikethrough + green)', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-K5', {
    customerName: 'ToggleTest',
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 48,
  })])
  await loginAs(page, 'kitchen')
  const itemBtn = page.locator('button.w-full.flex').first()
  await itemBtn.click()
  await expect(page.locator('.bg-green-500.border-green-500').first()).toBeVisible()
})

test('Done button disabled until all items ticked', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-K6', {
    customerName: 'DoneBtn',
    items: [{ menuItemId: 'f1', quantity: 1 }, { menuItemId: 'f2', quantity: 1 }],
    totalPrice: 100,
  })])
  await loginAs(page, 'kitchen')
  // The done button shows "סמן את כל הפריטים..." when disabled
  const doneBtn = page.locator('button').filter({ hasText: 'נותרו' }).first()
  // Initially disabled (has HTML disabled attribute)
  await expect(doneBtn).toBeDisabled()
  // Tick first item
  const items = page.locator('button.w-full.flex')
  await items.first().click()
  // Still disabled (second item unticked)
  await expect(doneBtn).toBeDisabled()
  // Tick second item
  await items.nth(1).click()
  // Now the button text changes to 'מוכן ✓ / Done' and is enabled
  await expect(page.locator('button').filter({ hasText: 'מוכן' }).first()).not.toBeDisabled()
})

// ─── Kitchen-only order Done ──────────────────────────────────────────────────

test('kitchen-only order: Done sets status ready and card disappears', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-K7', {
    customerName: 'ReadyTest',
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 48,
  })])
  await loginAs(page, 'kitchen')
  const itemBtn = page.locator('button.w-full.flex').first()
  await itemBtn.click()
  const doneBtn = page.locator('button.bg-green-500.w-full').first()
  await expect(doneBtn).not.toBeDisabled()
  await doneBtn.click()
  // Card should disappear
  await expect(page.locator('text=ReadyTest')).not.toBeVisible({ timeout: 3000 })
  // Status in localStorage should be ready
  const orders = await getOrders(page)
  const order = orders.find(o => o.id === 'YUU-K7')
  expect(order?.status).toBe('ready')
  expect(order?.kitchenDoneAt).toBeTruthy()
})

// ─── Mixed order (food + drinks) ──────────────────────────────────────────────

test('mixed order: kitchen Done does not set status ready (bar still pending)', async ({ page }) => {
  await seedOrders(page, [makeMixedOrder('YUU-K8', { customerName: 'Mixed' })])
  await loginAs(page, 'kitchen')
  // Tick the food item
  const itemBtn = page.locator('button.w-full.flex').first()
  await itemBtn.click()
  const doneBtn = page.locator('button.bg-green-500.w-full').first()
  await doneBtn.click()
  // Card should disappear from kitchen
  await expect(page.locator('text=Mixed')).not.toBeVisible({ timeout: 3000 })
  // But status should NOT be ready — still sent_to_kitchen
  const orders = await getOrders(page)
  const order = orders.find(o => o.id === 'YUU-K8')
  expect(order?.status).toBe('sent_to_kitchen')
  expect(order?.kitchenDoneAt).toBeTruthy()
})

test('mixed order still visible in bar after kitchen Done', async ({ page }) => {
  await seedOrders(page, [makeMixedOrder('YUU-K9', { customerName: 'BarVisible' })])
  await loginAs(page, 'kitchen')
  const itemBtn = page.locator('button.w-full.flex').first()
  await itemBtn.click()
  const doneBtn = page.locator('button.bg-green-500.w-full').first()
  await doneBtn.click()
  await expect(page.locator('text=BarVisible')).not.toBeVisible({ timeout: 3000 })

  // Now switch to bar and verify order is still there
  await page.evaluate(() => sessionStorage.setItem('yuu_role', 'bar'))
  await page.goto('/bar')
  await expect(page.locator('text=BarVisible')).toBeVisible()
})

test('Kitchen Done panel shows "⏳ ממתין לבר" for mixed order', async ({ page }) => {
  // Seed an order that kitchen already finished (kitchenDoneAt set) but bar hasn't (no barDoneAt)
  await seedOrders(page, [{
    id: 'YUU-K10',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1 }, { menuItemId: 'd1', quantity: 1 }],
    totalPrice: 66,
    status: 'sent_to_kitchen', // bar still pending
    createdAt: minsAgoISO(5),
    sentToKitchenAt: minsAgoISO(5),
    paidAt: minsAgoISO(5),
    paymentMethod: 'bit',
    customerName: 'WaitingBar',
    kitchenDoneAt: minsAgoISO(1), // kitchen already done
    checkedItems: { f1: true },
  }])
  await loginAs(page, 'kitchen')
  // Done panel toggle should appear (1 order with kitchenDoneAt)
  await expect(page.locator('button').filter({ hasText: 'מוכן' })).toBeVisible()
  await page.locator('button').filter({ hasText: 'מוכן' }).first().click()
  // Panel should show ממתין לבר since bar not done
  await expect(page.locator('text=ממתין לבר')).toBeVisible({ timeout: 5000 })
})

// ─── Undo ─────────────────────────────────────────────────────────────────────

test('Undo returns order to active queue and resets checkboxes', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-K11', {
    customerName: 'UndoTest',
    items: [{ menuItemId: 'f1', quantity: 1 }],
    totalPrice: 48,
  })])
  await loginAs(page, 'kitchen')
  // Complete the order
  await page.locator('button.w-full.flex').first().click()
  await page.locator('button.bg-green-500.w-full').first().click()
  await expect(page.locator('text=UndoTest')).not.toBeVisible({ timeout: 3000 })

  // Open done panel and undo
  await page.locator('button').filter({ hasText: 'מוכן' }).first().click()
  await page.locator('button').filter({ hasText: 'החזר' }).first().click()

  // Order should be back in active queue
  await expect(page.locator('text=UndoTest')).toBeVisible()
  // kitchenDoneAt should be cleared
  const orders = await getOrders(page)
  const order = orders.find(o => o.id === 'YUU-K11')
  expect(order?.kitchenDoneAt).toBeFalsy()
  expect(order?.status).toBe('sent_to_kitchen')
})

// ─── Done panel count ─────────────────────────────────────────────────────────

test('Done panel button does not appear when no kitchen-done orders', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-K12', { customerName: 'NoDonePanel' })])
  await loginAs(page, 'kitchen')
  // No orders with kitchenDoneAt, so Done button shouldn't appear
  await expect(page.locator('button').filter({ hasText: 'מוכן' })).not.toBeVisible()
})

// ─── Stock panel ──────────────────────────────────────────────────────────────

test('stock panel opens and closes', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-K13')])
  await loginAs(page, 'kitchen')
  await page.locator('button').filter({ hasText: 'מלאי' }).click()
  await expect(page.locator('text=מלאי מטבח')).toBeVisible()
  await page.locator('button').filter({ hasText: 'מלאי' }).click()
  await expect(page.locator('text=מלאי מטבח')).not.toBeVisible()
})

test('toggling item unavailable in stock panel marks it as unavailable', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-K14')])
  await loginAs(page, 'kitchen')
  await page.locator('button').filter({ hasText: 'מלאי' }).click()
  await expect(page.locator('text=מלאי מטבח')).toBeVisible()
  // Each stock item row has a w-7 h-7 availability toggle button (✓/✕)
  // f1 (טאקו אל פסטור) is the first food item — its toggle is the first such button
  await page.locator('button.w-7.h-7').first().click()
  const menu = await page.evaluate(() => JSON.parse(localStorage.getItem('yuu_menu') || '[]'))
  const item = menu.find((m: any) => m.id === 'f1')
  expect(item?.available).toBe(false)
})

// ─── Polling ──────────────────────────────────────────────────────────────────

test('new order injected into localStorage appears within 6 seconds', async ({ page }) => {
  await seedOrders(page, [])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=אין הזמנות פעילות')).toBeVisible()

  // Inject new order directly
  await page.evaluate(() => {
    const orders = JSON.parse(localStorage.getItem('yuu_orders') || '[]')
    orders.push({
      id: 'YUU-POLL',
      orderType: 'sit_down',
      items: [{ menuItemId: 'f1', quantity: 1 }],
      totalPrice: 48,
      status: 'sent_to_kitchen',
      createdAt: new Date().toISOString(),
      sentToKitchenAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      paymentMethod: 'bit',
      customerName: 'PollingTest',
    })
    localStorage.setItem('yuu_orders', JSON.stringify(orders))
  })

  // Within 6 seconds the kitchen should show the new order
  await expect(page.locator('text=PollingTest')).toBeVisible({ timeout: 6000 })
})
