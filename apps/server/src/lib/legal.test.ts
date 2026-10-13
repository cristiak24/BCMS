import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { LEGAL_VERSION, stripHiddenUserFields } from './legal';

test('the export never carries credentials or payment-provider ids', () => {
    const cleaned = stripHiddenUserFields({
        id: 7,
        email: 'a@b.ro',
        passwordHash: 'x',
        stripeCustomerId: 'cus_1',
        uid: 'u',
        firebaseUid: 'f',
        name: 'Ana',
    });
    assert.deepEqual(cleaned, { id: 7, email: 'a@b.ro', name: 'Ana' });
});

test('the legal version is a plain date, so it sorts and fits the column', () => {
    assert.match(LEGAL_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test('the client and the server agree on the published legal version', () => {
    const clientConfig = readFileSync(path.resolve(__dirname, '../../../client/config/legal.ts'), 'utf8');
    const match = clientConfig.match(/LEGAL_VERSION\s*=\s*'([^']+)'/);
    assert.equal(match?.[1], LEGAL_VERSION);
});
