import { expect, test } from '@playwright/test';

test.describe.skip('manual diagnostics', () => {
  // use `npx playwright test playwright/tests/mobile-synced-diagnostics.spec.ts --headed --debug`
});

test.skip(true, 'Manual diagnostic script – enable temporarily when investigating synced view overlays.');

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadSeedSong(page: import('@playwright/test').Page) {
  await page.goto('/song-explorer/mobile', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'BabelBack!' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Browse Seed Songs' }).click();
  await expect(page.getByRole('heading', { name: 'Seed Songs' })).toBeVisible();
  await page.waitForResponse((resp) => resp.url().includes('/api/seeds') && resp.status() === 200, { timeout: 15000 }).catch(() => {});
  const loadButton = page.locator('button:has-text("Load")').first();
  const found = await loadButton.isVisible({ timeout: 5000 }).catch(() => false);
  const disabledState = await loadButton.evaluate((btn: HTMLButtonElement) => btn.disabled);
  console.log('[Load button disabled]', disabledState);
  if (!found) {
    console.log('[Diagnostic] No visible Load button, logging sheet content.');
    const allButtons = await page.locator('button').allTextContents();
    console.log('[Buttons]', allButtons);
    const sheetHtml = await page.locator('[data-slot="sheet-content"]').first().evaluate((el) => el.innerHTML).catch(() => 'sheet content unavailable');
    console.log(sheetHtml);
    await loadButton.evaluate((btn: HTMLButtonElement) => btn.click());
  } else {
    await loadButton.evaluate((btn: HTMLButtonElement) => btn.click());
  }
  await delay(500);
  await page.locator('button:has-text("Close")').click({ trial: false, timeout: 2000 }).catch(() => {});
  const sheetClosed = await page.waitForSelector('[data-slot="sheet-content"]', { state: 'detached', timeout: 5000 }).then(() => true).catch(() => false);
  console.log('[Sheet closed]', sheetClosed);
  await delay(1500);
}

test('diagnose synced lyrics view gradient', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await loadSeedSong(page);

  const syncedToggle = page.locator('button:has-text("Synced Lyrics")').first();
  await expect(syncedToggle).toBeVisible({ timeout: 10000 });
  await syncedToggle.click();

  const activeVerseLocator = page.locator('[data-active-verse], .text-2xl.font-semibold').first();
  await expect(activeVerseLocator).toBeVisible({ timeout: 10000 });

  const gradientInfo = await page.evaluate(() => {
    const container = document.querySelector('[data-active-verse]')?.closest('[style*="mask-image" i]') as HTMLElement | null;
    if (!container) {
      return { found: false };
    }
    const styles = window.getComputedStyle(container);
    return {
      found: true,
      maskImage: styles.getPropertyValue('mask-image'),
      webkitMaskImage: styles.getPropertyValue('-webkit-mask-image'),
      background: styles.getPropertyValue('background'),
      classes: container.className,
    };
  });

  console.log('\n[Synced view mask debug]\n' + JSON.stringify(gradientInfo, null, 2));
  console.log('\n[Console errors]\n' + JSON.stringify(consoleErrors, null, 2));

  await page.screenshot({ path: 'playwright/artifacts/mobile-synced-gradient.png', fullPage: true });
});
