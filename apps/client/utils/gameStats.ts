/**
 * Live match statistics: the server's rules, used as they are. There used to
 * be a hand-kept copy here that had to stay in sync with the server (audit
 * WP6B proposal); now the client builds the one file (Vite and tsc follow the
 * import out of apps/client). It must stay free of server-only imports.
 */
export * from '../../server/src/lib/gameStats';
