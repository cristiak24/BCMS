# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/specs/02-bani.spec.ts >> a partial payment pays only its amount and the player stays in arrears
- Location: e2e/specs/02-bani.spec.ts:31:5

# Error details

```
Error: ENOENT: no such file or directory, open '/private/var/folders/1d/qwwbmr2x1mn2_0zrwrp0fq9m0000gn/T/bcms-e2e-MInEz2/seed.json'
```

# Test source

```ts
  1  | import fs from 'node:fs';
  2  | import { test as base, expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';
  3  | import { ACCOUNTS, type Role, type SeedIds } from './accounts';
  4  | import { E2E } from './env';
  5  | 
  6  | export { expect };
  7  | 
  8  | type Theme = 'light' | 'dark';
  9  | 
  10 | /** Sign the page in as one of the seeded accounts (before any app code runs). */
  11 | export async function signIn(page: Page, who: Role | string, options: { theme?: Theme } = {}) {
  12 |   const email = who in ACCOUNTS ? ACCOUNTS[who as Role] : who;
  13 |   await page.addInitScript(([as, theme]) => {
  14 |     window.localStorage.setItem('bcms.e2e.as', as);
  15 |     if (theme) window.localStorage.setItem('bcms.theme', theme);
  16 |     // The PWA install banner would cover the bottom bar on narrow screens.
  17 |     window.localStorage.setItem('bcms.install-dismissed-at', String(Date.now()));
  18 |   }, [email, options.theme ?? null] as const);
  19 | }
  20 | 
  21 | /** An API client that is signed in as `who` (Bearer `test:<email>`). */
  22 | export async function apiAs(who: Role | string, headers: Record<string, string> = {}): Promise<APIRequestContext> {
  23 |   const email = who in ACCOUNTS ? ACCOUNTS[who as Role] : who;
  24 |   return playwrightRequest.newContext({
  25 |     baseURL: `${E2E.apiUrl}/`,
  26 |     extraHTTPHeaders: { Authorization: `Bearer test:${email}`, ...headers },
  27 |   });
  28 | }
  29 | 
  30 | export function seedIds(): SeedIds {
> 31 |   return JSON.parse(fs.readFileSync(E2E.seedFile, 'utf8')) as SeedIds;
     |                        ^ Error: ENOENT: no such file or directory, open '/private/var/folders/1d/qwwbmr2x1mn2_0zrwrp0fq9m0000gn/T/bcms-e2e-MInEz2/seed.json'
  32 | }
  33 | 
  34 | /** The page must not scroll sideways (the shell is built for 375 px). */
  35 | export async function expectNoHorizontalScroll(page: Page) {
  36 |   const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  37 |   expect(overflow, 'horizontal scroll on the page').toBeLessThanOrEqual(0);
  38 | }
  39 | 
  40 | type Fixtures = {
  41 |   /** Console errors and uncaught exceptions seen during the test; must stay empty. */
  42 |   consoleErrors: string[];
  43 | };
  44 | 
  45 | export const test = base.extend<Fixtures>({
  46 |   consoleErrors: [async ({ page }, use, testInfo) => {
  47 |     const errors: string[] = [];
  48 |     page.on('console', (message) => {
  49 |       if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  50 |     });
  51 |     page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  52 |     await use(errors);
  53 |     if (testInfo.status === testInfo.expectedStatus && testInfo.status !== 'skipped') {
  54 |       expect(errors, 'errors in the browser console').toEqual([]);
  55 |     }
  56 |   }, { auto: true }],
  57 | });
  58 | 
```