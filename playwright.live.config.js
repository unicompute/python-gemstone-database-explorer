const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/ui',
  testMatch: '**/live.spec.js',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4192',
    headless: true,
  },
  webServer: {
    command: '/Users/tariq/src/python-gemstone-database-explorer/.venv/bin/python -m gemstone_p.cli --host 127.0.0.1 --port 4192',
    url: 'http://127.0.0.1:4192/',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
