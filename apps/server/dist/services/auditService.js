"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = writeAuditLog;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
function writeAuditLog(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        yield db_1.db.insert(schema_1.auditLogs).values({
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId == null ? null : String(input.entityId),
            actorUserId: (_a = input.actorUserId) !== null && _a !== void 0 ? _a : null,
            actorUid: (_b = input.actorUid) !== null && _b !== void 0 ? _b : null,
            actorRole: (_c = input.actorRole) !== null && _c !== void 0 ? _c : null,
            clubId: (_d = input.clubId) !== null && _d !== void 0 ? _d : null,
            metadata: input.metadata == null ? null : JSON.stringify(input.metadata),
            ipAddress: (_e = input.ipAddress) !== null && _e !== void 0 ? _e : null,
            userAgent: (_f = input.userAgent) !== null && _f !== void 0 ? _f : null,
        });
    });
}
