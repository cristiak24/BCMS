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
        let userRows = await db
            .select()
            .from(users)
            .where(or(eq(users.firebaseUid, decodedToken.uid), eq(users.uid, decodedToken.uid)))
            .limit(1);

        if (userRows.length === 0 && decodedToken.email) {
            const email = decodedToken.email.trim().toLowerCase();
            const emailRows = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);

            if (emailRows[0]) {
                const updatedRows = await db
                    .update(users)
                    .set({
                        firebaseUid: decodedToken.uid,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(users.id, emailRows[0].id))
                    .returning();
                userRows = updatedRows;
            }
        }

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

export const requireRoles = (allowedRoles: string[]) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: User not found' });
        }
        
        if (req.user.role === 'superadmin') {
            return next();
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: `Forbidden: Requires one of roles: ${allowedRoles.join(', ')}` });
        }
        
        next();
    };
};
