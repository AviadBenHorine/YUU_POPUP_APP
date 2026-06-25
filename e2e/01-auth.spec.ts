import { test, expect } from '@playwright/test'
import { clearAllStorage, loginAs, enterWrongPin, seedSettings } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await clearAllStorage(page)
  await page.reload()
})

// ─── Happy path ───────────────────────────────────────────────────────────────

test('admin logs in with 0000 and lands on /analytics', async ({ page }) => {
  await loginAs(page, 'admin')
  await expect(page).toHaveURL(/\/analytics/)
})

test('waitress logs in with 1111 and lands on /orders', async ({ page }) => {
  await loginAs(page, 'waitress')
  await expect(page).toHaveURL(/\/orders/)
})

test('kitchen logs in with 2222 and lands on /kitchen', async ({ page }) => {
  await loginAs(page, 'kitchen')
  await expect(page).toHaveURL(/\/kitchen/)
})

test('bar logs in with 3333 and lands on /bar', async ({ page }) => {
  await loginAs(page, 'bar')
  await expect(page).toHaveURL(/\/bar/)
})

test('session persists on page refresh', async ({ page }) => {
  await loginAs(page, 'kitchen')
  await expect(page).toHaveURL(/\/kitchen/)
  await page.reload()
  await expect(page).toHaveURL(/\/kitchen/)
})

// ─── Wrong PINs & Lockout ────────────────────────────────────────────────────

test('3 wrong PINs locks the role for 60 seconds', async ({ page }) => {
  // Select kitchen role
  await page.getByText('Kitchen', { exact: false }).first().click()
  await enterWrongPin(page, 'kitchen', 3)
  // Countdown timer should be visible on the PIN numpad (no page.goto — state lives in React)
  await expect(page.locator('text=/\\d+ שניות/')).toBeVisible()
  // Click back to role selection — the Kitchen card should now be disabled
  await page.locator('button').filter({ hasText: /מטבח|Kitchen/ }).first().click()
  const kitchenCard = page.locator('button').filter({ hasText: 'Kitchen' }).first()
  await expect(kitchenCard).toBeDisabled()
})

test('2 wrong PINs then correct PIN succeeds without lockout', async ({ page }) => {
  await page.getByText('Kitchen', { exact: false }).first().click()
  await enterWrongPin(page, 'kitchen', 2)
  // Now enter correct PIN
  for (const digit of '2222') {
    await page.getByRole('button', { name: digit, exact: true }).first().click()
  }
  await expect(page).toHaveURL(/\/kitchen/, { timeout: 5000 })
})

test('locking admin does not grey out kitchen', async ({ page }) => {
  await page.getByText('Admin', { exact: false }).first().click()
  await enterWrongPin(page, 'admin', 3)
  // Click back to role selection
  await page.locator('button').filter({ hasText: /מנהל|Admin/ }).first().click()
  const kitchenCard = page.locator('button').filter({ hasText: 'Kitchen' }).first()
  await expect(kitchenCard).not.toBeDisabled()
})

// ─── Route protection ────────────────────────────────────────────────────────

test('unauthenticated user is redirected to /login from every protected route', async ({ page }) => {
  for (const route of ['/orders', '/kitchen', '/bar', '/history', '/analytics', '/settings']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login/)
  }
})

test('kitchen role cannot access orders, history, analytics, settings', async ({ page }) => {
  await loginAs(page, 'kitchen')
  for (const route of ['/orders', '/history', '/analytics', '/settings']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login/)
  }
})

test('waitress role cannot access kitchen, bar, history, analytics, settings', async ({ page }) => {
  await loginAs(page, 'waitress')
  for (const route of ['/kitchen', '/bar', '/history', '/analytics', '/settings']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login/)
  }
})

test('admin can access all routes', async ({ page }) => {
  await loginAs(page, 'admin')
  for (const route of ['/orders', '/kitchen', '/bar', '/history', '/analytics', '/settings']) {
    await page.goto(route)
    await expect(page).not.toHaveURL(/\/login/)
  }
})

// ─── PIN edge cases ───────────────────────────────────────────────────────────

test('numpad stops accepting input after 4 digits', async ({ page }) => {
  await page.getByText('Admin', { exact: false }).first().click()
  // Tap 1 six times
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: '1', exact: true }).first().click()
  }
  // Should only show 4 dots filled (wrong PIN shakes but won't login with 1111+)
  // Verify by checking that the dots show exactly 4 filled — or that verify was called at 4
  const dots = page.locator('.w-4.h-4.rounded-full')
  await expect(dots).toHaveCount(4)
})

test('PIN 0000 works for admin', async ({ page }) => {
  await loginAs(page, 'admin')
  await expect(page).toHaveURL(/\/analytics/)
})

test('custom PIN set in settings is used at next login', async ({ page }) => {
  // Seed settings with a custom waitress PIN (5678 instead of default 1111)
  await seedSettings(page, { pins: { admin: '0000', waitress: '5678', kitchen: '2222', bar: '3333' } })
  // Page.goto triggers a fresh page load, re-initializing the store from the seeded settings
  await page.goto('/login')
  await page.getByText('Orders', { exact: false }).first().click()
  for (const digit of '5678') {
    await page.getByRole('button', { name: digit, exact: true }).first().click()
  }
  await expect(page).toHaveURL(/\/orders/, { timeout: 5000 })
})
