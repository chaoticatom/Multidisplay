// Lint for real bugs, not style: undefined names (e.g. a helper moved to a
// shared module without its import), duplicate keys/cases, unreachable
// code, accidental assignment in conditions. Run with `npm run lint`.
'use strict';
const globals = require('globals');

const bugRules = {
  'no-undef': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-const-assign': 'error',
  'no-redeclare': 'error',
  'no-self-assign': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
};

module.exports = [
  { ignores: ['node_modules/**', 'public/three.min.js', 'public/sim-engine.js', 'public/effects.json', 'sim/shims/**'] },
  {
    files: ['src/**/*.js', 'test/**/*.js', 'scripts/**/*.js', 'sim/**/*.js', '*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: bugRules,
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...globals.browser, THREE: 'readonly' } },
    rules: bugRules,
  },
];
