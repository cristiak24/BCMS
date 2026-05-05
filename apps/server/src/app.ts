import express from 'express';
import cors from 'cors';
import path from 'path';
import financeRoutes, { stripeWebhookHandler } from './routes/finance';
import userRoutes from './routes/users';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import adminRouter from './routes/admin';
import manageAccessRoutes from './routes/manageAccess';
import clubAdminRoutes from './routes/clubAdmin';
import invitationsRoutes from './routes/invitations';
import clubsRoutes from './routes/clubs';
import superAdminRoutes from './routes/superAdmin';
import basketballRoutes from './routes/basketball';
import dashboardRoutes from './routes/dashboard';
import teamsRoutes from './routes/teams';
import playerRoutes from './routes/playerRoutes';
import eventRoutes from './routes/eventRoutes';
import documentRoutes from './routes/documents';
import { loadServerEnv } from './lib/loadEnv';

loadServerEnv();

function normalizeOrigin(value?: string | null) {
    return value?.trim().replace(/\/+$/, '') || null;
}

function normalizeAllowedOrigin(value?: string | null) {
    const trimmed = value?.trim().replace(/\/+$/, '');
    if (!trimmed) {
        return null;
    }

    try {
        return new URL(trimmed).origin;
    } catch {
        try {
            return new URL(`https://${trimmed}`).origin;
        } catch {
            return null;
        }
    }
}

function createAllowedOrigins() {
    const projectId = process.env.GCLOUD_PROJECT?.trim() || process.env.GOOGLE_CLOUD_PROJECT?.trim() || null;
    const configuredOrigins = [
        process.env.FRONTEND_URL,
        process.env.APP_BASE_URL,
        process.env.FIREBASE_HOSTING_URL,
        'https://bcms.ro',
        'https://www.bcms.ro',
        projectId ? `https://${projectId}.web.app` : null,
        projectId ? `https://${projectId}.firebaseapp.com` : null,
    ]
        .flatMap((value) => String(value ?? '').split(','))
        .map(normalizeAllowedOrigin)
        .filter((value): value is string => Boolean(value));

    const developmentOrigins = [
        'http://localhost:8081',
        'http://127.0.0.1:8081',
        'http://localhost:19006',
        'http://127.0.0.1:19006',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5000',
        'http://127.0.0.1:5000',
    ];

    return new Set([
        ...configuredOrigins,
        ...(process.env.NODE_ENV === 'production' ? [] : developmentOrigins),
    ]);
}

export function createServerApp() {
    const app = express();
    const allowedOrigins = createAllowedOrigins();

    app.use(cors({
        origin(origin, callback) {
            if (!origin) {
                callback(null, true);
                return;
            }

            const normalizedOrigin = normalizeOrigin(origin);
            if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
                callback(null, true);
                return;
            }

            try {
                const parsedOrigin = new URL(origin);
                const hostname = parsedOrigin.hostname.toLowerCase();
                const trustedHostname =
                    hostname === 'bcms.ro' ||
                    hostname === 'www.bcms.ro' ||
                    hostname.endsWith('.web.app') ||
                    hostname.endsWith('.firebaseapp.com');

                if (trustedHostname) {
                    callback(null, true);
                    return;
                }
            } catch {
                // Fall through to rejection below.
            }

            callback(new Error(`CORS blocked origin: ${origin}`));
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-User-Id', 'X-User-Uid', 'X-User-Role', 'X-User-Club-Id'],
        exposedHeaders: ['Content-Length', 'Content-Type'],
    }));
    app.post('/api/finance/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
    app.use(express.json());

    console.log('Registering routes...');
    app.use((req, res, next) => {
        console.log(`[Request] ${req.method} ${req.path}`);
        next();
    });

    app.use('/api/finance', financeRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/profile', profileRoutes);
    app.use('/api/admin', adminRouter);
    app.use('/api/manage-access', manageAccessRoutes);
    app.use('/api/club-admin', clubAdminRoutes);
    app.use('/api/invitations', invitationsRoutes);
    app.use('/api/clubs', clubsRoutes);
    app.use('/api/super-admin', superAdminRoutes);
    app.use('/api/basketball', basketballRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/teams', teamsRoutes);
    app.use('/api/players', playerRoutes);
    app.use('/api/events', eventRoutes);
    app.use('/api/documents', documentRoutes);

    app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

    console.log('Routes registered.');

    app.get('/', (_req, res) => {
        res.send('BCMS API is running');
    });

    return app;
}

export const app = createServerApp();
