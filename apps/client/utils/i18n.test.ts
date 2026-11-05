import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { __setDictionaryForTests, appLocale, normalizeLang, roleCanChooseLanguage, tr, trServer } from '../i18n';
import en from '../i18n/en';
import { plural } from './plural';

afterEach(() => __setDictionaryForTests('ro', null));

test('Romanian is the source: tr returns the text with its placeholders filled', () => {
  assert.equal(tr('Restul prezenți ({unmarkedCount})', { unmarkedCount: 4 }), 'Restul prezenți (4)');
  assert.equal(appLocale(), 'ro-RO');
  assert.equal(plural(20, 'sesiune', 'sesiuni'), '20 de sesiuni');
});

test('English looks the phrase up and falls back to Romanian when it is missing', () => {
  __setDictionaryForTests('en', en);
  assert.equal(tr('Restul prezenți ({unmarkedCount})', { unmarkedCount: 4 }), 'Rest present (4)');
  assert.equal(tr('O frază fără traducere'), 'O frază fără traducere');
  assert.equal(appLocale(), 'en-GB');
});

test('English plurals: translated nouns, no Romanian "de"', () => {
  __setDictionaryForTests('en', en);
  assert.equal(plural(1, 'sesiune', 'sesiuni'), '1 session');
  assert.equal(plural(20, 'sesiune', 'sesiuni'), '20 sessions');
});

test('server phrases are translated, club-typed text is left alone', () => {
  __setDictionaryForTests('en', en);
  assert.equal(trServer('Scadent în 11 zile'), 'Due in 11 days');
  assert.equal(trServer('Cotizație octombrie 2026'), 'Membership fee, October 2026');
  assert.equal(trServer('Încasat de Ana Pop'), 'Collected by Ana Pop');
  assert.equal(trServer('Antrenament U12'), 'Antrenament U12');
});

test('every translation keeps the placeholders of its source', () => {
  for (const [source, english] of Object.entries(en)) {
    const names = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');
    assert.equal(names(english), names(source), source);
  }
});

test('only player, parent and coach choose a language', () => {
  assert.equal(roleCanChooseLanguage('coach'), true);
  assert.equal(roleCanChooseLanguage('admin'), false);
  assert.equal(normalizeLang('English'), 'en');
  assert.equal(normalizeLang('Romana'), 'ro');
});
