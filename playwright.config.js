const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/ui',
  testIgnore: '**/live.spec.js',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: {
    command: '/Users/tariq/src/python-gemstone-database-explorer/.venv/bin/python tests/ui/mock_server.py',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
