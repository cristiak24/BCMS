export type UserRole = 'superadmin' | 'admin' | 'coach' | 'player';
export type UserStatus = 'active' | 'disabled';
export type InviteStatus = 'active' | 'used' | 'expired' | 'revoked';

export type TimestampLike = {
  seconds: number;
  nanoseconds: number;
  toDate: () => Date;
};

export interface UserProfileDoc {
  id: number;
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  clubId?: string;
  teamIds?: string[];
  photoURL?: string;
  status: UserStatus;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface ClubDoc {
  name: string;
  normalizedName: string;
  createdBy: string;
  adminIds: string[];
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface TeamDoc {
  name: string;
  clubId: string;
  createdBy: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export interface InviteDoc {
  email: string;
  role: 'admin';
  clubId: string;
  clubName: string;
  tokenHash: string;
  expiresAt: TimestampLike;
  usedAt?: TimestampLike | null;
  usedBy?: string | null;
  createdBy: string;
  createdAt: TimestampLike;
  status: InviteStatus;
}

export interface InviteValidationResult {
  email: string;
  role: 'admin';
  clubId: string;
  clubName: string;
}

export interface CreateClubAdminInviteInput {
  email: string;
  clubName: string;
}

export interface CreateClubAdminInviteResult {
  inviteId: string;
  email: string;
  role: 'admin';
  clubId: string;
  clubName: string;
  status: InviteStatus;
  expiresAt: string;
  signupUrl: string;
}

export interface CreateInviteInput {
  email: string;
  clubName: string;
}

export type CreateInviteResult = CreateClubAdminInviteResult;

export interface CompleteInviteSignupInput {
  token: string;
  uid: string;
  firstName: string;
  lastName: string;
}

export interface CompletePublicSignupInput {
  firstName: string;
  lastName: string;
  role: Exclude<UserRole, 'superadmin' | 'admin'>;
  clubId?: string;
  teamId?: string;
  photoURL?: string | null;
}

export interface AuthSession {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  clubId?: string;
  teamIds?: string[];
  photoURL?: string | null;
  status: UserStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
  clubName?: string | null;
  teamName?: string | null;
}

export const PRIVILEGED_ROLES: UserRole[] = ['superadmin', 'admin', 'coach', 'player'];

export const INVITE_DEFAULT_TTL_HOURS = 72;
export const PUBLIC_SIGNUP_ROLES: Array<Exclude<UserRole, 'superadmin' | 'admin'>> = ['player', 'coach'];

export function isPrivilegedRole(role: string): role is UserRole {
  return PRIVILEGED_ROLES.includes(role as UserRole);
}
