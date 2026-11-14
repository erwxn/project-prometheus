const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const previous = process.env.VERCEL;
process.env.VERCEL = '1';
const app = require('./index');
if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous;

test('Vercel rate limiting separates client IPs and accepts platform proxy headers', async () => {
  assert.equal(app.get('trust proxy'), 1);
  const errors = [];
  const originalError = console.error;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const url = `http://127.0.0.1:${server.address().port}/health`;
    const request = ip => fetch(url, { headers: { 'X-Forwarded-For': ip, Forwarded: `for=${ip}` } });
    const a = await request('198.51.100.10'), b = await request('198.51.100.20'), again = await request('198.51.100.10');
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.equal(a.headers.get('ratelimit-remaining'), b.headers.get('ratelimit-remaining'));
    assert.equal(Number(again.headers.get('ratelimit-remaining')), Number(a.headers.get('ratelimit-remaining')) - 1);
    assert.deepEqual(errors, []);
  } finally { console.error = originalError; await new Promise(resolve => server.close(resolve)); }
});

test('direct local server does not trust arbitrary proxy headers', () => {
  const env = { ...process.env }; delete env.VERCEL;
  const result = spawnSync(process.execPath, ['-e', "require('node:assert/strict').equal(require('./server/index').get('trust proxy'), false)"], { cwd: require('node:path').join(__dirname, '..'), env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
