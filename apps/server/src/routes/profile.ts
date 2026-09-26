import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import { requireRequestUser } from '../lib/requestContext';
import { authenticate } from '../middleware/auth';
import { toIso } from '../lib/dateUtils';
import { db } from '../db';
import { clubs, players, playersToTeams, teams, users } from '../db/schema';

type NotificationPreferences = {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
};

const router = Router();

// Defence in depth: `requireRequestUser` already verifies the bearer token in
// every handler, but rejecting unauthenticated calls at the router boundary
// means a future handler cannot forget to do so.
router.use(authenticate);

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_AVATAR_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const uploadDir = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const extension = path.extname(file.originalname).toLowerCase();
        cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype) || !ALLOWED_AVATAR_EXTENSIONS.has(extension)) {
            cb(new Error('Only JPG, PNG or WebP images up to 2MB are allowed.'));
            return;
        }

        cb(null, true);
    },
});

async function findUserByNumericId(userId: number) {
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ?? null;
}

async function resolveProfileRecord(userId: number) {
    const user = await findUserByNumericId(userId);
    if (!user) {
        return null;
    }

    const clubId = user.clubId ?? null;
    const clubRows = clubId == null
        ? []
        : await db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, clubId)).limit(1);
    const clubName = clubRows[0]?.name ?? null;

    const playerRows = user.email
        ? await db.select().from(players).where(eq(players.email, user.email)).limit(1)
        : [];
    const player = playerRows[0];

    let teamName: string | null = null;
    const teamIds = new Set<number>();
    if (player?.teamId != null) {
        teamIds.add(player.teamId);
        const teamRows = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, player.teamId)).limit(1);
        teamName = teamRows[0]?.name ?? null;
    }

    if (player?.id != null) {
        const relationRows = await db
            .select()
            .from(playersToTeams)
            .where(eq(playersToTeams.playerId, player.id));

        relationRows.forEach((relation) => teamIds.add(relation.teamId));

        if (!teamName && relationRows[0]?.teamId != null) {
            const teamRows = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, relationRows[0].teamId)).limit(1);
            teamName = teamRows[0]?.name ?? null;
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
        teamIds: Array.from(teamIds).map(String),
        avatarUrl: user.avatarUrl ?? null,
        phone: user.phone ?? null,
        preferredLanguage: user.preferredLanguage ?? null,
        notificationPreferences: null as NotificationPreferences | null,
        createdAt: toIso(user.createdAt) ?? null,
        lastLoginAt: toIso(user.lastLoginAt) ?? null,
    };
}

router.get('/me', async (req, res) => {
    try {
        const requestUser = await requireRequestUser(req, res);

        if (!requestUser) {
            return;
        }

        const profile = await resolveProfileRecord(requestUser.id);

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
        const requestUser = await requireRequestUser(req, res);

        if (!requestUser) {
            return;
        }

        const { firstName, lastName, phone, preferredLanguage } = req.body as {
            firstName?: string;
            lastName?: string;
            phone?: string | null;
            preferredLanguage?: string | null;
        };

        const trimmedFirstName = typeof firstName === 'string' ? firstName.trim() : undefined;
        const trimmedLastName = typeof lastName === 'string' ? lastName.trim() : undefined;
        const trimmedPhone = typeof phone === 'string' ? phone.trim() : phone === null ? null : undefined;
        const trimmedLanguage = typeof preferredLanguage === 'string' ? preferredLanguage.trim() : preferredLanguage === null ? null : undefined;

        // Reject junk before it reaches the database: these values are rendered
        // back into the UI and used in emails, so unbounded strings are not ok.
        for (const [label, value, max] of [
            ['firstName', trimmedFirstName, 80],
            ['lastName', trimmedLastName, 80],
            ['phone', trimmedPhone, 32],
            ['preferredLanguage', trimmedLanguage, 16],
        ] as const) {
            if (typeof value === 'string' && value.length > max) {
                return res.status(400).json({ error: `${label} must be at most ${max} characters.` });
            }
        }

        if (typeof trimmedPhone === 'string' && trimmedPhone && !/^[+()\d\s-]{6,32}$/.test(trimmedPhone)) {
            return res.status(400).json({ error: 'Phone number format is invalid.' });
        }

        const existingUser = await findUserByNumericId(requestUser.id);
        if (!existingUser) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const nextName = [
            trimmedFirstName ?? existingUser.firstName ?? '',
            trimmedLastName ?? existingUser.lastName ?? '',
        ].filter(Boolean).join(' ').trim();

        await db.update(users).set({
            ...(trimmedFirstName !== undefined ? { firstName: trimmedFirstName } : {}),
            ...(trimmedLastName !== undefined ? { lastName: trimmedLastName } : {}),
            ...(trimmedPhone !== undefined ? { phone: trimmedPhone } : {}),
            ...(trimmedLanguage !== undefined ? { preferredLanguage: trimmedLanguage } : {}),
            ...(nextName ? { name: nextName } : {}),
            updatedAt: new Date().toISOString(),
        }).where(eq(users.id, requestUser.id));

        const profile = await resolveProfileRecord(requestUser.id);
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

router.post('/me/avatar', (req, res, next) => {
    upload.single('image')(req, res, (error) => {
        if (error) {
            return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid avatar upload.' });
        }

        next();
    });
}, async (req, res) => {
    try {
        const requestUser = await requireRequestUser(req, res);

        if (!requestUser) {
            if (req.file) {
                fs.unlink(req.file.path, () => {});
            }
            return;
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        const existingUser = await findUserByNumericId(requestUser.id);

        if (!existingUser) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        await db.update(users).set({
            avatarUrl,
            updatedAt: new Date().toISOString(),
        }).where(eq(users.id, requestUser.id));

        return res.json({ success: true, avatarUrl });
    } catch (error) {
        console.error('[POST /api/profile/me/avatar] error:', error);
        return res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

export default router;
