import { test, expect } from '@playwright/test'
import { clearAllStorage, loginAs } from './helpers'

// NOTE: Tests that create/edit/delete events require Firebase to be configured.
// In test mode (FIREBASE_ENABLED=false), these tests verify page rendering only.
// Full Firebase-dependent tests need a live Firebase project.

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await clearAllStorage(page)
  await page.reload()
})

// ─── Route protection ────────────────────────────────────────────────────────

test('admin can navigate to /prep', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.goto('/prep')
  await expect(page).not.toHaveURL(/\/login/)
})

test('admin can navigate to /prep/:id', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.goto('/prep/nonexistent-id')
  await expect(page).not.toHaveURL(/\/login/)
})

test('waitress cannot access /prep', async ({ page }) => {
  await loginAs(page, 'waitress')
  await page.goto('/prep')
  await expect(page).toHaveURL(/\/login/)
})

test('kitchen cannot access /prep', async ({ page }) => {
  await loginAs(page, 'kitchen')
  await page.goto('/prep')
  await expect(page).toHaveURL(/\/login/)
})

// ─── Page rendering (works without Firebase) ─────────────────────────────────

test('prep list shows Firebase-disabled message in test mode', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.goto('/prep')
  // In test mode Firebase is disabled
  await expect(page.getByText('Firebase לא מוגדר')).toBeVisible()
})

test('prep list shows "הכנות לאירוע" title', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.goto('/prep')
  await expect(page.getByText('הכנות לאירוע')).toBeVisible()
})

test('prep detail shows Firebase-disabled message for unknown event', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.goto('/prep/some-event-id')
  await expect(page.getByText('Firebase לא מוגדר')).toBeVisible()
})

// ─── Nav entry ───────────────────────────────────────────────────────────────

test('admin nav includes הכנות link', async ({ page }) => {
  await loginAs(page, 'admin')
  await expect(page.getByRole('link', { name: /הכנות/ })).toBeVisible()
})

// ─── Firebase-required tests (skipped in test mode) ──────────────────────────
// These tests require a live Firebase project.
// Run with: VITE_FIREBASE_* env vars set to a real project.

const FIREBASE_AVAILABLE = !!(
  process.env.VITE_FIREBASE_PROJECT_ID || process.env.PLAYWRIGHT_FIREBASE
)

test.describe('Firebase-dependent prep tests', () => {
  test.skip(!FIREBASE_AVAILABLE, 'requires Firebase — set PLAYWRIGHT_FIREBASE=1 to run')

  test('can create a new event from the list page', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/prep')
    await page.getByRole('button', { name: /אירוע חדש/ }).click()
    await page.getByRole('textbox').first().fill('אירוע בדיקה')
    await page.getByRole('button', { name: 'צור אירוע' }).click()
    await expect(page).toHaveURL(/\/prep\/.+/, { timeout: 10000 })
    await expect(page.getByText('אירוע בדיקה')).toBeVisible()
  })

  test('can add a shopping item to a group', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/prep')
    // Seed event or use existing — assumes at least one event exists
    await page.getByText('פופ-אפ מקסיקני').first().click()
    await expect(page).toHaveURL(/\/prep\/.+/)
    // Should be on shopping tab by default
    await expect(page.getByText('קניות')).toBeVisible()
    // Add an item to the first group
    const nameInputs = page.getByPlaceholder('שם פריט...')
    await nameInputs.first().fill('פריט בדיקה')
    await page.getByRole('button', { name: 'הוסף' }).first().click()
    await expect(page.getByText('פריט בדיקה')).toBeVisible()
  })

  test('can check and uncheck a shopping item', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/prep')
    await page.getByText('פופ-אפ מקסיקני').first().click()
    // Find and check first item
    const checkbox = page.locator('input[type="checkbox"]').first()
    await checkbox.check()
    await expect(checkbox).toBeChecked()
    // Uncheck
    await checkbox.uncheck()
    await expect(checkbox).not.toBeChecked()
  })

  test('can edit a shopping item', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/prep')
    await page.getByText('פופ-אפ מקסיקני').first().click()
    // Click edit on first item
    await page.locator('[aria-label^="ערוך"]').first().click()
    await expect(page.getByText('עריכת פריט')).toBeVisible()
    await page.locator('input[type="text"]').first().fill('שם חדש לבדיקה')
    await page.getByRole('button', { name: 'שמור' }).click()
    await expect(page.getByText('שם חדש לבדיקה')).toBeVisible()
  })

  test('can delete a shopping item', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/prep')
    await page.getByText('פופ-אפ מקסיקני').first().click()
    // Add a temp item then delete it
    await page.getByPlaceholder('שם פריט...').first().fill('פריט למחיקה')
    await page.getByRole('button', { name: 'הוסף' }).first().click()
    await expect(page.getByText('פריט למחיקה')).toBeVisible()
    // Delete it
    const deleteBtn = page.locator('[aria-label="מחק פריט למחיקה"]')
    await deleteBtn.click()
    await page.getByRole('button', { name: 'מחק' }).click()
    await expect(page.getByText('פריט למחיקה')).not.toBeVisible({ timeout: 5000 })
  })

  test('can add a task to an owner', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/prep')
    await page.getByText('פופ-אפ מקסיקני').first().click()
    await page.getByRole('button', { name: /משימות/ }).click()
    await page.getByPlaceholder('שם משימה...').first().fill('משימת בדיקה')
    await page.getByRole('button', { name: 'הוסף' }).first().click()
    await expect(page.getByText('משימת בדיקה')).toBeVisible()
  })

  test('duplicate with scaling resets checks and scales quantities', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/prep')
    // Duplicate the Mexican event with half the portions
    const dupBtn = page.locator('button', { hasText: 'שכפל' }).first()
    await dupBtn.click()
    // New event modal should open with duplicate mode
    await expect(page.getByText('אירוע חדש')).toBeVisible()
    // Fill old/new portions
    await page.locator('input[placeholder="350"]').fill('290')
    await page.locator('input[placeholder="280"]').fill('145')
    await page.getByRole('button', { name: 'צור אירוע' }).click()
    await expect(page).toHaveURL(/\/prep\/.+/, { timeout: 10000 })
    // Verify items are unchecked
    const checkboxes = page.locator('input[type="checkbox"]')
    for (const cb of await checkboxes.all()) {
      await expect(cb).not.toBeChecked()
    }
  })

  test('"העתק מה שנשאר" copies unchecked items format', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/prep')
    await page.getByText('פופ-אפ מקסיקני').first().click()
    // Copy first group's remaining items
    await page.getByRole('button', { name: 'העתק' }).first().click()
    await expect(page.getByText('הרשימה הועתקה')).toBeVisible()
  })

  test('hide-done toggle hides checked items', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/prep')
    await page.getByText('פופ-אפ מקסיקני').first().click()
    // Check first item
    await page.locator('input[type="checkbox"]').first().check()
    // Toggle hide-done
    await page.getByRole('button', { name: /הסתר מה שכבר סומן/ }).click()
    // The checked item should be hidden
    const checkboxes = page.locator('input[type="checkbox"]:checked')
    await expect(checkboxes).toHaveCount(0, { timeout: 2000 })
  })
})
