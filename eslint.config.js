import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'dev-dist/**/*', 'node_modules/**/*', 'src/**/*', 'server.ts', 'scripts/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
