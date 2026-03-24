import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import financeRoutes from './routes/finance';
import userRoutes from './routes/users';
import authRoutes from './routes/auth';
import adminRouter from './routes/admin';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
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

console.log('Routes registered.');

app.get('/', (req, res) => {
    res.send('BCMS API is running');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
