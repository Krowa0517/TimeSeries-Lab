import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('starter HTML references the local JavaScript module', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="\.\/js\/main\.js"><\/script>/);
  const main = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.ok(main.length > 0);
});
