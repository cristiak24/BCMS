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
exports.completePublicSignup = exports.completeInviteSignup = exports.validateInvite = exports.createClubAdminInvite = exports.api = void 0;
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const resend_1 = require("resend");
const app_1 = require("../../../apps/server/src/app");
const firebase_1 = require("../../../shared/firebase");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = admin.auth();
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'BCMS <onboarding@resend.dev>';
const appPublicUrl = process.env.APP_PUBLIC_URL?.trim() || 'http://localhost:8081';
const parsedInviteTtlHours = Number(process.env.INVITE_TTL_HOURS ?? firebase_1.INVITE_DEFAULT_TTL_HOURS);
const inviteTtlHours = Number.isFinite(parsedInviteTtlHours) && parsedInviteTtlHours > 0
    ? parsedInviteTtlHours
    : firebase_1.INVITE_DEFAULT_TTL_HOURS;
if (!resendApiKey) {
    console.warn('RESEND_API_KEY is not set. Club admin invites will not be emailed until it is configured.');
}
const resend = resendApiKey ? new resend_1.Resend(resendApiKey) : null;
const databaseUrlSecret = (0, params_1.defineSecret)('DATABASE_URL');
const resendApiKeySecret = (0, params_1.defineSecret)('RESEND_API_KEY');
const firebaseProjectIdSecret = (0, params_1.defineSecret)('FIREBASE_PROJECT_ID');
const firebaseClientEmailSecret = (0, params_1.defineSecret)('FIREBASE_CLIENT_EMAIL');
const firebasePrivateKeySecret = (0, params_1.defineSecret)('FIREBASE_PRIVATE_KEY');
const appBaseUrlSecret = (0, params_1.defineSecret)('APP_BASE_URL');
const frontendUrlSecret = (0, params_1.defineSecret)('FRONTEND_URL');
const inviteExpirationMinutesSecret = (0, params_1.defineSecret)('INVITE_EXPIRATION_MINUTES');
exports.api = (0, https_1.onRequest)({
    timeoutSeconds: 60,
    memory: '1GiB',
    secrets: [
        databaseUrlSecret,
        resendApiKeySecret,
        firebaseProjectIdSecret,
        firebaseClientEmailSecret,
        firebasePrivateKeySecret,
        appBaseUrlSecret,
        frontendUrlSecret,
        inviteExpirationMinutesSecret,
    ],
}, app_1.app);
function normalizeEmail(value) {
    return value.trim().toLowerCase();
}
function normalizeClubName(value) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
function hashInviteToken(rawToken) {
    return (0, crypto_1.createHash)('sha256').update(rawToken).digest('hex');
}
function buildClubDocId(normalizedClubName) {
    return `club_${(0, crypto_1.createHash)('sha256').update(normalizedClubName).digest('hex').slice(0, 16)}`;
}
function toIso(value) {
    return value ? value.toDate().toISOString() : null;
}
function assertAuthenticated(request) {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to perform this action.');
    }
    return request.auth;
}
async function loadCallerProfile(request) {
    const authContext = assertAuthenticated(request);
    const profileSnap = await db.collection('users').doc(authContext.uid).get();
    if (!profileSnap.exists) {
        throw new https_1.HttpsError('permission-denied', 'Your profile was not found.');
    }
    const profile = profileSnap.data();
    if (profile.role !== 'superadmin') {
        throw new https_1.HttpsError('permission-denied', 'Only superadmin accounts can perform this action.');
    }
    return { authContext, profile };
}
function ensureInviteIsActive(invite, inviteId) {
    const expiresAt = invite.expiresAt.toDate();
    if (invite.status === 'revoked') {
        throw new https_1.HttpsError('failed-precondition', 'This invite has been revoked.');
    }
    if (invite.status === 'used') {
        throw new https_1.HttpsError('failed-precondition', 'This invite has already been used.');
    }
    if (expiresAt.getTime() <= Date.now()) {
        void db.collection('invites').doc(inviteId).update({ status: 'expired' }).catch(() => undefined);
        throw new https_1.HttpsError('failed-precondition', 'This invite has expired.');
    }
}
async function loadInviteByTokenHash(tokenHash) {
    const querySnap = await db.collection('invites').where('tokenHash', '==', tokenHash).limit(1).get();
    const inviteDoc = querySnap.docs[0];
    if (!inviteDoc) {
        throw new https_1.HttpsError('not-found', 'This invite link is invalid or has expired.');
    }
    const invite = inviteDoc.data();
    return { id: inviteDoc.id, invite };
}
function buildSignupUrl(rawToken) {
    return `${appPublicUrl.replace(/\/+$/, '')}/signup?inviteToken=${encodeURIComponent(rawToken)}`;
}
async function sendClubAdminInviteEmail(params) {
    if (!resend) {
        throw new https_1.HttpsError('failed-precondition', 'Resend is not configured.');
    }
    await resend.emails.send({
        from: resendFromEmail,
        to: params.email,
        subject: `Join as Admin for Club ${params.clubName}`,
        html: `
      <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h1>Join as Admin for Club ${params.clubName}</h1>
        <p>You have been invited to manage <strong>${params.clubName}</strong> as an admin.</p>
        <p>This invite expires on <strong>${params.expiresAt.toLocaleString()}</strong>.</p>
        <p>
          <a href="${params.signupUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;">
            Complete signup
          </a>
        </p>
        <p>If the button does not work, copy this URL into your browser:</p>
        <p><a href="${params.signupUrl}">${params.signupUrl}</a></p>
      </div>
    `,
        text: `Join as Admin for Club ${params.clubName}. Complete signup here: ${params.signupUrl}. Invite expires on ${params.expiresAt.toISOString()}.`,
    });
}
async function nextNumericId(transaction, collectionName) {
    const ref = db.collection('__counters').doc(collectionName);
    const snap = await transaction.get(ref);
    const current = snap.exists ? Number(snap.get('value') ?? 0) : 0;
    const next = current + 1;
    transaction.set(ref, { value: next }, { merge: true });
    return next;
}
async function buildUserProfileDoc(transaction, params) {
    const now = admin.firestore.Timestamp.now();
    const id = await nextNumericId(transaction, 'users');
    return {
        id,
        uid: params.uid,
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        role: params.role,
        clubId: params.clubId,
        teamIds: params.teamIds,
        photoURL: params.photoURL ?? undefined,
        status: params.status ?? 'active',
        createdAt: now,
        updatedAt: now,
    };
}
async function setUserClaims(uid, profile) {
    await auth.setCustomUserClaims(uid, {
        role: profile.role,
        clubId: profile.clubId ?? null,
        teamIds: profile.teamIds ?? [],
        status: profile.status,
        superadmin: profile.role === 'superadmin',
    });
}
async function loadClubName(clubId) {
    if (!clubId) {
        return null;
    }
    const snap = await db.collection('clubs').doc(clubId).get();
    if (!snap.exists) {
        return null;
    }
    const club = snap.data();
    return club.name ?? null;
}
async function loadTeamName(teamId) {
    if (!teamId) {
        return null;
    }
    const snap = await db.collection('teams').doc(teamId).get();
    if (!snap.exists) {
        return null;
    }
    const team = snap.data();
    return team.name ?? null;
}
exports.createClubAdminInvite = (0, https_1.onCall)(async (request) => {
    const { authContext, profile } = await loadCallerProfile(request);
    const payload = request.data;
    const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : '';
    const clubName = typeof payload.clubName === 'string' ? payload.clubName.trim() : '';
    const normalizedClubName = clubName ? normalizeClubName(clubName) : '';
    if (!email) {
        throw new https_1.HttpsError('invalid-argument', 'Email is required.');
    }
    if (!clubName) {
        throw new https_1.HttpsError('invalid-argument', 'clubName is required.');
    }
    if (!normalizedClubName) {
        throw new https_1.HttpsError('invalid-argument', 'clubName must contain at least one non-space character.');
    }
    const rawToken = (0, crypto_1.randomBytes)(32).toString('base64url');
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + inviteTtlHours * 60 * 60 * 1000));
    const inviteRef = db.collection('invites').doc();
    const deterministicClubRef = db.collection('clubs').doc(buildClubDocId(normalizedClubName));
    const { clubId } = await db.runTransaction(async (transaction) => {
        const clubQuery = await transaction.get(db.collection('clubs').where('normalizedName', '==', normalizedClubName).limit(1));
        let clubRef;
        if (clubQuery.empty) {
            clubRef = deterministicClubRef;
            const clubSnap = await transaction.get(clubRef);
            if (clubSnap.exists) {
                transaction.set(clubRef, {
                    name: clubName,
                    normalizedName: normalizedClubName,
                    updatedAt: admin.firestore.Timestamp.now(),
                }, { merge: true });
            }
            else {
                transaction.set(clubRef, {
                    name: clubName,
                    normalizedName: normalizedClubName,
                    adminIds: [],
                    createdBy: authContext.uid,
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now(),
                });
            }
        }
        else {
            clubRef = clubQuery.docs[0].ref;
            transaction.set(clubRef, {
                name: clubName,
                normalizedName: normalizedClubName,
                updatedAt: admin.firestore.Timestamp.now(),
            }, { merge: true });
        }
        const inviteDoc = {
            email,
            role: 'admin',
            clubId: clubRef.id,
            clubName,
            tokenHash,
            status: 'active',
            expiresAt,
            createdBy: profile.uid,
            createdAt: admin.firestore.Timestamp.now(),
        };
        transaction.set(inviteRef, inviteDoc);
        return { clubId: clubRef.id };
    });
    const signupUrl = buildSignupUrl(rawToken);
    try {
        await sendClubAdminInviteEmail({
            email,
            clubName,
            signupUrl,
            expiresAt: expiresAt.toDate(),
        });
    }
    catch (error) {
        await inviteRef.update({ status: 'revoked' }).catch(() => undefined);
        throw error;
    }
    const result = {
        inviteId: inviteRef.id,
        email,
        role: 'admin',
        clubId,
        clubName,
        status: 'active',
        expiresAt: expiresAt.toDate().toISOString(),
        signupUrl,
    };
    return result;
});
exports.validateInvite = (0, https_1.onCall)(async (request) => {
    const payload = request.data;
    const rawToken = typeof payload.token === 'string' ? payload.token.trim() : '';
    if (!rawToken) {
        throw new https_1.HttpsError('invalid-argument', 'token is required.');
    }
    const tokenHash = hashInviteToken(rawToken);
    const { id, invite } = await loadInviteByTokenHash(tokenHash);
    ensureInviteIsActive(invite, id);
    const result = {
        email: invite.email,
        role: invite.role,
        clubId: invite.clubId,
        clubName: invite.clubName,
    };
    return result;
});
exports.completeInviteSignup = (0, https_1.onCall)(async (request) => {
    const authContext = assertAuthenticated(request);
    const payload = request.data;
    const rawToken = typeof payload.token === 'string' ? payload.token.trim() : '';
    const uid = typeof payload.uid === 'string' ? payload.uid.trim() : '';
    const firstName = typeof payload.firstName === 'string' ? payload.firstName.trim() : '';
    const lastName = typeof payload.lastName === 'string' ? payload.lastName.trim() : '';
    if (!rawToken || !uid || !firstName || !lastName) {
        throw new https_1.HttpsError('invalid-argument', 'token, uid, firstName, and lastName are required.');
    }
    if (authContext.uid !== uid) {
        throw new https_1.HttpsError('permission-denied', 'The authenticated user does not match the provided uid.');
    }
    const tokenHash = hashInviteToken(rawToken);
    const authUser = await auth.getUser(uid);
    const authEmail = normalizeEmail(authUser.email ?? '');
    if (!authEmail) {
        throw new https_1.HttpsError('failed-precondition', 'The authenticated account does not have an email address.');
    }
    const { profile } = await db.runTransaction(async (transaction) => {
        const inviteQuery = await transaction.get(db.collection('invites').where('tokenHash', '==', tokenHash).limit(1));
        const inviteDoc = inviteQuery.docs[0];
        if (!inviteDoc) {
            throw new https_1.HttpsError('not-found', 'This invite link is invalid or has expired.');
        }
        const invite = inviteDoc.data();
        ensureInviteIsActive(invite, inviteDoc.id);
        const inviteEmail = normalizeEmail(invite.email);
        if (authEmail !== inviteEmail) {
            throw new https_1.HttpsError('permission-denied', 'The signed-in account does not match the invite email.');
        }
        const clubRef = db.collection('clubs').doc(invite.clubId);
        const clubSnap = await transaction.get(clubRef);
        if (!clubSnap.exists) {
            throw new https_1.HttpsError('not-found', 'The selected club does not exist.');
        }
        const profileDoc = await buildUserProfileDoc(transaction, {
            uid,
            email: authEmail,
            firstName,
            lastName,
            role: 'admin',
            clubId: invite.clubId,
            teamIds: [],
            photoURL: authUser.photoURL ?? null,
            status: 'active',
        });
        transaction.set(db.collection('users').doc(uid), profileDoc, { merge: true });
        transaction.update(inviteDoc.ref, {
            status: 'used',
            usedAt: admin.firestore.Timestamp.now(),
            usedBy: uid,
        });
        transaction.update(clubRef, {
            adminIds: admin.firestore.FieldValue.arrayUnion(uid),
            updatedAt: admin.firestore.Timestamp.now(),
        });
        return { profile: profileDoc };
    });
    await setUserClaims(uid, profile);
    const clubName = await loadClubName(profile.clubId ?? null);
    return {
        uid: profile.uid,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        role: profile.role,
        clubId: profile.clubId,
        teamIds: profile.teamIds ?? [],
        photoURL: profile.photoURL ?? null,
        status: profile.status,
        createdAt: profile.createdAt.toDate().toISOString(),
        updatedAt: profile.updatedAt.toDate().toISOString(),
        clubName,
        teamName: null,
    };
});
exports.completePublicSignup = (0, https_1.onCall)(async (request) => {
    const authContext = assertAuthenticated(request);
    const payload = request.data;
    const firstName = typeof payload.firstName === 'string' ? payload.firstName.trim() : '';
    const lastName = typeof payload.lastName === 'string' ? payload.lastName.trim() : '';
    const role = payload.role;
    const clubId = typeof payload.clubId === 'string' ? payload.clubId.trim() : '';
    const teamId = typeof payload.teamId === 'string' ? payload.teamId.trim() : '';
    const photoURL = typeof payload.photoURL === 'string' ? payload.photoURL.trim() : undefined;
    if (!firstName || !lastName) {
        throw new https_1.HttpsError('invalid-argument', 'firstName and lastName are required.');
    }
    if (role !== 'player' && role !== 'coach') {
        throw new https_1.HttpsError('permission-denied', 'Public signup can only create player or coach accounts.');
    }
    if (role === 'coach' && !clubId) {
        throw new https_1.HttpsError('invalid-argument', 'clubId is required for coach signups.');
    }
    if (teamId) {
        if (!clubId) {
            throw new https_1.HttpsError('invalid-argument', 'clubId is required when teamId is provided.');
        }
        const teamSnap = await db.collection('teams').doc(teamId).get();
        if (!teamSnap.exists) {
            throw new https_1.HttpsError('not-found', 'The selected team does not exist.');
        }
        const team = teamSnap.data();
        if (team.clubId !== clubId) {
            throw new https_1.HttpsError('invalid-argument', 'Selected team does not belong to the chosen club.');
        }
    }
    const email = normalizeEmail(authContext.token.email ?? '');
    if (!email) {
        throw new https_1.HttpsError('failed-precondition', 'The authenticated user does not have an email address.');
    }
    const profile = await db.runTransaction(async (transaction) => {
        const profileDoc = await buildUserProfileDoc(transaction, {
            uid: authContext.uid,
            email,
            firstName,
            lastName,
            role,
            clubId: clubId || undefined,
            teamIds: teamId ? [teamId] : [],
            photoURL: photoURL || authContext.token.picture || null,
            status: 'active',
        });
        transaction.set(db.collection('users').doc(authContext.uid), profileDoc, { merge: true });
        return profileDoc;
    });
    await setUserClaims(authContext.uid, profile);
    if (profile.role === 'coach' && profile.clubId) {
        await db.collection('clubs').doc(profile.clubId).set({
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    const [clubName, teamName] = await Promise.all([
        loadClubName(profile.clubId ?? null),
        loadTeamName(profile.teamIds?.[0] ?? null),
    ]);
    return {
        uid: profile.uid,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        role: profile.role,
        clubId: profile.clubId,
        teamIds: profile.teamIds ?? [],
        photoURL: profile.photoURL ?? null,
        status: profile.status,
        createdAt: profile.createdAt.toDate().toISOString(),
        updatedAt: profile.updatedAt.toDate().toISOString(),
        clubName,
        teamName,
    };
});
