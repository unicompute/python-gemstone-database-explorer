const required = ['GEMSTONE', 'GS_USERNAME', 'GS_PASSWORD'];
const missing = required.filter(key => !process.env[key]);

if (missing.length) {
  console.error(`Missing GemStone env for live UI tests: ${missing.join(', ')}`);
  console.error('Set the normal app connection env, then rerun `npm run test:ui:live`.');
  process.exit(1);
}

console.log('live GemStone env ok');
