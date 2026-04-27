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
exports.firebaseAuth = exports.firestore = exports.admin = void 0;
exports.toDate = toDate;
exports.toIso = toIso;
exports.fetchDocById = fetchDocById;
exports.fetchDocByNumericId = fetchDocByNumericId;
exports.nextNumericId = nextNumericId;
const admin = __importStar(require("firebase-admin"));
exports.admin = admin;
const loadEnv_1 = require("./loadEnv");
(0, loadEnv_1.loadServerEnv)();
function initAdminApp() {
    var _a, _b, _c, _d;
    if (admin.apps.length) {
        return;
    }
    const serviceAccountJson = (_a = process.env.FIREBASE_SERVICE_ACCOUNT_JSON) === null || _a === void 0 ? void 0 : _a.trim();
    const projectId = (_b = process.env.FIREBASE_PROJECT_ID) === null || _b === void 0 ? void 0 : _b.trim();
    const clientEmail = (_c = process.env.FIREBASE_CLIENT_EMAIL) === null || _c === void 0 ? void 0 : _c.trim();
    const privateKey = (_d = process.env.FIREBASE_PRIVATE_KEY) === null || _d === void 0 ? void 0 : _d.replace(/\\n/g, '\n');
    if (!projectId) {
        throw new Error('FIREBASE_PROJECT_ID is required.');
    }
    if (serviceAccountJson) {
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || projectId,
        });
        return;
    }
    if (clientEmail && privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey,
            }),
            projectId,
        });
        return;
    }
    // No service account — init with projectId only.
    // Token verification works without a service account because Firebase Admin
    // verifies tokens using Google's public JWKS endpoint (no ADC needed).
    admin.initializeApp({ projectId });
}
initAdminApp();
// Firestore is still used by a number of legacy routes/controllers.
exports.firestore = admin.firestore();
exports.firebaseAuth = admin.auth();
function toDate(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'object' &&
        value &&
        'toDate' in value &&
        typeof value.toDate === 'function') {
        return value.toDate();
    }
    return null;
}
function toIso(value) {
    var _a, _b;
    return (_b = (_a = toDate(value)) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null;
}
function fetchDocById(collectionName, id) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const snap = yield exports.firestore.collection(collectionName).doc(String(id)).get();
        if (!snap.exists) {
            return null;
        }
        const data = snap.data();
        return Object.assign(Object.assign({}, data), { id: (_a = data.id) !== null && _a !== void 0 ? _a : snap.id });
    });
}
function fetchDocByNumericId(collectionName, id) {
    return __awaiter(this, void 0, void 0, function* () {
        const snap = yield exports.firestore.collection(collectionName).where('id', '==', id).limit(1).get();
        const doc = snap.docs[0];
        if (!doc) {
            return null;
        }
        const data = doc.data();
        return Object.assign(Object.assign({}, data), { id: typeof data.id === 'number' ? data.id : Number(data.id) || id });
    });
}
function nextNumericId(counterName) {
    return __awaiter(this, void 0, void 0, function* () {
        const counterRef = exports.firestore.collection('__counters__').doc(counterName);
        const nextValue = yield exports.firestore.runTransaction((tx) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const snap = yield tx.get(counterRef);
            const current = snap.exists ? Number((_a = snap.data().value) !== null && _a !== void 0 ? _a : 0) : 0;
            const next = current + 1;
            tx.set(counterRef, { value: next, updatedAt: new Date() }, { merge: true });
            return next;
        }));
        return nextValue;
    });
}
