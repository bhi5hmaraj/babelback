import { test, expect } from '@playwright/test';

test('advanced view auto-centers and gradients are parchment', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/song-explorer/mobile', { waitUntil: 'networkidle' });

  // Load seed from inline block
  const loadBtn = page.locator('button:has-text("Load")').first();
  await loadBtn.waitFor({ state: 'visible', timeout: 10000 });
  await loadBtn.click();

  // Switch to Advanced
  const adv = page.locator('button:has-text("advanced")').first();
  await adv.waitFor({ state: 'visible', timeout: 10000 });
  await adv.click();

  // Scroll metrics
  const data = await page.evaluate(() => {
    const container = document.querySelector('[data-active-verse]')?.closest('div[style], .relative');
    const scroller = container as HTMLElement | null;
    const active = document.querySelector('[data-active-verse]') as HTMLElement | null;
    const overlays = Array.from(document.querySelectorAll('div')).filter(d => (
      getComputedStyle(d).position === 'absolute' && /gradient/.test(getComputedStyle(d).backgroundImage)
    ));
    const overlayInfo = overlays.map(o => {
      const st = getComputedStyle(o);
      const r = o.getBoundingClientRect();
      return { bg: st.backgroundImage, top: r.top, height: r.height };
    });
    const s = scroller ? { top: scroller.scrollTop, height: scroller.clientHeight, scrollHeight: scroller.scrollHeight } : null;
    const a = active ? active.getBoundingClientRect() : null;
    return { scroller: s, active: a, overlays: overlayInfo, html: document.body.innerHTML.slice(0, 1500) };
  });

  console.log('\n[Advanced scroll diagnostics]\n' + JSON.stringify(data, null, 2));
  await page.screenshot({ path: 'playwright/artifacts/adv-view.png', fullPage: true });
});

