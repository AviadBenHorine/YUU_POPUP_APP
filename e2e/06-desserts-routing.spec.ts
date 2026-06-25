import { test, expect } from '@playwright/test'
import {
  clearAllStorage, loginAs, seedMenu, seedSettings, seedOrders, getOrders,
  TEST_MENU, minsAgoISO,
} from './helpers'

const dessertOrder = (id: string, name: string) => ({
  id,
  orderType: 'sit_down' as const,
  items: [{ menuItemId: 'ds1', quantity: 1 }],
  totalPrice: 24,
  status: 'sent_to_kitchen' as const,
  createdAt: minsAgoISO(2),
  sentToKitchenAt: minsAgoISO(2),
  paidAt: minsAgoISO(2),
  paymentMethod: 'bit' as const,
  customerName: name,
})

const mixedDessertFoodOrder = (id: string, name: string) => ({
  id,
  orderType: 'sit_down' as const,
  items: [
    { menuItemId: 'f1', quantity: 1 },
    { menuItemId: 'ds1', quantity: 1 },
  ],
  totalPrice: 72,
  status: 'sent_to_kitchen' as const,
  createdAt: minsAgoISO(2),
  sentToKitchenAt: minsAgoISO(2),
  paidAt: minsAgoISO(2),
  paymentMethod: 'bit' as const,
  customerName: name,
})

const mixedDessertDrinkOrder = (id: string, name: string) => ({
  id,
  orderType: 'sit_down' as const,
  items: [
    { menuItemId: 'd1', quantity: 1 },
    { menuItemId: 'ds1', quantity: 1 },
  ],
  totalPrice: 42,
  status: 'sent_to_kitchen' as const,
  createdAt: minsAgoISO(2),
  sentToKitchenAt: minsAgoISO(2),
  paidAt: minsAgoISO(2),
  paymentMethod: 'bit' as const,
  customerName: name,
})

// ─── dessertTo: kitchen ────────────────────────────────────────────────────────

test('dessertTo=kitchen: dessert-only order shown in kitchen queue', async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { dessertTo: 'kitchen' })
  await seedOrders(page, [dessertOrder('YUU-D1', 'Dessert Kitchen')])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=Dessert Kitchen')).toBeVisible()
  await expect(page.locator('text=צ׳ורוס')).toBeVisible()
})

test('dessertTo=kitchen: dessert-only order NOT shown in bar queue', async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { dessertTo: 'kitchen' })
  await seedOrders(page, [dessertOrder('YUU-D2', 'DessertNotBar')])
  await loginAs(page, 'bar')
  await expect(page.locator('text=DessertNotBar')).not.toBeVisible()
  await expect(page.locator('text=אין הזמנות פעילות')).toBeVisible()
})

test('dessertTo=kitchen: food+dessert mixed order shown in kitchen, not bar', async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { dessertTo: 'kitchen' })
  await seedOrders(page, [mixedDessertFoodOrder('YUU-D3', 'FoodDessertKitchen')])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=FoodDessertKitchen')).toBeVisible()
  await expect(page.locator('text=צ׳ורוס')).toBeVisible()
  // Not in bar
  await page.evaluate(() => sessionStorage.setItem('yuu_role', 'bar'))
  await page.goto('/bar')
  await expect(page.locator('text=FoodDessertKitchen')).not.toBeVisible()
})

// ─── dessertTo: bar ────────────────────────────────────────────────────────────

test('dessertTo=bar: dessert-only order shown in bar queue', async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { dessertTo: 'bar' })
  await seedOrders(page, [dessertOrder('YUU-D4', 'Dessert Bar')])
  await loginAs(page, 'bar')
  await expect(page.locator('text=Dessert Bar')).toBeVisible()
  await expect(page.locator('text=צ׳ורוס')).toBeVisible()
})

test('dessertTo=bar: dessert-only order NOT shown in kitchen queue', async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { dessertTo: 'bar' })
  await seedOrders(page, [dessertOrder('YUU-D5', 'DessertNotKitchen')])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=DessertNotKitchen')).not.toBeVisible()
  await expect(page.locator('text=אין הזמנות פעילות')).toBeVisible()
})

test('dessertTo=bar: drink+dessert mixed order shown in bar, not kitchen', async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { dessertTo: 'bar' })
  await seedOrders(page, [mixedDessertDrinkOrder('YUU-D6', 'DrinkDessertBar')])
  await loginAs(page, 'bar')
  await expect(page.locator('text=DrinkDessertBar')).toBeVisible()
  await expect(page.locator('text=צ׳ורוס')).toBeVisible()
  // Not in kitchen
  await page.evaluate(() => sessionStorage.setItem('yuu_role', 'kitchen'))
  await page.goto('/kitchen')
  await expect(page.locator('text=DrinkDessertBar')).not.toBeVisible()
})

// ─── Cross-dept: food+drink+dessert (all three) ────────────────────────────────

test('dessertTo=kitchen: food+drink+dessert shown in kitchen AND bar (separately)', async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { dessertTo: 'kitchen' })
  await seedOrders(page, [{
    id: 'YUU-ALL3',
    orderType: 'sit_down' as const,
    items: [
      { menuItemId: 'f1', quantity: 1 },
      { menuItemId: 'd1', quantity: 1 },
      { menuItemId: 'ds1', quantity: 1 },
    ],
    totalPrice: 90,
    status: 'sent_to_kitchen',
    createdAt: minsAgoISO(3),
    sentToKitchenAt: minsAgoISO(3),
    paidAt: minsAgoISO(3),
    paymentMethod: 'bit',
    customerName: 'AllThree',
  }])
  await loginAs(page, 'kitchen')
  await expect(page.locator('text=AllThree')).toBeVisible()
  // Kitchen should show food + dessert items
  await expect(page.locator('text=צ׳ורוס')).toBeVisible()
  await expect(page.locator('text=טאקו אל פסטור')).toBeVisible()
  // Bar should show the drink item
  await page.evaluate(() => sessionStorage.setItem('yuu_role', 'bar'))
  await page.goto('/bar')
  await expect(page.locator('text=AllThree')).toBeVisible()
  await expect(page.locator('text=תה היביסקוס קר')).toBeVisible()
})

// ─── Done subtitle accuracy ────────────────────────────────────────────────────

test('kitchen done subtitle shows dessert when dessertTo=kitchen', async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { dessertTo: 'kitchen' })
  await seedOrders(page, [mixedDessertFoodOrder('YUU-D7', 'DessertKitchenDone')])
  await loginAs(page, 'kitchen')
  // Tick both items
  const items = page.locator('button.w-full.flex')
  await items.first().click()
  await items.last().click()
  await page.locator('button.bg-green-500.w-full').first().click()
  // Open done panel
  await page.locator('button').filter({ hasText: 'מוכן' }).first().click()
  // Done subtitle should mention churros (dessert)
  await expect(page.locator('text=צ׳ורוס')).toBeVisible()
})

test('kitchen done subtitle does NOT show dessert when dessertTo=bar', async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { dessertTo: 'bar' })
  // food + dessert, but dessert goes to bar
  await seedOrders(page, [mixedDessertFoodOrder('YUU-D8', 'DessertBarDone')])
  await loginAs(page, 'kitchen')
  // Only food item visible in kitchen
  const items = page.locator('button.w-full.flex')
  await items.first().click()
  await page.locator('button.bg-green-500.w-full').first().click()
  await page.locator('button').filter({ hasText: 'מוכן' }).first().click()
  // Done subtitle should NOT show churros
  const doneCard = page.locator('text=DessertBarDone').locator('..')
  await expect(doneCard.locator('text=צ׳ורוס')).not.toBeVisible()
})

// ─── Settings change while app running ────────────────────────────────────────

test('changing dessertTo re-routes existing dessert orders on reload', async ({ page }) => {
  await page.goto('/')
  await clearAllStorage(page)
  await seedMenu(page, TEST_MENU)
  await seedSettings(page, { dessertTo: 'kitchen' })
  await seedOrders(page, [dessertOrder('YUU-D9', 'RouteSwitchTest')])
  await loginAs(page, 'kitchen')
  // Initially routes to kitchen
  await expect(page.locator('text=RouteSwitchTest')).toBeVisible()

  // Change setting to bar, then reload — routing is dynamic so existing order moves to bar
  await seedSettings(page, { dessertTo: 'bar' })
  await page.reload()
  // After reload with dessertTo=bar, dessert order no longer shows in kitchen
  await expect(page.locator('text=RouteSwitchTest')).not.toBeVisible()

  // The same order now appears in bar
  await page.evaluate(() => sessionStorage.setItem('yuu_role', 'bar'))
  await page.goto('/bar')
  await expect(page.locator('text=RouteSwitchTest')).toBeVisible()
})
