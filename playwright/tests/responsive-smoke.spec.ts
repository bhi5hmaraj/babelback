import { test, expect } from '@playwright/test';

test.describe('Responsive Song Explorer smoke', () => {
  test('seed load, basic details, advanced toggles, footer pinned', async ({ page }) => {
    await page.goto('/song-explorer/responsive', { waitUntil: 'networkidle' });

    // Seed card should render; click first Load
    const loadBtn = page.locator('button:has-text("Load")').first();
    await loadBtn.waitFor({ state: 'visible', timeout: 15000 });
    await loadBtn.click();

    // Tabs visible
    await expect(page.getByTestId('view-tabs')).toBeVisible();

    // Basic embedded details present (Meaning & Context)
    await expect(page.getByText('Meaning & Context')).toBeVisible();

    // Footer pinned
    const footer = page.getByTestId('player-footer');
    await expect(footer).toBeVisible();

    // Switch to Advanced and verify overlay toggles
    await page.getByRole('button', { name: 'advanced' }).click();
    await expect(page.getByRole('button', { name: 'Translit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Translate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Meaning' })).toBeVisible();

    // Toggle Translate and ensure translation paragraphs reduce
    const before = await page.locator('[data-testid="adv-translation"]').count();
    await page.getByRole('button', { name: 'Translate' }).click();
    const after = await page.locator('[data-testid="adv-translation"]').count();
    expect(after).toBeLessThanOrEqual(before - 1);
  });
});
