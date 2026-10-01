import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    canDeleteDocument,
    canSeeDocument,
    canUploadDocuments,
    cleanDocumentTitle,
    contentDisposition,
    documentLinkSecret,
    looksLikePdf,
    normalizeVisibility,
    signDocumentLink,
    verifyDocumentLink,
} from './clubDocuments';

test('staff-only documents are hidden from players and parents', () => {
    assert.equal(canSeeDocument('player', 'staff'), false);
    assert.equal(canSeeDocument('parent', 'staff'), false);
    assert.equal(canSeeDocument('coach', 'staff'), true);
    assert.equal(canSeeDocument('player', 'all'), true);
});

test('only admins and coaches upload', () => {
    assert.equal(canUploadDocuments('admin'), true);
    assert.equal(canUploadDocuments('coach'), true);
    assert.equal(canUploadDocuments('parent'), false);
    assert.equal(canUploadDocuments(undefined), false);
});

test('a coach deletes only their own uploads; admins delete any', () => {
    assert.equal(canDeleteDocument({ id: 4, role: 'coach' }, 4), true);
    assert.equal(canDeleteDocument({ id: 4, role: 'coach' }, 9), false);
    assert.equal(canDeleteDocument({ id: 4, role: 'coach' }, null), false);
    assert.equal(canDeleteDocument({ id: 1, role: 'admin' }, 9), true);
    assert.equal(canDeleteDocument({ id: 2, role: 'player' }, 2), false);
});

test('PDF sniffing looks at the bytes, not the name', () => {
    assert.equal(looksLikePdf(Buffer.from('%PDF-1.7\n...')), true);
    assert.equal(looksLikePdf(Buffer.from('<html>')), false);
    assert.equal(looksLikePdf(Buffer.alloc(0)), false);
});

test('visibility defaults to all', () => {
    assert.equal(normalizeVisibility('staff'), 'staff');
    assert.equal(normalizeVisibility('admins'), 'all');
    assert.equal(normalizeVisibility(undefined), 'all');
});

test('title falls back to the file name', () => {
    assert.equal(cleanDocumentTitle('  Regulament   intern ', 'x.pdf'), 'Regulament intern');
    assert.equal(cleanDocumentTitle('', 'Calendar_competitional-2026.pdf'), 'Calendar competitional 2026');
});

test('content-disposition survives diacritics and quotes', () => {
    const header = contentDisposition('Regulament "intern" ș.pdf', 'inline');
    assert.match(header, /^inline; filename="Regulament _intern_ s\.pdf"; filename\*=UTF-8''/);
});

test('signed document links verify, expire and reject tampering', () => {
    const secret = documentLinkSecret({ CLERK_SECRET_KEY: 'sk_test_x' } as NodeJS.ProcessEnv)!;
    const token = signDocumentLink(12, 3, 2_000, secret);
    assert.deepEqual(verifyDocumentLink(token, secret, 1_000), { documentId: 12, clubId: 3 });
    assert.equal(verifyDocumentLink(token, secret, 3_000), null);
    assert.equal(verifyDocumentLink(token.replace('12.', '13.'), secret, 1_000), null);
    const other = documentLinkSecret({ CLERK_SECRET_KEY: 'sk_test_y' } as NodeJS.ProcessEnv)!;
    assert.equal(verifyDocumentLink(token, other, 1_000), null);
    assert.equal(documentLinkSecret({} as NodeJS.ProcessEnv), null);
});
