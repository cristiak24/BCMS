import { Redirect } from '@/src/web/expoRouter';

/**
 * The old „Cont nou” page. Email invitations are now one path of „Invită”
 * (components/manage-access/InviteFlow.tsx); old links and bookmarks land on
 * Acces & invitații with the flow open.
 */
export default function CreateAccountScreen() {
    return <Redirect href="/admin/manage-access?invita=1" />;
}
