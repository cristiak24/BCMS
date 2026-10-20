import '../test/pgliteEnv';
import '../test/fakeClerk';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'net';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { auditLogs, clubs } from '../db/schema';
import { closeDb, createSchema } from '../test/pgliteDb';

/**
 * account.updated (WP7 proposal): a club's connected Stripe account that can
 * now take charges is reflected without anyone opening the Finanțe settings.
 * Signed like Stripe does, with the platform or the Connect endpoint secret.
 */

const PLATFORM_SECRET = 'whsec_platform_test';
const CONNECT_SECRET = 'whsec_connect_test';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_webhook_only';
process.env.STRIPE_WEBHOOK_SECRET = PLATFORM_SECRET;
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET;

let base = '';
let server: ReturnType<express.Express['listen']>;
let clubId = 0;

before(async () => {
    await createSchema();
    [{ id: clubId }] = await db.insert(clubs).values({ name: 'Club Stripe', normalizedName: 'club stripe', stripeAccountId: 'acct_club1', stripeChargesEnabled: false }).returning();
    const { stripeWebhookHandler } = await import('./finance');
    const app = express();
    app.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
    server?.close();
    await closeDb();
});

function send(payload: object, secret: string) {
    const body = JSON.stringify(payload);
    const signature = new Stripe('sk_test_x').webhooks.generateTestHeaderString({ payload: body, secret });
    return fetch(`${base}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body });
}

const accountUpdated = (chargesEnabled: boolean) => ({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    type: 'account.updated',
    account: 'acct_club1',
    data: { object: { id: 'acct_club1', object: 'account', charges_enabled: chargesEnabled } },
});

test('a connected account that can take charges is marked so on the club, and audited once', async () => {
    const res = await send(accountUpdated(true), CONNECT_SECRET);
    assert.equal(res.status, 200, await res.text());
    const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
    assert.equal(club.stripeChargesEnabled, true);

    // The same state again changes nothing and logs nothing new.
    assert.equal((await send(accountUpdated(true), PLATFORM_SECRET)).status, 200);
    const log = await db.select().from(auditLogs).where(eq(auditLogs.action, 'finance.stripe.account_updated'));
    assert.equal(log.length, 1);
    assert.equal(log[0].clubId, clubId);
});

test('a restricted account stops taking charges', async () => {
    assert.equal((await send(accountUpdated(false), CONNECT_SECRET)).status, 200);
    const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
    assert.equal(club.stripeChargesEnabled, false);
});

test('a forged signature is refused', async () => {
    const res = await send(accountUpdated(true), 'whsec_attacker');
    assert.equal(res.status, 400);
    const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
    assert.equal(club.stripeChargesEnabled, false);
});
