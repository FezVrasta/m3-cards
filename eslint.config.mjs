import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'reference/', 'node_modules/', 'templates/'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      // Bestand hat vereinzelt `any` — beim Anfassen der jeweiligen Card beheben statt pauschal zu blockieren.
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
);
