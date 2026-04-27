"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const migrator_1 = require("drizzle-orm/node-postgres/migrator");
const index_1 = require("./index");
async function main() {
    console.log('Running migrations...');
    await (0, migrator_1.migrate)(index_1.db, { migrationsFolder: './src/db/migrations' });
    console.log('Migrations complete!');
    await index_1.pool.end();
}
main().catch(console.error);
