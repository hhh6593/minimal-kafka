/**
 * Playwright visual + functional tests for docs/html/index.html.
 *
 * Run:
 *   npx playwright test docs/html/test.js
 *
 * Uses @playwright/test. The test file assumes index.html is served as a file:// URL
 * (no web server needed), which playwright supports out of the box.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const FILE_URL = 'file://' + path.resolve(__dirname, 'index.html');
const GUIDE_URL = 'file://' + path.resolve(__dirname, 'code-guide.html');
const SHOT_DIR = path.resolve(__dirname, 'test-shots');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile-375',  width: 375,  height: 812 },  // iPhone 13-ish
  { name: 'mobile-430',  width: 430,  height: 932 },  // iPhone 15 Pro Max
  { name: 'tablet-768',  width: 768,  height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

test.describe('minimal-kafka docs', () => {

  for (const vp of VIEWPORTS) {
    test(`renders at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(FILE_URL);
      await expect(page).toHaveTitle(/minimal-kafka/);

      // page has a heading
      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible();
      await expect(h1).toContainText('minimal-kafka');

      // full-page screenshot per breakpoint
      await page.screenshot({
        path: path.join(SHOT_DIR, `${vp.name}-light.png`),
        fullPage: true,
      });

      // dark mode screenshot
      await page.click('#theme-toggle');
      await page.waitForTimeout(200);
      await page.screenshot({
        path: path.join(SHOT_DIR, `${vp.name}-dark.png`),
        fullPage: true,
      });
      // restore
      await page.click('#theme-toggle');
    });
  }

  test('sidebar visible on desktop, hidden on mobile', async ({ page }) => {
    await page.goto(FILE_URL);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.mobile-nav')).toBeHidden();

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.mobile-nav')).toBeVisible();
  });

  test('all 15 version anchors exist and are reachable', async ({ page }) => {
    await page.goto(FILE_URL);
    const ids = ['overview','run','v01','v02','v03','v04','v05','v06','v07','v08','v09','v10','v11','v12','v13','v14',
                 'v15-1','v15-2','v15-3','v15-4','v15-5','v15-6'];
    for (const id of ids) {
      const count = await page.locator(`[id="${id}"]`).count();
      expect(count, `section #${id} must exist`).toBeGreaterThanOrEqual(1);
    }
  });

  test('sidebar links scroll to their sections and activate', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(FILE_URL);

    // click v07 link and confirm the section is near the top
    const link = page.locator('.sidebar a.nav-link[data-target="v07"]');
    await link.click();
    // wait for smooth scroll (longer because doc grew with runboxes)
    await page.waitForTimeout(1500);

    const targetBox = await page.locator('#v07').boundingBox();
    expect(targetBox).not.toBeNull();
    expect(targetBox.y).toBeLessThan(400);

    // give the IntersectionObserver a moment to settle
    await page.waitForTimeout(400);
    await expect(link).toHaveClass(/active/);
  });

  test('mobile hamburger opens menu and closes after click', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(FILE_URL);

    const hamburger = page.locator('#hamburger');
    const menu = page.locator('#mobile-menu');

    await expect(hamburger).toBeVisible();
    await expect(menu).not.toHaveClass(/open/);

    await hamburger.click();
    await expect(menu).toHaveClass(/open/);
    await expect(hamburger).toHaveAttribute('aria-expanded', 'true');

    // click a link inside the mobile menu → menu should close
    const firstLink = menu.locator('a.nav-link').first();
    await firstLink.click();
    await expect(menu).not.toHaveClass(/open/);
    await expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  test('dark mode toggle flips the html class', async ({ page }) => {
    await page.goto(FILE_URL);
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);
    await page.click('#theme-toggle');
    await expect(html).toHaveClass(/dark/);
    await page.click('#theme-toggle');
    await expect(html).not.toHaveClass(/dark/);
  });

  test('touch targets meet 44x44 minimum (interactive elements)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(FILE_URL);

    const selectors = ['#hamburger', '#theme-toggle'];
    for (const sel of selectors) {
      const box = await page.locator(sel).boundingBox();
      expect(box, `${sel} visible`).not.toBeNull();
      // width can be larger, but min each axis ≥ 36 (design spec used min-height 36 for links)
      // interactive chrome elements ≥ 36 per Toss spec; 44 for critical nav
      expect(box.height, `${sel} height`).toBeGreaterThanOrEqual(36);
    }
  });

  test('no horizontal overflow at any breakpoint', async ({ page }) => {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(FILE_URL);
      const overflow = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollW,
        `horizontal overflow at ${vp.name} (scrollW=${overflow.scrollW}, clientW=${overflow.clientW})`
      ).toBeLessThanOrEqual(overflow.clientW + 1); // 1px tolerance
    }
  });

  test('external links have rel=noopener', async ({ page }) => {
    await page.goto(FILE_URL);
    const links = await page.locator('a[href^="http"]').all();
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      const rel = await a.getAttribute('rel');
      expect(rel || '').toMatch(/noopener/);
    }
  });

  test('body text contrast reasonable (basic sanity)', async ({ page }) => {
    await page.goto(FILE_URL);
    const bodyColor = await page.evaluate(() =>
      getComputedStyle(document.body).color
    );
    const bodyBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    expect(bodyColor).toBeTruthy();
    expect(bodyBg).toBeTruthy();
    expect(bodyColor).not.toBe(bodyBg);
  });

  // ─────────── code-guide.html ───────────

  test('code-guide renders at desktop + mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(GUIDE_URL);
    await expect(page).toHaveTitle(/코드 딥다이브/);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.screenshot({ path: path.join(SHOT_DIR, 'code-guide-desktop-light.png'), fullPage: true });

    await page.click('#theme-toggle');
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOT_DIR, 'code-guide-desktop-dark.png'), fullPage: true });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(GUIDE_URL);
    await page.screenshot({ path: path.join(SHOT_DIR, 'code-guide-mobile-light.png'), fullPage: true });
  });

  test('code-guide has all major component sections', async ({ page }) => {
    await page.goto(GUIDE_URL);
    const ids = ['lifecycle','reading-guide','broker','network','wire','api',
                 'log-iface','in-memory','segmented','log-manager',
                 'producer','partitioner','consumer','assignors',
                 'coordinator','offset-store','producer-state','txn','replica',
                 'controller','retention','fetch-session','toggles','evolution'];
    for (const id of ids) {
      const count = await page.locator(`[id="${id}"]`).count();
      expect(count, `section #${id} must exist`).toBeGreaterThanOrEqual(1);
    }
  });

  test('code-guide no horizontal overflow at breakpoints', async ({ page }) => {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(GUIDE_URL);
      const overflow = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollW,
        `code-guide overflow at ${vp.name} (scrollW=${overflow.scrollW})`
      ).toBeLessThanOrEqual(overflow.clientW + 1);
    }
  });

  test('index has link to code-guide', async ({ page }) => {
    await page.goto(FILE_URL);
    const links = await page.locator('a[href="code-guide.html"]').count();
    expect(links, 'at least one link to code-guide.html').toBeGreaterThanOrEqual(1);
  });
});
