import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getRequestUser } from '../lib/requestContext';
import { isDemoAdmin } from '../lib/requestAuth';
import { admin, firestore, toIso } from '../lib/firebaseAdmin';

type NotificationPreferences = {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
};

const router = Router();

const uploadDir = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
});

const upload = multer({ storage });

async function findUserByNumericId(userId: number) {
    const snap = await firestore.collection('users').where('id', '==', userId).limit(1).get();
    return snap.docs[0] ?? null;
}

async function resolveProfileRecord(userId: number, reqClubId: string | undefined) {
    const userSnap = await findUserByNumericId(userId);
    if (!userSnap) {
        return null;
    }

    const user = userSnap.data() as {
        id: number;
        email: string;
        name: string;
        firstName?: string | null;
        lastName?: string | null;
        role: string;
        status: string;
        clubId?: number | null;
        avatarUrl?: string | null;
        phone?: string | null;
        preferredLanguage?: string | null;
        notificationPreferences?: NotificationPreferences | null;
        createdAt?: FirebaseFirestore.Timestamp | Date | string | null;
        lastLoginAt?: FirebaseFirestore.Timestamp | Date | string | null;
    };

    const clubId = user.clubId ?? (reqClubId ? Number(reqClubId) : null);
    const clubSnap = clubId ? await firestore.collection('clubs').doc(String(clubId)).get() : null;
    const clubName = clubSnap?.exists ? (clubSnap.data() as { name?: string }).name ?? null : null;

    const playerSnap = user.email
        ? await firestore.collection('players').where('email', '==', user.email).limit(1).get()
        : null;
    const player = playerSnap?.docs[0]?.data() as { firstName?: string; lastName?: string; id?: number; teamId?: number | null } | undefined;

    let teamName: string | null = null;
    if (player?.teamId != null) {
        const teamSnap = await firestore.collection('teams').doc(String(player.teamId)).get();
        teamName = teamSnap.exists ? (teamSnap.data() as { name?: string }).name ?? null : null;
    } else if (player?.id != null) {
        const relationSnap = await firestore.collection('playersToTeams').where('playerId', '==', player.id).limit(1).get();
        const relation = relationSnap.docs[0]?.data() as { teamId?: number } | undefined;
        if (relation?.teamId != null) {
            const teamSnap = await firestore.collection('teams').doc(String(relation.teamId)).get();
            teamName = teamSnap.exists ? (teamSnap.data() as { name?: string }).name ?? null : null;
        }
    }

    const firstName = user.firstName ?? player?.firstName ?? user.name.split(' ')[0] ?? '';
    const lastName = user.lastName ?? player?.lastName ?? user.name.split(' ').slice(1).join(' ') ?? '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || user.name;

    return {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName,
        lastName,
        fullName,
        role: user.role,
        status: user.status,
        clubId,
        clubName,
        teamName,
        avatarUrl: user.avatarUrl ?? null,
        phone: user.phone ?? null,
        preferredLanguage: user.preferredLanguage ?? null,
        notificationPreferences: (user.notificationPreferences ?? null) as NotificationPreferences | null,
        createdAt: toIso(user.createdAt) ?? null,
        lastLoginAt: toIso(user.lastLoginAt) ?? null,
    };
}

router.get('/me', async (req, res) => {
    try {
        const requestUser = await getRequestUser(req);

        if (!requestUser) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (requestUser.isHardcodedAdmin || (requestUser.id === 0 && isDemoAdmin(req))) {
            const clubId = requestUser.clubId ?? (req.header('x-user-club-id') ? Number(req.header('x-user-club-id')) : null);
            const clubSnap = clubId ? await firestore.collection('clubs').doc(String(clubId)).get() : null;
            const clubName = clubSnap?.exists ? (clubSnap.data() as { name?: string }).name ?? null : null;

            return res.json({
                id: 0,
                email: 'admin@test.com',
                name: 'Admin User',
                firstName: 'Admin',
                lastName: 'User',
                fullName: 'Admin User',
                role: 'admin',
                status: 'processed',
                clubId,
                clubName,
                teamName: null,
                avatarUrl: null,
                phone: null,
                preferredLanguage: null,
                notificationPreferences: { email: true, push: true, sms: false },
                createdAt: null,
                lastLoginAt: null,
            });
        }

        const profile = await resolveProfileRecord(requestUser.id, req.header('x-user-club-id'));

        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        return res.json(profile);
    } catch (error) {
        console.error('[GET /api/profile/me] error:', error);
        return res.status(500).json({ error: 'Failed to load profile' });
    }
});

router.patch('/me', async (req, res) => {
    try {
        const requestUser = await getRequestUser(req);

        if (!requestUser) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (requestUser.isHardcodedAdmin || (requestUser.id === 0 && isDemoAdmin(req))) {
            return res.status(400).json({ error: 'Demo admin profile cannot be edited from the database-backed profile endpoint.' });
        }

        const { firstName, lastName, phone, preferredLanguage, notificationPreferences } = req.body as {
            firstName?: string;
            lastName?: string;
            phone?: string | null;
            preferredLanguage?: string | null;
            notificationPreferences?: NotificationPreferences | null;
        };

        const trimmedFirstName = typeof firstName === 'string' ? firstName.trim() : undefined;
        const trimmedLastName = typeof lastName === 'string' ? lastName.trim() : undefined;
        const trimmedPhone = typeof phone === 'string' ? phone.trim() : phone === null ? null : undefined;
        const trimmedLanguage = typeof preferredLanguage === 'string' ? preferredLanguage.trim() : preferredLanguage === null ? null : undefined;

        const userSnap = await findUserByNumericId(requestUser.id);
        if (!userSnap) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const existingUser = userSnap.data() as { firstName?: string; lastName?: string; name: string };
        const nextName = [
            trimmedFirstName ?? existingUser.firstName ?? '',
            trimmedLastName ?? existingUser.lastName ?? '',
        ].filter(Boolean).join(' ').trim();

        await userSnap.ref.set({
            ...(trimmedFirstName !== undefined ? { firstName: trimmedFirstName } : {}),
            ...(trimmedLastName !== undefined ? { lastName: trimmedLastName } : {}),
            ...(trimmedPhone !== undefined ? { phone: trimmedPhone } : {}),
            ...(trimmedLanguage !== undefined ? { preferredLanguage: trimmedLanguage } : {}),
            ...(notificationPreferences !== undefined ? { notificationPreferences } : {}),
            ...(nextName ? { name: nextName } : {}),
            updatedAt: new Date(),
        }, { merge: true });

        const profile = await resolveProfileRecord(requestUser.id, req.header('x-user-club-id'));
        return res.json(profile);
    } catch (error) {
        console.error('[PATCH /api/profile/me] error:', error);
        return res.status(500).json({ error: 'Failed to update profile' });
    }
});

router.post('/me/password', async (_req, res) => {
    res.status(400).json({
        error: 'Password changes are handled by Firebase Auth on the client.',
    });
});

router.post('/me/avatar', upload.single('image'), async (req, res) => {
    try {
        const requestUser = await getRequestUser(req);

        if (!requestUser) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (requestUser.isHardcodedAdmin || (requestUser.id === 0 && isDemoAdmin(req))) {
            return res.status(400).json({ error: 'Demo admin avatar cannot be changed from the database-backed profile endpoint.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        const userSnap = await findUserByNumericId(requestUser.id);

        if (!userSnap) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        await userSnap.ref.set({
            avatarUrl,
            updatedAt: new Date(),
        }, { merge: true });

        return res.json({ success: true, avatarUrl });
    } catch (error) {
        console.error('[POST /api/profile/me/avatar] error:', error);
        return res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

export default router;
