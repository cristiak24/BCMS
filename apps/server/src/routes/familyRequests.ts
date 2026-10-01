import { Router, type Response } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { db } from '../db';
import { teams } from '../db/schema';
import { generateTeamCode } from '../lib/familyJoin';
import {
    approveJoinRequest,
    denyJoinRequest,
    JoinRequestError,
    listJoinRequests,
    type Reviewer,
} from '../lib/familyJoinService';
import { writeAuditLog } from '../services/auditService';

/**
 * Team-code signups waiting for a decision, and the team codes themselves.
 *
 *   GET  /api/family-requests?status=pending|all
 *   POST /api/family-requests/:id/approve   { playerId?: number | 'new' }  (omitted = auto)
 *   POST /api/family-requests/:id/deny
 *   POST /api/family-requests/approve-all   { ids: number[] }  — each auto-matched
 *   GET  /api/family-requests/team-codes
 *   POST /api/family-requests/team-codes/:teamId/rotate
 *
 * Club admins act on every team of their club; coaches on the teams they coach.
 */

const router = Router();
router.use(authenticate, requireRoles(['admin', 'coach']));

function reviewerOf(req: AuthenticatedRequest): Reviewer {
    return { id: Number(req.user?.id), role: String(req.user?.role ?? ''), clubId: req.user?.clubId == null ? null : Number(req.user.clubId) };
}

function fail(res: Response, error: unknown, fallback: string) {
    if (error instanceof JoinRequestError) {
        res.status(error.status).json({ error: error.message });
        return;
    }
    console.error(`[family-requests] ${fallback}:`, error);
    res.status(500).json({ error: fallback });
}

async function audit(req: AuthenticatedRequest, action: string, entityId: number, metadata: unknown) {
    await writeAuditLog({
        action,
        entityType: 'family_join_request',
        entityId,
        actorUserId: req.user?.id ?? null,
        actorUid: req.firebaseUser?.uid ?? null,
        actorRole: req.user?.role ?? null,
        clubId: req.user?.clubId ?? null,
        metadata,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
    }).catch(() => undefined);
}

router.get('/', async (req: AuthenticatedRequest, res) => {
    try {
        const status = req.query.status === 'all' ? 'all' : 'pending';
        res.json(await listJoinRequests(reviewerOf(req), status));
    } catch (error) {
        fail(res, error, 'Nu am putut încărca cererile.');
    }
});

const mutateLimit = rateLimit({ bucket: 'family-requests:mutate', limit: 120, windowMs: 60_000 });

router.post('/approve-all', mutateLimit, async (req: AuthenticatedRequest, res) => {
    const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 100) : [];
    const results: { id: number; ok: boolean; playerId?: number; created?: boolean; error?: string }[] = [];
    for (const id of ids) {
        try {
            const done = await approveJoinRequest(reviewerOf(req), id, 'auto');
            results.push({ id, ok: true, playerId: done.playerId, created: done.created });
            await audit(req, 'family_request.approve', id, { auto: true, playerId: done.playerId, created: done.created });
        } catch (error) {
            results.push({ id, ok: false, error: error instanceof Error ? error.message : 'Eroare' });
        }
    }
    res.json({ results });
});

router.post('/:id/approve', mutateLimit, async (req: AuthenticatedRequest, res) => {
    try {
        const id = Number(req.params.id);
        const raw = req.body?.playerId;
        const target = raw === 'new' ? 'new' : raw == null ? 'auto' : Number(raw);
        if (target !== 'new' && target !== 'auto' && (!Number.isInteger(target) || target <= 0)) {
            res.status(400).json({ error: 'Jucător invalid.' });
            return;
        }
        const done = await approveJoinRequest(reviewerOf(req), id, target);
        await audit(req, 'family_request.approve', id, { target, playerId: done.playerId, created: done.created });
        res.json(done);
    } catch (error) {
        fail(res, error, 'Nu am putut aproba cererea.');
    }
});

router.post('/:id/deny', mutateLimit, async (req: AuthenticatedRequest, res) => {
    try {
        const id = Number(req.params.id);
        const done = await denyJoinRequest(reviewerOf(req), id);
        await audit(req, 'family_request.deny', id, {});
        res.json(done);
    } catch (error) {
        fail(res, error, 'Nu am putut respinge cererea.');
    }
});

async function managedTeams(reviewer: Reviewer) {
    if (reviewer.clubId == null) return [];
    const filters = [eq(teams.clubId, reviewer.clubId), eq(teams.isActive, true)];
    if (reviewer.role === 'coach') filters.push(eq(teams.coachId, reviewer.id));
    return db.select({ id: teams.id, name: teams.name, code: teams.inviteCode }).from(teams).where(and(...filters)).orderBy(asc(teams.name));
}

router.get('/team-codes', async (req: AuthenticatedRequest, res) => {
    try {
        res.json(await managedTeams(reviewerOf(req)));
    } catch (error) {
        fail(res, error, 'Nu am putut încărca codurile echipelor.');
    }
});

router.post('/team-codes/:teamId/rotate', mutateLimit, async (req: AuthenticatedRequest, res) => {
    try {
        const teamId = Number(req.params.teamId);
        const team = (await managedTeams(reviewerOf(req))).find((t) => t.id === teamId);
        if (!team) {
            res.status(404).json({ error: 'Echipa nu există.' });
            return;
        }
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const [updated] = await db.update(teams)
                    .set({ inviteCode: generateTeamCode(), updatedAt: new Date().toISOString() })
                    .where(eq(teams.id, teamId))
                    .returning({ id: teams.id, name: teams.name, code: teams.inviteCode });
                await writeAuditLog({
                    action: 'team.join_code_rotate',
                    entityType: 'team',
                    entityId: teamId,
                    actorUserId: req.user?.id ?? null,
                    actorUid: req.firebaseUser?.uid ?? null,
                    actorRole: req.user?.role ?? null,
                    clubId: req.user?.clubId ?? null,
                    metadata: null,
                    ipAddress: req.ip ?? null,
                    userAgent: req.get('user-agent') ?? null,
                }).catch(() => undefined);
                res.json(updated);
                return;
            } catch (error: any) {
                if (error?.code !== '23505') throw error;
            }
        }
        res.status(500).json({ error: 'Nu am putut genera un cod nou. Încearcă din nou.' });
    } catch (error) {
        fail(res, error, 'Nu am putut schimba codul.');
    }
});

export default router;
