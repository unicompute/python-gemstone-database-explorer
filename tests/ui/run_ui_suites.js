const { spawnSync } = require('child_process');

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });
  return typeof result.status === 'number' ? result.status : 1;
}

const mockStatus = run('npx', ['playwright', 'test']);
if (mockStatus !== 0) process.exit(mockStatus);

const required = ['GEMSTONE', 'GS_USERNAME', 'GS_PASSWORD'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.log(`Skipping live GemStone UI suite: missing ${missing.join(', ')}`);
  process.exit(0);
}

const envStatus = run('node', ['tests/ui/check_live_env.js']);
if (envStatus !== 0) process.exit(envStatus);

process.exit(run('npx', ['playwright', 'test', '-c', 'playwright.live.config.js']));
