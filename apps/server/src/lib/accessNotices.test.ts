import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionNotice, joinSubject, reviewerNotice, summarizeOwnRequests, type OwnRequest } from './accessNotices';

test('reviewers read who asks, for which child and which team', () => {
    const one = reviewerNotice({ requesterName: 'Ion Popescu', role: 'parent', children: ['Matei Popescu'], teamName: 'U14' });
    assert.equal(one.message, 'Ion Popescu cere acces ca părinte pentru Matei Popescu la U14.');

    const many = reviewerNotice({ requesterName: 'Ion Popescu', role: 'parent', children: ['Matei', 'Ana', 'Luca'], teamName: 'U14' });
    assert.match(many.message, /pentru Matei, Ana și Luca la U14/);

    const coach = reviewerNotice({ requesterName: 'Dan Ionescu', role: 'coach' });
    assert.equal(coach.message, 'Dan Ionescu cere acces ca antrenor.');
    assert.equal(coach.type, 'access_request');
});

test('a request without a name still reads as a sentence', () => {
    assert.equal(reviewerNotice({ requesterName: '  ', role: 'player', teamName: 'U16' }).message, 'Un utilizator nou cere acces ca sportiv la U16.');
});

test('the requester hears the outcome, with a way out when it is a no', () => {
    const yes = decisionNotice({ decision: 'approved', subject: 'Matei Popescu (U14)' });
    assert.equal(yes.type, 'access_approved');
    assert.match(yes.message, /Cererea ta pentru Matei Popescu \(U14\) a fost aprobată/);

    const no = decisionNotice({ decision: 'denied' });
    assert.equal(no.type, 'access_denied');
    assert.match(no.message, /respinsă/);
    assert.match(no.message, /administratorul clubului/);
});

test('a join request is described by the child for a parent and by the team for a player', () => {
    assert.equal(joinSubject({ kind: 'parent', childFirstName: 'Matei', childLastName: 'Popescu' }, 'U14'), 'Matei Popescu (U14)');
    assert.equal(joinSubject({ kind: 'player', childFirstName: 'Matei', childLastName: 'Popescu' }, 'U14'), 'echipa U14');
    assert.equal(joinSubject({ kind: 'player', childFirstName: 'Matei', childLastName: 'Popescu' }, null), null);
});

function request(id: string, status: OwnRequest['status'], createdAt: string): OwnRequest {
    return { id, label: id, detail: null, status, createdAt };
}

test('the waiting screen is "denied" only when every request was turned down', () => {
    assert.equal(summarizeOwnRequests([]).state, 'pending');
    assert.equal(summarizeOwnRequests([request('a', 'denied', '2026-10-01')]).state, 'denied');
    assert.equal(summarizeOwnRequests([request('a', 'denied', '2026-10-01'), request('b', 'pending', '2026-10-02')]).state, 'pending');
    assert.equal(summarizeOwnRequests([request('a', 'denied', '2026-10-01'), request('b', 'approved', '2026-10-02')]).state, 'pending');
});

test('newest request comes first', () => {
    const { requests } = summarizeOwnRequests([request('old', 'pending', '2026-10-01'), request('new', 'pending', '2026-10-05')]);
    assert.deepEqual(requests.map((r) => r.id), ['new', 'old']);
});
