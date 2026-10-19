import { Request, Response, NextFunction } from 'express';
import { verifyBearerToken, type ClerkAuthUser } from '../lib/clerkAuth';
import { findOrLinkUser } from '../lib/identityLink';
import { recordActivity } from '../lib/activityTracker';
import type { users } from '../db/schema';

/** A `users` row as Drizzle selects it. */
export type User = typeof users.$inferSelect;

export interface AuthenticatedRequest extends Request {
    /** The caller's row; absent when the verified identity has no profile yet. */
    user?: User;
    // Despite the name (kept to avoid touching every call site), this holds
    // the verified Clerk identity: { uid: <clerk user id>, email }.
    firebaseUser?: ClerkAuthUser;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await verifyBearerToken(token);

        req.firebaseUser = decodedToken;

        // The caller's row; a first sign-in is linked by verified email only
        // when that row isn't someone else's (lib/identityLink.ts).
        const user = await findOrLinkUser(decodedToken);

        if (user) {
            // A deactivated account must not be able to act anywhere, not just on
            // the role-gated routes. Rejecting here means an admin who deactivates
            // a user revokes their access on the very next request, rather than
            // leaving them with a working session until the token expires.
            if (user.status === 'disabled') {
                return res.status(403).json({ error: 'This account has been disabled.' });
            }

            req.user = user;
            recordActivity(user);
        }

        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

export const requireSuperadmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.status === 'disabled' || req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden: Requires superadmin role' });
    }
    next();
};

export const requireRoles = (allowedRoles: string[]) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: User not found' });
        }

        if (req.user.status === 'disabled') {
            return res.status(403).json({ error: 'Forbidden: User account is disabled' });
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
