import test from 'node:test';
import assert from 'node:assert/strict';
import { playerStatusLabel } from './playerStatus';

test('raw statuses never reach the screen', () => {
  assert.equal(playerStatusLabel('active'), 'Activ');
  assert.equal(playerStatusLabel(' Inactive '), 'Inactiv');
  assert.equal(playerStatusLabel('injured'), 'Accidentat');
  assert.equal(playerStatusLabel(null), 'Activ');
  assert.equal(playerStatusLabel('weird'), 'Status necunoscut');
});
