export function getClientEnv(name: string) {
  const metaEnv = import.meta.env as Record<string, string | undefined>;
  return metaEnv[name]?.trim() || '';
}
