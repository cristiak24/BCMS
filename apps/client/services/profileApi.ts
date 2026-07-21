import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { firebaseAuth } from '../config/firebase';
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
      const currentUser = firebaseAuth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error('No authenticated user found.');
      }

      const credential = EmailAuthProvider.credential(currentUser.email, payload.currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, payload.newPassword);
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
