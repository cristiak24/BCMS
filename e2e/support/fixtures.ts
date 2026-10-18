import fs from 'node:fs';
import { test as base, expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';
import { ACCOUNTS, type Role, type SeedIds } from './accounts';
import { E2E } from './env';

export { expect };

type Theme = 'light' | 'dark';

/** Sign the page in as one of the seeded accounts (before any app code runs). */
export async function signIn(page: Page, who: Role | string, options: { theme?: Theme } = {}) {
  const email = who in ACCOUNTS ? ACCOUNTS[who as Role] : who;
  await page.addInitScript(([as, theme]) => {
    window.localStorage.setItem('bcms.e2e.as', as);
    if (theme) window.localStorage.setItem('bcms.theme', theme);
    // The PWA install banner would cover the bottom bar on narrow screens.
    window.localStorage.setItem('bcms.install-dismissed-at', String(Date.now()));
  }, [email, options.theme ?? null] as const);
}

/** An API client that is signed in as `who` (Bearer `test:<email>`). */
export async function apiAs(who: Role | string, headers: Record<string, string> = {}): Promise<APIRequestContext> {
  const email = who in ACCOUNTS ? ACCOUNTS[who as Role] : who;
  return playwrightRequest.newContext({
    baseURL: `${E2E.apiUrl}/`,
    extraHTTPHeaders: { Authorization: `Bearer test:${email}`, ...headers },
  });
}

export function seedIds(): SeedIds {
  return JSON.parse(fs.readFileSync(E2E.seedFile, 'utf8')) as SeedIds;
}

/** The page must not scroll sideways (the shell is built for 375 px). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal scroll on the page').toBeLessThanOrEqual(0);
}

type Fixtures = {
  /** Console errors and uncaught exceptions seen during the test; must stay empty. */
  consoleErrors: string[];
};

export const test = base.extend<Fixtures>({
  consoleErrors: [async ({ page }, use, testInfo) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    await use(errors);
    if (testInfo.status === testInfo.expectedStatus && testInfo.status !== 'skipped') {
      expect(errors, 'errors in the browser console').toEqual([]);
    }
  }, { auto: true }],
});
