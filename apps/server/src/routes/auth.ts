import { Router } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Hardcoded Admin User (Bypass DB)
        if (email === 'admin@test.com' && password === '12341234') {
            return res.json({
                success: true,
                token: "mock-jwt-token-admin",
                user: {
                    id: 0,
                    email: 'admin@test.com',
                    name: 'Admin User',
                    role: 'admin'
                }
            });
        }

        // Cautam utilizatorul in baza de date
        const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
        const user = result[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verificam parola
        if (user.passwordHash !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check user status
        // Allow if role is admin OR status is processed
        if (user.role !== 'admin' && user.status !== 'processed') {
            return res.status(403).json({ error: 'Account is pending approval or rejected.' });
        }

        // Returnam succes si datele utilizatorului (fara parola)
        const { passwordHash, ...userSafe } = user;

        // Aici s-ar genera un JWT token in mod normal
        const token = "mock-jwt-token-" + user.id;

        res.json({
            success: true,
            token,
            user: userSafe
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }

        // Check if user exists
        const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (existingUser.length > 0) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Create new user with 'pending' status
        const newUser = await db.insert(users).values({
            email,
            passwordHash: password, // TODO: Hash password
            name,
            role: 'coach', // Default role
            status: 'pending'
        }).returning();

        res.status(201).json({
            success: true,
            user: {
                id: newUser[0].id,
                email: newUser[0].email,
                name: newUser[0].name,
                status: newUser[0].status
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
