import { and, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db';
import { auditLogs, players, users } from '../db/schema';
import type { AuthenticatedRequest } from '../middleware/auth';

export type AuditLogInput = {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  actorUserId?: number | null;
  actorUid?: string | null;
  actorRole?: string | null;
  clubId?: number | null;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Record an action. Never throws: callers write the audit entry after the
 * change is committed, and a failed insert used to turn an already-saved
 * change into a 500 the user would then retry. Failures are logged loudly.
 */
export async function writeAuditLog(input: AuditLogInput) {
  try {
    await db.insert(auditLogs).values({
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId == null ? null : String(input.entityId),
      actorUserId: input.actorUserId ?? null,
      actorUid: input.actorUid ?? null,
      actorRole: (input.actorRole as any) ?? null,
      clubId: input.clubId ?? null,
      metadata: input.metadata == null ? null : JSON.stringify(input.metadata),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (error) {
    console.error(`[audit] Failed to record ${input.action}:`, error);
  }
}

/**
 * An entry for something the signed-in caller just did: actor and club come
 * from the verified request. Same never-throws contract as writeAuditLog.
 */
export function auditRequest(
  req: AuthenticatedRequest,
  input: Omit<AuditLogInput, 'actorUserId' | 'actorUid' | 'actorRole'>,
) {
  const clubId = input.clubId !== undefined ? input.clubId : req.user?.clubId == null ? null : Number(req.user.clubId);
  return writeAuditLog({
    ...input,
    clubId,
    actorUserId: req.user?.id == null ? null : Number(req.user.id),
    actorUid: req.clerkUser?.uid ?? null,
    actorRole: req.user?.role ?? null,
  });
}

/** Saves of one sheet by one person this close together are one sitting. */
const ATTENDANCE_SITTING_MINUTES = 30;

/**
 * Attendance saves on every tap, so the journal gets one entry per session
 * and sitting, not one per player: a save within half an hour of the same
 * person's last entry for the same event folds into it (latest mark per
 * player wins). Never throws.
 */
export async function auditAttendanceSave(
  req: AuthenticatedRequest,
  session: { eventId: number; clubId: number | null; title: string; startTime: string | null },
  marks: { playerId: number; status: string }[],
) {
  try {
    const actorUserId = req.user?.id == null ? null : Number(req.user.id);
    const [last] = actorUserId == null ? [] : await db
      .select({ id: auditLogs.id, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.action, 'attendance.saved'),
        eq(auditLogs.entityType, 'event'),
        eq(auditLogs.entityId, String(session.eventId)),
        eq(auditLogs.actorUserId, actorUserId),
        sql`${auditLogs.createdAt} > now() - make_interval(mins => ${ATTENDANCE_SITTING_MINUTES})`,
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    let previous: Record<string, string> = {};
    if (last?.metadata) {
      try { previous = (JSON.parse(last.metadata) as { statuses?: Record<string, string> }).statuses ?? {}; } catch { previous = {}; }
    }
    const statuses = { ...previous };
    for (const mark of marks) statuses[String(mark.playerId)] = mark.status;
    const metadata = { title: session.title, startTime: session.startTime, marked: Object.keys(statuses).length, statuses };

    if (last) {
      await db.update(auditLogs).set({ metadata: JSON.stringify(metadata) }).where(eq(auditLogs.id, last.id));
      return;
    }
    await auditRequest(req, { action: 'attendance.saved', entityType: 'event', entityId: session.eventId, clubId: session.clubId, metadata });
  } catch (error) {
    console.error('[audit] Failed to record attendance.saved:', error);
  }
}

export type AuditLogQuery = {
  /** Null = every club (superadmin). */
  clubId: number | null;
  page?: number;
  pageSize?: number;
  /**
   * Action prefix, e.g. "finance." — or several, comma-separated, for a
   * family of actions in the Jurnal filter ("event.,attendance.,game.").
   */
  category?: string | null;
  actorUserId?: number | null;
  /** One entity's history, e.g. { entityType: 'player', entityId: '42' }. */
  entityType?: string | null;
  entityId?: string | null;
};

const MAX_PAGE_SIZE = 100;

/** A page of audit entries, newest first, with the actor's name. */
export async function listAuditLogs(query: AuditLogQuery) {
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.pageSize ?? 50)));
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const conditions: SQL[] = [];
  if (query.clubId != null) conditions.push(eq(auditLogs.clubId, query.clubId));
  const prefixes = String(query.category ?? '').split(',').map((part) => part.trim()).filter((part) => /^[a-z_.]{1,40}$/.test(part)).slice(0, 12);
  if (prefixes.length === 1) conditions.push(like(auditLogs.action, `${prefixes[0]}%`));
  else if (prefixes.length > 1) conditions.push(or(...prefixes.map((prefix) => like(auditLogs.action, `${prefix}%`)))!);
  if (query.actorUserId != null) conditions.push(eq(auditLogs.actorUserId, query.actorUserId));
  if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
  if (query.entityId) conditions.push(eq(auditLogs.entityId, query.entityId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorUserId: auditLogs.actorUserId,
        actorRole: auditLogs.actorRole,
        actorName: users.name,
        clubId: auditLogs.clubId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);

  const parsed = rows.map((row) => {
    let metadata: unknown = null;
    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : null;
    } catch {
      metadata = row.metadata;
    }
    return { ...row, metadata };
  });

  // Who an entry is about, by name: „plata #15 · Radu Stan” instead of a bare
  // id. Payments carry the player in their metadata; player entries are the
  // player. One query for the page; a deleted player just has no name.
  const subjectId = (row: (typeof parsed)[number]) => {
    const fromMeta = Number((row.metadata as { playerId?: unknown } | null)?.playerId);
    if (Number.isInteger(fromMeta) && fromMeta > 0) return fromMeta;
    const fromEntity = row.entityType === 'player' ? Number(row.entityId) : NaN;
    return Number.isInteger(fromEntity) && fromEntity > 0 ? fromEntity : null;
  };
  const ids = Array.from(new Set(parsed.map(subjectId).filter((id): id is number => id != null)));
  const names = new Map<number, string>();
  if (ids.length) {
    const found = await db
      .select({ id: players.id, name: players.name, firstName: players.firstName, lastName: players.lastName })
      .from(players)
      .where(inArray(players.id, ids));
    for (const player of found) {
      const name = [player.firstName, player.lastName].filter(Boolean).join(' ').trim() || player.name?.trim();
      if (name) names.set(player.id, name);
    }
  }

  return {
    page,
    pageSize,
    total: Number(total),
    logs: parsed.map((row) => {
      const id = subjectId(row);
      return { ...row, subjectName: id != null ? names.get(id) ?? null : null };
    }),
  };
}

/**
 * A player's history: changes to the roster record itself plus the payments
 * the club recorded for them (stored against the payment, with the player in
 * the metadata).
 */
export async function listPlayerHistory(clubId: number | null, playerId: number, limit = 50) {
  const forPlayer = or(
    and(eq(auditLogs.entityType, 'player'), eq(auditLogs.entityId, String(playerId))),
    and(eq(auditLogs.entityType, 'player_payment'), sql`${auditLogs.metadata}::jsonb ->> 'playerId' = ${String(playerId)}`),
  ) as SQL;
  const conditions: SQL[] = [forPlayer];
  if (clubId != null) conditions.push(eq(auditLogs.clubId, clubId));
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorUserId: auditLogs.actorUserId,
      actorRole: auditLogs.actorRole,
      actorName: users.name,
      clubId: auditLogs.clubId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(Math.min(100, Math.max(1, limit)));
  return rows.map((row) => {
    let metadata: unknown = null;
    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : null;
    } catch {
      metadata = row.metadata;
    }
    return { ...row, metadata };
  });
}
