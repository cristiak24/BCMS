import { Request, Response, NextFunction } from 'express';
import { firebaseAuth } from '../lib/firebaseAdmin';
import { db } from '../db';
import { users } from '../db/schema';
import { eq, or } from 'drizzle-orm';

export interface AuthenticatedRequest extends Request {
    user?: any; // You can type this properly based on your User model
    firebaseUser?: any;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await firebaseAuth.verifyIdToken(token);

        req.firebaseUser = decodedToken;

        // Fetch user from Postgres
        const userRows = await db
            .select()
            .from(users)
            .where(or(eq(users.firebaseUid, decodedToken.uid), eq(users.uid, decodedToken.uid)))
            .limit(1);
        if (userRows.length > 0) {
            req.user = userRows[0];
        }

        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

export const requireSuperadmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden: Requires superadmin role' });
    }
    next();
};
