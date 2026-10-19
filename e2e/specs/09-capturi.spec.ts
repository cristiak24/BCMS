/**
 * Capturi și accesibilitate: the main screens of every role at 375 px and
 * 1280 px, light and dark. A screen fails on any browser console error or
 * uncaught exception (fixture) and on sideways scrolling of the page. Each
 * capture is attached to the report; buttons without an accessible name and
 * missing headings are recorded as annotations (WP6A owns fixing them).
 */
import { test, expect, signIn, expectNoHorizontalScroll } from '../support/fixtures';
import type { Role } from '../support/accounts';

const SCREENS: Record<Role, string[]> = {
  admin: ['/admin/dashboard', '/admin/roster', '/admin/schedule', '/admin/finance', '/admin/compliance', '/admin/my-club-admin', '/admin/l12'],
  accountant: ['/admin/finance', '/admin/contacts'],
  coach: ['/coach/dashboard', '/coach/attendance', '/coach/teams', '/schedule'],
  coach2: [],
  parent: ['/myclub', '/schedule', '/attendance', '/payments', '/team'],
  player: ['/myclub', '/schedule', '/attendance', '/team'],
};

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '1280', width: 1280, height: 800 },
];

for (const [role, screens] of Object.entries(SCREENS) as Array<[Role, string[]]>) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of VIEWPORTS) {
      for (const url of screens) {
        test(`${role} ${url} @${viewport.name} ${theme}`, async ({ page }, testInfo) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await signIn(page, role, { theme });
          await page.goto(url);
          await page.waitForLoadState('networkidle');
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expect(page.getByText(/Se încarcă/)).toHaveCount(0);

          await expectNoHorizontalScroll(page);

          const audit = await page.evaluate(() => {
            const visible = (el: Element) => (el as HTMLElement).offsetParent !== null;
            const unnamed = Array.from(document.querySelectorAll('button, [role="button"]'))
              .filter((el) => visible(el) && !(el.getAttribute('aria-label') || el.textContent || '').trim()).length;
            const headings = document.querySelectorAll('h1, h2, h3, [role="heading"]').length;
            return { unnamed, headings };
          });
          if (audit.unnamed) testInfo.annotations.push({ type: 'a11y', description: `${audit.unnamed} butoane fără nume accesibil` });
          if (!audit.headings) testInfo.annotations.push({ type: 'a11y', description: 'niciun titlu (h1–h3 / role=heading)' });

          await testInfo.attach(`${role}${url.replace(/\//g, '_')}-${viewport.name}-${theme}`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          });
        });
      }
    }
  }
}
