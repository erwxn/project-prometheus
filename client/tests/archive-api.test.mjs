import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readArchiveResponse } from '../src/archive-api.ts';

test('stale archive endpoints and SPA fallbacks explain how to restore the backend', async () => {
  for (const status of [404, 200]) {
    await assert.rejects(readArchiveResponse(new Response('<!DOCTYPE html><p>Cannot POST</p>', { status, headers: { 'content-type': 'text/html' } })), /Restart the API/);
  }
});

test('archive responses preserve valid data and actionable server errors', async () => {
  assert.deepEqual(await readArchiveResponse(Response.json({ total: 246 })), { total: 246 });
  await assert.rejects(readArchiveResponse(Response.json({ error: 'Local archive index unavailable.' }, { status: 404 })), /Local archive index unavailable/);
  await assert.rejects(readArchiveResponse(new Response('{', { headers: { 'content-type': 'application/json' } })), /invalid JSON/);
});
