import vitest from '@vitest/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import perfectionist from 'eslint-plugin-perfectionist';
import prettier from 'eslint-plugin-prettier';
import promise from 'eslint-plugin-promise';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '*.lock',
      '.husky/**',
      'coverage/**',
      '.nyc_output/**',
      'test-results/**',
      'playwright-report/**',
      '.pi/**',
      'src/types/api.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
  sonarjs.configs.recommended,
  promise.configs['flat/recommended'],
  perfectionist.configs['recommended-natural'],
  unicorn.configs.recommended,
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.tsx', '**/*.spec.tsx'],
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: process.cwd(),
      },
      sourceType: 'module',
    },
    plugins: {
      prettier,
    },
    rules: {
      ...prettier.configs.recommended.rules,
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/different-types-comparison': 'off',
      'sonarjs/function-return-type': 'off',
      'sonarjs/no-duplicated-branches': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-nested-template-literals': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/prefer-regexp-exec': 'off',
      'sonarjs/publicly-writable-directories': 'off',
      'sonarjs/redundant-type-aliases': 'off',
      'sonarjs/slow-regex': 'off',
      // Unicorn: disable the most disruptive rules for this codebase
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/import-style': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-array-sort': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-process-exit': 'off',
      'unicorn/no-useless-spread': 'off',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/prefer-code-point': 'off',
      'unicorn/prefer-number-properties': 'off',
      'unicorn/prefer-response-static-json': 'off',
      'unicorn/prefer-string-raw': 'off',
      'unicorn/prefer-string-replace-all': 'off',
      'unicorn/prefer-string-slice': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/text-encoding-identifier-case': 'off',
    },
  },
  eslintConfigPrettier,
);
