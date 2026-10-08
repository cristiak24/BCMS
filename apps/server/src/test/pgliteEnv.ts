/**
 * Import FIRST in an integration test: points the app at an in-memory PGlite
 * database before db/index.ts is loaded (imports run in order), so the test
 * can never touch a real database — db/index.ts also refuses one when
 * NODE_ENV=test.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pglite:memory';
process.env.DB_ENVIRONMENT = 'development';
delete process.env.RESEND_API_KEY;
