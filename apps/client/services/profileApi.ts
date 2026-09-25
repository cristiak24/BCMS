import { getClerk } from '../config/clerk';
import { apiFetch } from './apiClient';
import type { AuthUser, NotificationPreferences } from '../utils/authSession';

export type ProfileRecord = AuthUser & {
  fullName: string;
  clubName: string | null;
  teamName: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
};

export type UpdateProfilePayload = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  preferredLanguage?: string | null;
  notificationPreferences?: NotificationPreferences | null;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type UploadAvatarResponse = {
  success: boolean;
  avatarUrl: string;
};

export const profileApi = {
  getProfile() {
    return apiFetch<ProfileRecord>('/profile/me');
  },

  updateProfile(payload: UpdateProfilePayload) {
    return apiFetch<ProfileRecord>('/profile/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  changePassword(payload: ChangePasswordPayload) {
    return (async () => {
      const clerk = await getClerk();
      if (!clerk.user) {
        throw new Error('No authenticated user found.');
      }

      await clerk.user.updatePassword({
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
      });
      return { success: true, message: 'Password updated successfully' };
    })();
  },

  uploadAvatar(formData: FormData) {
    return apiFetch<UploadAvatarResponse>('/profile/me/avatar', {
      method: 'POST',
      body: formData,
    });
  },
};
