import { Redirect } from '@/src/web/expoRouter';

export default function UserAccessRedirect() {
  return <Redirect href="/admin/create-club-admin" />;
}
