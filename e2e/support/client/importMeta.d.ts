// Type-checking the app modules the auth mock imports (`npx tsc -p e2e`):
// Vite's own `vite/client` types are not resolvable from the repo root.
interface ImportMeta {
  readonly env: Record<string, string | boolean | undefined>;
}
