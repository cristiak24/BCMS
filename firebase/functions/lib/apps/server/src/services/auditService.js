"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = writeAuditLog;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
async function writeAuditLog(input) {
    await db_1.db.insert(schema_1.auditLogs).values({
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId == null ? null : String(input.entityId),
        actorUserId: input.actorUserId ?? null,
        actorUid: input.actorUid ?? null,
        actorRole: input.actorRole ?? null,
        clubId: input.clubId ?? null,
        metadata: input.metadata == null ? null : JSON.stringify(input.metadata),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
    });
}
