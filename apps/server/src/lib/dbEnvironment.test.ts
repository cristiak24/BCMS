import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabaseTarget } from './dbEnvironment';

test('production and marked development databases pass', () => {
    assert.equal(checkDatabaseTarget({ NODE_ENV: 'production' }).level, 'ok');
    assert.equal(checkDatabaseTarget({ DB_ENVIRONMENT: 'development' }).level, 'ok');
});

test('an unmarked local database warns, or blocks when required', () => {
    const warn = checkDatabaseTarget({ DATABASE_URL: 'postgres://u:p@ep-x.neon.tech/db' });
    assert.equal(warn.level, 'warn');
    assert.ok('message' in warn && warn.message.includes('ep-x.neon.tech'));
    assert.equal(checkDatabaseTarget({ REQUIRE_DEV_DATABASE: '1' }).level, 'block');
});
