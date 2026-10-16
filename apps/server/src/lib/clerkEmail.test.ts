import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedEmailClaim, verifiedEmailOf } from './clerkEmail';

const address = (id: string, emailAddress: string, status: string | null) => ({
    id, emailAddress, verification: status ? { status } : null,
});

test('the verified primary address is the identity email', () => {
    assert.equal(verifiedEmailOf({
        primaryEmailAddressId: 'a',
        emailAddresses: [address('b', 'other@x.ro', 'verified'), address('a', 'main@x.ro', 'verified')],
    }), 'main@x.ro');
});

test('an unverified address is never used, even as the only or primary one', () => {
    assert.equal(verifiedEmailOf({ primaryEmailAddressId: 'a', emailAddresses: [address('a', 'victim@x.ro', 'unverified')] }), null);
    assert.equal(verifiedEmailOf({ primaryEmailAddressId: null, emailAddresses: [address('a', 'victim@x.ro', null)] }), null);
    assert.equal(verifiedEmailOf({
        primaryEmailAddressId: 'a',
        emailAddresses: [address('a', 'victim@x.ro', 'unverified'), address('b', 'mine@x.ro', 'verified')],
    }), 'mine@x.ro');
});

test('a session-token email claim counts only together with email_verified', () => {
    assert.equal(verifiedEmailClaim({ email: 'a@x.ro', email_verified: true }), 'a@x.ro');
    assert.equal(verifiedEmailClaim({ email: 'a@x.ro', email_verified: 'true' }), 'a@x.ro');
    assert.equal(verifiedEmailClaim({ email: 'a@x.ro' }), null);
    assert.equal(verifiedEmailClaim({ email: 'a@x.ro', email_verified: false }), null);
    assert.equal(verifiedEmailClaim({ email_verified: true }), null);
});
