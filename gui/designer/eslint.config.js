import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import bodgegeneLocal from './eslint-rules/no-cyrillic.js'

// Files that legitimately ship Russian content (i18n, RE descriptions,
// peptide tag dictionary). These are user-facing
// data, not source comments — exempt from the no-cyrillic rule.
const DATA_FILES_WITH_RUSSIAN = [
  'src/i18n.js',
  'src/restriction-db.js',
  'src/tags-db.js',
]

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      'bodgegene-local': bodgegeneLocal,
    },
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Cyrillic ban — biolog asked for English-only source. The rule
      // is at "warn" today (1400+ comments would block CI overnight);
      // bump to "error" once the cleanup pass lands. Data files in
      // DATA_FILES_WITH_RUSSIAN are explicitly excluded below.
      'bodgegene-local/no-cyrillic': 'warn',
    },
  },
  {
    // Disable the rule for files that legitimately ship Russian content.
    files: DATA_FILES_WITH_RUSSIAN,
    rules: {
      'bodgegene-local/no-cyrillic': 'off',
    },
  },
])
