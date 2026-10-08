/** Import first: the local development database (PGlite, apps/server/.pglite). */
process.env.DATABASE_URL = process.env.DATABASE_URL?.startsWith('pglite:') ? process.env.DATABASE_URL : 'pglite:./.pglite';
process.env.DB_ENVIRONMENT = 'development';
