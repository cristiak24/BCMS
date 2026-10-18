// Flat config: TypeScript + React 19 hooks. `npm run lint` fails only on
// errors; the warnings below are a backlog to burn down, not a gate.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // `catch {}` around localStorage/sessionStorage is deliberate.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // CSV exports start with a literal BOM inside a template string.
      'no-irregular-whitespace': ['error', { skipTemplates: true }],
    },
  },
  {
    // Node-side config files (Vite, Tailwind, PostCSS, this file).
    files: ['*.{js,cjs}'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Build-time generators (theme palette, codemods).
    files: ['scripts/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-unused-vars': 'warn' },
  },
);
