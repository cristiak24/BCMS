import { db } from '../db';
import { auditLogs } from '../db/schema';

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

export async function writeAuditLog(input: AuditLogInput) {
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
}
