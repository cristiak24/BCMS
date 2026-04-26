"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.firebaseAuth = exports.admin = void 0;
exports.toIso = toIso;
const admin = __importStar(require("firebase-admin"));
exports.admin = admin;
const loadEnv_1 = require("./loadEnv");
(0, loadEnv_1.loadServerEnv)();
function initAdminApp() {
    var _a, _b, _c;
    if (admin.apps.length) {
        return;
    }
    const serviceAccountJson = (_a = process.env.FIREBASE_SERVICE_ACCOUNT_JSON) === null || _a === void 0 ? void 0 : _a.trim();
    const projectId = ((_b = process.env.FIREBASE_PROJECT_ID) === null || _b === void 0 ? void 0 : _b.trim()) ||
        ((_c = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) === null || _c === void 0 ? void 0 : _c.trim()) ||
        'bcms-61b00';
    if (serviceAccountJson) {
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || projectId,
        });
        return;
    }
    // No service account — init with projectId only.
    // Token verification works without a service account because Firebase Admin
    // verifies tokens using Google's public JWKS endpoint (no ADC needed).
    admin.initializeApp({ projectId });
}
initAdminApp();
// Export only what we need — do NOT init Firestore (we use Postgres)
exports.firebaseAuth = admin.auth();
function toIso(value) {
    if (!value)
        return null;
    if (typeof value === 'string' || typeof value === 'number')
        return new Date(value).toISOString();
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === 'object' &&
        value &&
        'toDate' in value &&
        typeof value.toDate === 'function') {
        return value.toDate().toISOString();
    }
    return null;
}
