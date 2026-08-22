import js from '@eslint/js';
import globals from 'globals';

/** Quality-400 G1/G11 — scoped; expand via G22 ratchet. */
export default [
  {
    ignores: ['**/node_modules/**', 'vr/data/**', 'vr/catalogue.js', 'site/**', '**/*.min.js'],
  },
  js.configs.recommended,
  {
    files: [
      'scripts/fields-census.mjs',
      'scripts/module-map.mjs',
      'scripts/fields-report.mjs',
      'scripts/typecheck-ratchet.mjs',
      'vr/sim/fields.js',
      'vr/sim/report.js',
      'vr/sim/hashFields.js',
      'vr/sim/testHelpers.js',
      'vr/sim/test-fast.mjs',
      'vr/sim/keymap.js',
      'vr/sim/focusTrap.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-var': 'error',
      'prefer-const': 'warn',
      // G13 — sim ticks mutate W by design; do not enable no-param-reassign on sim/.
    },
  },
];
