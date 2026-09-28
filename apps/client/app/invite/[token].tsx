import { Navigate, useParams } from 'react-router-dom';

/**
 * Emailed invitation links land on /invite/<token>. This page used to carry its
 * own registration form, which drifted from the rest of the auth chrome (a
 * full-screen gradient rendered on top of the fields in dark mode). The signup
 * page already validates these tokens, locks the invited email/role/club, and
 * collects the member's real first + last name — so hand the token over to it.
 */
export default function InviteRegistrationScreen() {
  const { token } = useParams<{ token?: string }>();
  const cleanToken = String(token ?? '').trim();

  return (
    <Navigate
      to={cleanToken ? `/signup?inviteToken=${encodeURIComponent(cleanToken)}` : '/signup'}
      replace
    />
  );
}
