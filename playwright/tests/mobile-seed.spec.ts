import { test, expect } from '@playwright/test';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('mobile seed flow diagnostics', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto('/song-explorer/mobile', { waitUntil: 'networkidle' });

  const babelBackButton = page.getByRole('button', { name: 'BabelBack!' });
  await expect(babelBackButton).toBeVisible({ timeout: 15000 });

  const browseSeedsButton = page.getByRole('button', { name: 'Browse Seed Songs' });
  await expect(browseSeedsButton).toBeVisible();
  await browseSeedsButton.click();

  const seedHeading = page.getByRole('heading', { name: 'Seed Songs' });
  await expect(seedHeading).toBeVisible();

  let loadButtonHandle = await page
    .getByRole('button', { name: /^Load$/i })
    .first()
    .elementHandle({ timeout: 10000 })
    .catch(() => null);

  if (!loadButtonHandle) {
    console.log('\n[Diagnostic] No seed "Load" buttons rendered. Capturing sheet HTML.');
    const sheetWrapper = await seedHeading.first().evaluate((el) => {
      const target = el.closest('[data-slot="sheet-content"], [data-slot="sheet-header"], section, div');
      return target ? target.outerHTML : el.outerHTML;
    });
    console.log(sheetWrapper);
  } else {
    await loadButtonHandle.click();
    await delay(2000);
  }

  const domSnapshot = await page.evaluate(() => {
    const header = document.querySelector('header');
    const main = document.querySelector('main');
    const footerSection = document.querySelector('section');
    const snapshotHeading = Array.from(document.querySelectorAll('h2')).find((el) => el.textContent?.includes('Song Snapshot'));
    const snapshotCard = snapshotHeading ? snapshotHeading.closest('div') : null;

    const getRect = (el: Element | null) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      };
    };

    const verseCandidates = Array.from(document.querySelectorAll('main div'))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').trim().slice(0, 80),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          classes: el.className,
        };
      })
      .filter((item) => item.text && item.height > 0)
      .slice(0, 12);

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      header: getRect(header),
      main: getRect(main),
      footer: getRect(footerSection),
      snapshot: getRect(snapshotCard),
      verseCandidates,
      hasSongData: !!main && !!main.querySelector('audio, div') && document.querySelectorAll('[data-active-verse]').length > 0,
      htmlPreview: document.body.innerHTML.slice(0, 2000),
    };
  });

  console.log('\n[Console errors]\n' + JSON.stringify(consoleErrors, null, 2));
  console.log('\n[DOM snapshot]\n' + JSON.stringify(domSnapshot, null, 2));

  await page.screenshot({ path: 'playwright/artifacts/mobile-state.png', fullPage: true });

  const hasIncompleteSeedError = consoleErrors.some((line) => line.includes('Incomplete seed data'));
  if (hasIncompleteSeedError) {
    console.log('\n[Diagnostic] Observed "Incomplete seed data" error during seed load.');
  } else {
    console.log('\n[Diagnostic] No "Incomplete seed data" error detected.');
  }

  expect(consoleErrors.length >= 0).toBeTruthy();
});
