import express from 'express';
import cors from 'cors';
import path from 'path';
import financeRoutes, { stripeWebhookHandler } from './routes/finance';
import userRoutes from './routes/users';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
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
import l12Routes from './routes/l12';
import clubDocumentRoutes from './routes/clubDocuments';
import contactRoutes from './routes/contacts';
import notificationRoutes from './routes/notificationRoutes';
import { loadServerEnv } from './lib/loadEnv';
import { createAllowedOrigins, isOriginAllowed } from './lib/corsOrigins';

loadServerEnv();

export function createServerApp() {
    const app = express();
    const allowedOrigins = createAllowedOrigins(process.env);

    app.use(cors({
        origin(origin, callback) {
            // No Origin header: same-origin, server-to-server, curl, Stripe
            // webhooks. CORS is a browser mechanism; nothing to enforce.
            if (!origin || isOriginAllowed(origin, allowedOrigins, process.env)) {
                callback(null, true);
                return;
            }

            // Answer WITHOUT CORS headers (the browser then blocks the read)
            // instead of throwing — an Error here fell through to the global
            // handler and turned every rejected preflight into a logged 500.
            console.warn(`[CORS] rejected origin: ${origin}`);
            callback(null, false);
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        // Identity is proven by the Firebase ID token in `Authorization` only.
        // The old `X-User-*` headers are no longer read by the server and are
        // deliberately not allowed through CORS either.
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
        exposedHeaders: ['Content-Length', 'Content-Type'],
    }));
    app.post('/api/finance/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
    app.use(express.json());

    app.use((req, res, next) => {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Request] ${req.method} ${req.path}`);
        }
        next();
    });

    app.use('/api/finance', financeRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/profile', profileRoutes);
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
    app.use('/api/l12', l12Routes);
    app.use('/api/club-documents', clubDocumentRoutes);
    app.use('/api/contacts', contactRoutes);
    app.use('/api/notifications', notificationRoutes);

    app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

    app.get('/', (_req, res) => {
        res.send('BCMS API is running');
    });

    app.use('/api', (_req, res) => {
        res.status(404).json({ success: false, error: 'API route not found.' });
    });

    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        console.error('[Unhandled API error]', error);
        res.status(500).json({ success: false, error: 'Internal server error.' });
    });

    return app;
}

export const app = createServerApp();
