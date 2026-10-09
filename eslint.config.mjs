import next from 'eslint-config-next';

const config = [
  ...next,
  { ignores: ['node_modules/**', '.next/**', 'scripts/probe*.mjs', 'playwright-report/**', 'test-results/**'] },
];
export default config;
