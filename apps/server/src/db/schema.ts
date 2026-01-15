import { pgTable, serial, text, varchar, timestamp, pgEnum, integer } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'coach', 'accountant']);
export const statusEnum = pgEnum('status', ['pending', 'processed', 'rejected']);

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    role: roleEnum('role').default('coach').notNull(),
});

export const players = pgTable('players', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    position: varchar('position', { length: 50 }),
    status: varchar('status', { length: 50 }),
    avatarUrl: text('avatar_url'),
});

export const financialDocuments = pgTable('financial_documents', {
    id: serial('id').primaryKey(),
    type: varchar('type', { length: 50 }).notNull(), // 'expense' or 'income'
    amount: integer('amount').notNull(), // using integer for cents avoids float issues, or I can use decimal. I'll use integer.
    description: text('description'),
    date: timestamp('date').defaultNow().notNull(),
    documentUrl: text('document_url'),
    status: statusEnum('status').default('pending').notNull(),
});
