import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    // bin/*.ts are Bun-only launcher sources (compiled by build-binary.sh, not
    // type-checked here); fonts.css and dist are generated.
    ignores: ['node_modules/', 'dist/', 'bin/', 'vite.config.ts', 'fonts.css'],
  },
  js.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
]
