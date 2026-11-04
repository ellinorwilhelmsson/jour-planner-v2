import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/handler.js';
const fetch = createHandler({ '/': { body: 'private prototype', type: 'text/html' }, '/client.js': { body: 'private code', type: 'text/javascript' } });
const env = { ALLOWED_EMAIL: 'allowed@example.com' };
const context = email => ({ access: { getIdentity: async () => ({ email }) } });
test('all routes deny unauthenticated requests, including spoofed headers', async () => {
  for (const path of ['/', '/client.js', '/planner.js', '/api/me']) {
    const res = await fetch(new Request(`https://app.example${path}`, { headers: { 'Cf-Access-Authenticated-User-Email': env.ALLOWED_EMAIL } }), env, {});
    assert.equal(res.status, 403);
    assert.ok(!(await res.text()).includes('private prototype'));
  }
});
test('another authenticated account and missing allowlist are denied', async () => {
  assert.equal((await fetch(new Request('https://app.example'), env, context('other@example.com'))).status, 403);
  assert.equal((await fetch(new Request('https://app.example'), {}, context(env.ALLOWED_EMAIL))).status, 403);
});
test('only verified allowed identity receives content and no-store headers', async () => {
  const res = await fetch(new Request('https://app.example'), env, context(env.ALLOWED_EMAIL));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'private prototype');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
test('identity lookup failure fails closed', async () => {
  assert.equal((await fetch(new Request('https://app.example'), env, { access: { getIdentity: async () => { throw new Error('Unavailable'); } } })).status, 503);
});
test('no mutation API and unknown routes do not return application content', async () => {
  assert.equal((await fetch(new Request('https://app.example', { method: 'POST' }), env, context(env.ALLOWED_EMAIL))).status, 405);
  assert.equal((await fetch(new Request('https://app.example/unknown'), env, context(env.ALLOWED_EMAIL))).status, 404);
});
