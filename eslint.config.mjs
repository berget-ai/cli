import vitest from '@vitest/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';
import prettier from 'eslint-plugin-prettier';
import promise from 'eslint-plugin-promise';
import sonarjs from 'eslint-plugin-sonarjs';
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
      sourceType: 'commonjs',
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
    },
  },
);
