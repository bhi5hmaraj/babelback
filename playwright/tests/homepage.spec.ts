import { test, expect } from '@playwright/test'

test('home hero renders parchment + CTAs', async ({ page }) => {
  await page.goto('/')

  // Hero title
  await expect(page.getByRole('heading', { name: 'BabelBack' })).toBeVisible()

  // Background should be a gradient (parchment). Check computed style.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage)
  expect(bg).toContain('gradient')

  // CTAs
  const open = page.locator('a[href="/song-explorer/responsive"]')
  const lib = page.locator('a[href="/library"]')
  await expect(open).toBeVisible()
  await expect(lib).toBeVisible()
})

