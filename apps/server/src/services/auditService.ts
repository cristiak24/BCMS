import { and, count, desc, eq, like, type SQL } from 'drizzle-orm';
import { db } from '../db';
import { auditLogs, users } from '../db/schema';

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

export type AuditLogQuery = {
  /** Null = every club (superadmin). */
  clubId: number | null;
  page?: number;
  pageSize?: number;
  /** Action prefix, e.g. "finance." or "club_admin.". */
  category?: string | null;
  actorUserId?: number | null;
};

const MAX_PAGE_SIZE = 100;

/** A page of audit entries, newest first, with the actor's name. */
export async function listAuditLogs(query: AuditLogQuery) {
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.pageSize ?? 50)));
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const conditions: SQL[] = [];
  if (query.clubId != null) conditions.push(eq(auditLogs.clubId, query.clubId));
  if (query.category && /^[a-z_.]{1,40}$/.test(query.category)) conditions.push(like(auditLogs.action, `${query.category}%`));
  if (query.actorUserId != null) conditions.push(eq(auditLogs.actorUserId, query.actorUserId));
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

  return {
    page,
    pageSize,
    total: Number(total),
    logs: rows.map((row) => {
      let metadata: unknown = null;
      try {
        metadata = row.metadata ? JSON.parse(row.metadata) : null;
      } catch {
        metadata = row.metadata;
      }
      return { ...row, metadata };
    }),
  };
}
