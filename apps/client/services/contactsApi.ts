import { apiClient } from './apiClient';

/** Club contact book — see apps/server/src/routes/contacts.ts. */

export type StaffContact = {
    id: number;
    name: string;
    role: 'admin' | 'coach' | string;
    phone: string | null;
    teams: { id: number; name: string }[];
    /** Member view only: coaches one of the caller's teams. */
    ownTeam?: boolean;
};

export type PlayerContact = {
    id: number;
    firstName: string;
    lastName: string;
    number: number | null;
    teamIds: number[];
    phone: string | null;
    /** The number on the player's own account (Profil), used when `phone` is empty. */
    accountPhone: string | null;
    guardianName: string | null;
    guardianPhone: string | null;
    guardian2Name: string | null;
    guardian2Phone: string | null;
};

export type PlayerContactUpdate = Pick<PlayerContact, 'phone' | 'guardianName' | 'guardianPhone' | 'guardian2Name' | 'guardian2Phone'>;

export type ContactsResponse =
    | { mode: 'staff'; teams: { id: number; name: string }[]; players: PlayerContact[]; staff: StaffContact[] }
    | { mode: 'member'; staff: StaffContact[] };

export const contactsApi = {
    async list() {
        return (await apiClient.get<ContactsResponse>('/contacts')).data;
    },
    async updatePlayer(id: number, update: PlayerContactUpdate) {
        return (await apiClient.put<PlayerContactUpdate & { id: number }>(`/contacts/players/${id}`, update)).data;
    },
};
