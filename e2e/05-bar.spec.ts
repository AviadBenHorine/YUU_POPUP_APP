import { test, expect } from '@playwright/test'
import {
  clearAllStorage, loginAs, seedMenu, seedSettings, seedOrders, getOrders,
  TEST_MENU, minsAgoISO, makeDrinkOnlyOrder, makeMixedOrder, makeFoodOnlyOrder,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { requirePaymentPhoto: false, dessertTo: 'kitchen' })
})

// ─── Queue display ────────────────────────────────────────────────────────────

test('drink-only order appears in bar queue', async ({ page }) => {
  await seedOrders(page, [makeDrinkOnlyOrder('YUU-B1', { customerName: 'BarOnly' })])
  await loginAs(page, 'bar')
  await expect(page.locator('text=BarOnly')).toBeVisible()
})

test('food-only order does NOT appear in bar queue', async ({ page }) => {
  await seedOrders(page, [makeFoodOnlyOrder('YUU-B2', { customerName: 'FoodNoBar' })])
  await loginAs(page, 'bar')
  await expect(page.locator('text=FoodNoBar')).not.toBeVisible()
  await expect(page.locator('text=אין הזמנות פעילות')).toBeVisible()
})

test('mixed order appears in bar queue with only drink items', async ({ page }) => {
  await seedOrders(page, [makeMixedOrder('YUU-B3', { customerName: 'MixedBar' })])
  await loginAs(page, 'bar')
  await expect(page.locator('text=MixedBar')).toBeVisible()
  await expect(page.locator('text=תה היביסקוס קר')).toBeVisible()
  // Food item should NOT appear in bar card
  await expect(page.locator('text=טאקו אל פסטור')).not.toBeVisible()
})

// ─── Item completion ──────────────────────────────────────────────────────────

test('Done button disabled until all drink items ticked', async ({ page }) => {
  await seedOrders(page, [makeDrinkOnlyOrder('YUU-B4', {
    customerName: 'BarDone',
    items: [{ menuItemId: 'd1', quantity: 1 }, { menuItemId: 'd2', quantity: 1 }],
    totalPrice: 38,
  })])
  await loginAs(page, 'bar')
  // The done button shows "סמן את כל הפריטים..." when disabled
  const doneBtn = page.locator('button').filter({ hasText: 'נותרו' }).first()
  await expect(doneBtn).toBeDisabled()
  const items = page.locator('button.w-full.flex')
  await items.first().click()
  await expect(doneBtn).toBeDisabled()
  await items.nth(1).click()
  await expect(page.locator('button').filter({ hasText: 'מוכן' }).first()).not.toBeDisabled()
})

// ─── Drink-only order Done ────────────────────────────────────────────────────

test('drink-only order: Done sets status ready and card disappears', async ({ page }) => {
  await seedOrders(page, [makeDrinkOnlyOrder('YUU-B5', {
    customerName: 'BarReady',
    items: [{ menuItemId: 'd1', quantity: 1 }],
    totalPrice: 18,
  })])
  await loginAs(page, 'bar')
  await page.locator('button.w-full.flex').first().click()
  await page.locator('button.bg-green-500.w-full').first().click()
  await expect(page.locator('text=BarReady')).not.toBeVisible({ timeout: 3000 })
  const orders = await getOrders(page)
  const order = orders.find(o => o.id === 'YUU-B5')
  expect(order?.status).toBe('ready')
  expect(order?.barDoneAt).toBeTruthy()
})

// ─── Mixed order: Bar-side done ───────────────────────────────────────────────

test('mixed order: bar Done when kitchen already done sets status ready', async ({ page }) => {
  await seedOrders(page, [{
    id: 'YUU-B6',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1 }, { menuItemId: 'd1', quantity: 1 }],
    totalPrice: 66,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(5),
    sentToKitchenAt: minsAgoISO(5),
    paidAt: minsAgoISO(5),
    paymentMethod: 'bit',
    customerName: 'BothDone',
    kitchenDoneAt: minsAgoISO(1),
    checkedItems: { f1: true }, // kitchen already marked food done
  }])
  await loginAs(page, 'bar')
  // Bar card shows d1 (drink item)
  await expect(page.locator('text=BothDone')).toBeVisible()
  // Tick d1
  await page.locator('button.w-full.flex').first().click()
  // Done button enabled
  await expect(page.locator('button').filter({ hasText: 'מוכן' }).first()).not.toBeDisabled()
  await page.locator('button.bg-green-500.w-full').first().click()
  await expect(page.locator('text=BothDone')).not.toBeVisible({ timeout: 3000 })
  const orders = await getOrders(page)
  const order = orders.find(o => o.id === 'YUU-B6')
  expect(order?.status).toBe('ready')
  expect(order?.barDoneAt).toBeTruthy()
  expect(order?.readyAt).toBeTruthy()
})

test('mixed order: bar Done before kitchen keeps status sent_to_kitchen', async ({ page }) => {
  await seedOrders(page, [makeMixedOrder('YUU-B7', { customerName: 'BarFirst' })])
  await loginAs(page, 'bar')
  await page.locator('button.w-full.flex').first().click()
  await page.locator('button.bg-green-500.w-full').first().click()
  await expect(page.locator('text=BarFirst')).not.toBeVisible({ timeout: 3000 })
  const orders = await getOrders(page)
  const order = orders.find(o => o.id === 'YUU-B7')
  expect(order?.status).toBe('sent_to_kitchen')
  expect(order?.barDoneAt).toBeTruthy()
})

test('Bar Done panel shows "⏳ ממתין למטבח" for bar-first done mixed order', async ({ page }) => {
  // Seed an order where bar already finished but kitchen hasn't (no kitchenDoneAt)
  await seedOrders(page, [{
    id: 'YUU-B8',
    orderType: 'sit_down',
    items: [{ menuItemId: 'f1', quantity: 1 }, { menuItemId: 'd1', quantity: 1 }],
    totalPrice: 66,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(5),
    sentToKitchenAt: minsAgoISO(5),
    paidAt: minsAgoISO(5),
    paymentMethod: 'bit',
    customerName: 'WaitingKitchen',
    barDoneAt: minsAgoISO(1), // bar already done
    checkedItems: { d1: true },
  }])
  await loginAs(page, 'bar')
  // Done panel toggle should appear (1 order with barDoneAt)
  await expect(page.locator('button').filter({ hasText: 'מוכן' })).toBeVisible()
  await page.locator('button').filter({ hasText: 'מוכן' }).first().click()
  await expect(page.locator('text=ממתין למטבח')).toBeVisible({ timeout: 5000 })
})

// ─── Undo ─────────────────────────────────────────────────────────────────────

test('Undo from bar Done panel returns order to active bar queue', async ({ page }) => {
  await seedOrders(page, [makeDrinkOnlyOrder('YUU-B9', {
    customerName: 'BarUndo',
    items: [{ menuItemId: 'd1', quantity: 1 }],
    totalPrice: 18,
  })])
  await loginAs(page, 'bar')
  await page.locator('button.w-full.flex').first().click()
  await page.locator('button.bg-green-500.w-full').first().click()
  await expect(page.locator('text=BarUndo')).not.toBeVisible({ timeout: 3000 })
  await page.locator('button').filter({ hasText: 'מוכן' }).first().click()
  await page.locator('button').filter({ hasText: 'החזר' }).first().click()
  await expect(page.locator('text=BarUndo')).toBeVisible()
  const orders = await getOrders(page)
  const order = orders.find(o => o.id === 'YUU-B9')
  expect(order?.barDoneAt).toBeFalsy()
  expect(order?.status).toBe('sent_to_kitchen')
})

// ─── Stock panel ──────────────────────────────────────────────────────────────

test('bar stock panel opens and shows drink items', async ({ page }) => {
  await seedOrders(page, [makeDrinkOnlyOrder('YUU-B10')])
  await loginAs(page, 'bar')
  await page.locator('button').filter({ hasText: 'מלאי' }).click()
  await expect(page.locator('text=מלאי בר')).toBeVisible()
  // Stock panel shows drink items (d1 also in order card, so use first() to avoid strict violation)
  await expect(page.locator('text=תה היביסקוס קר').first()).toBeVisible()
})

// ─── Dessert routing (dessertTo: bar) ─────────────────────────────────────────

test('dessert order appears in bar queue when dessertTo=bar', async ({ page }) => {
  await seedSettings(page, { requirePaymentPhoto: false, dessertTo: 'bar' })
  await seedOrders(page, [{
    id: 'YUU-DESSERT-B',
    orderType: 'sit_down',
    items: [{ menuItemId: 'ds1', quantity: 1 }],
    totalPrice: 24,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(2),
    sentToKitchenAt: minsAgoISO(2),
    paidAt: minsAgoISO(2),
    paymentMethod: 'bit',
    customerName: 'DessertBar',
  }])
  await loginAs(page, 'bar')
  await expect(page.locator('text=DessertBar')).toBeVisible()
  await expect(page.locator('text=צ׳ורוס')).toBeVisible()
})

test('dessert does NOT appear in bar queue when dessertTo=kitchen', async ({ page }) => {
  await seedSettings(page, { requirePaymentPhoto: false, dessertTo: 'kitchen' })
  await seedOrders(page, [{
    id: 'YUU-DESSERT-K',
    orderType: 'sit_down',
    items: [{ menuItemId: 'ds1', quantity: 1 }],
    totalPrice: 24,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(2),
    sentToKitchenAt: minsAgoISO(2),
    paidAt: minsAgoISO(2),
    paymentMethod: 'bit',
    customerName: 'DessertKitchen',
  }])
  await loginAs(page, 'bar')
  await expect(page.locator('text=DessertKitchen')).not.toBeVisible()
})
