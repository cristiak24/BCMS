import express from 'express';
import financeRoutes from './routes/finance';
import userRoutes from './routes/users';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import adminRouter from './routes/admin';
import manageAccessRoutes from './routes/manageAccess';
import basketballRoutes from './routes/basketball';
import dashboardRoutes from './routes/dashboard';

import teamsRoutes from './routes/teams';
import playerRoutes from './routes/playerRoutes';
import eventRoutes from './routes/eventRoutes';
import documentRoutes from './routes/documents';
import path from 'path';
import { loadServerEnv } from './lib/loadEnv';

loadServerEnv();

const app = express();
const port = process.env.PORT || 3000;

// Manual CORS middleware — sets headers directly, fully compatible with Express 5
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Accept, X-User-Id, X-User-Uid, X-User-Role, X-User-Club-Id'
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
    // Respond to preflight immediately
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
});
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
app.use('/api/basketball', basketballRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/documents', documentRoutes);

// Serve uploads statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

console.log('Routes registered.');

app.get('/', (_req, res) => {
    res.send('BCMS API is running');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
