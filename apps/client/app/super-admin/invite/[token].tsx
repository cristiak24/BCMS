import { Redirect, useLocalSearchParams } from '@/src/web/expoRouter';

export default function LegacyInviteRedirect() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = String(params.token ?? '').trim();

  if (!token) {
    return <Redirect href="/super-admin" />;
  }

  return <Redirect href={`/invite/${encodeURIComponent(token)}`} />;
}
