/** Accounts of the E2E club: apps/server/src/scripts/localDb.ts + support/server/seed.ts. */
export const ACCOUNTS = {
  admin: 'admin@local.test',
  coach: 'coach@local.test', // U12 Masculin
  coach2: 'coach2@local.test', // U14 Feminin
  accountant: 'contabil@local.test',
  parent: 'parinte@local.test', // Matei (U12) and Ana (U14)
  player: 'jucator@local.test', // Luca Marin (U12)
} as const;

export type Role = keyof typeof ACCOUNTS;

/** What support/server/seed.ts wrote to E2E.seedFile. */
export type SeedIds = {
  clubId: number;
  users: { admin: number; parent: number; coach2: number };
  teams: { u12: number; u14: number };
  players: { matei: number; radu: number; luca: number; ana: number; elena: number };
  events: { u14Match: number; u12Match: number; delegatedMatch: number };
  invite: { token: string; email: string };
};
