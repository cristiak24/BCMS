import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { createAllowedOrigins, isOriginAllowed } from './corsOrigins';

const prod = { NODE_ENV: 'production' };

test('production allows bcms.ro and configured origins', () => {
    const env = { ...prod, FRONTEND_URL: 'https://app.bcms.ro/', CORS_ALLOWED_ORIGINS: 'https://preview.example.dev, staging.bcms.ro' };
    const allowed = createAllowedOrigins(env);
    assert.ok(isOriginAllowed('https://bcms.ro', allowed, env));
    assert.ok(isOriginAllowed('https://www.bcms.ro', allowed, env));
    assert.ok(isOriginAllowed('https://app.bcms.ro', allowed, env));
    assert.ok(isOriginAllowed('https://preview.example.dev', allowed, env));
    assert.ok(isOriginAllowed('https://staging.bcms.ro', allowed, env));
});

test('production rejects arbitrary Firebase-hosted sites', () => {
    const allowed = createAllowedOrigins(prod);
    assert.equal(isOriginAllowed('https://evil-site.web.app', allowed, prod), false);
    assert.equal(isOriginAllowed('https://evil-site.firebaseapp.com', allowed, prod), false);
    assert.equal(isOriginAllowed('https://bcms.ro.evil.com', allowed, prod), false);
});

test('production keeps the project\'s own Firebase domains when configured', () => {
    const env = { ...prod, GCLOUD_PROJECT: 'bcms-prod' };
    const allowed = createAllowedOrigins(env);
    assert.ok(isOriginAllowed('https://bcms-prod.web.app', allowed, env));
    assert.equal(isOriginAllowed('https://other.web.app', allowed, env), false);
});

test('production rejects localhost', () => {
    const allowed = createAllowedOrigins(prod);
    assert.equal(isOriginAllowed('http://localhost:8091', allowed, prod), false);
});

test('development allows any localhost port', () => {
    const env = { NODE_ENV: 'development' };
    const allowed = createAllowedOrigins(env);
    assert.ok(isOriginAllowed('http://localhost:8093', allowed, env));
    assert.ok(isOriginAllowed('http://127.0.0.1:5173', allowed, env));
    assert.equal(isOriginAllowed('https://evil.web.app', allowed, env), false);
});
