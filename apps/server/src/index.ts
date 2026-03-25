import express from 'express';
import dotenv from 'dotenv';
import financeRoutes from './routes/finance';
import userRoutes from './routes/users';
import authRoutes from './routes/auth';
import adminRouter from './routes/admin';
import basketballRoutes from './routes/basketball';

import teamsRoutes from './routes/teams';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Manual CORS middleware — sets headers directly, fully compatible with Express 5
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
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
app.use('/api/admin', adminRouter);
app.use('/api/basketball', basketballRoutes);
app.use('/api/teams', teamsRoutes);

console.log('Routes registered.');

app.get('/', (_req, res) => {
    res.send('BCMS API is running');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

