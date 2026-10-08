import test from 'node:test';
import assert from 'node:assert/strict';
import { renderNotificationEmail } from './notificationEmail';

test('escapes user-supplied text and builds the app link', () => {
    const { html, text } = renderNotificationEmail({ title: 'Eveniment anulat', body: '„<b>Antrenament</b>” a fost anulat.', path: '/schedule' }, 'https://bcms.ro/');
    assert.ok(html.includes('&lt;b&gt;Antrenament&lt;/b&gt;'));
    assert.ok(!html.includes('<b>Antrenament'));
    assert.ok(html.includes('href="https://bcms.ro/schedule"'));
    assert.ok(text.includes('https://bcms.ro/schedule'));
});
