import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: { globals: globals.node },
    rules: {
      // Variables and functions must be camelCase.
      // UPPER_SNAKE_CASE (e.g. USER_ROLES, HTTP_STATUS) is also allowed for constants.
      camelcase: ['error', { allow: ['^[A-Z][A-Z0-9_]*$'] }],

      // Classes and constructors must be PascalCase (e.g. IncidentService, ValidationError).
      // capIsNew:false allows PascalCase factory functions that are called without `new`.
      'new-cap': ['error', { newIsCap: true, capIsNew: false }],
    },
  },
]);
