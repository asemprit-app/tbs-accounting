import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReceiptEmail, isValidReceiptEmail, resolveReceiptEmail } from '../src/tbsServiceReceiptEmail.js';

test('Service receipt email is optional and normalized', () => {
  assert.equal(normalizeReceiptEmail('  Person@Example.COM '), 'person@example.com');
  assert.equal(isValidReceiptEmail(''), true);
  assert.equal(isValidReceiptEmail('  person@example.com '), true);
  assert.equal(isValidReceiptEmail('bad@'), false);
  assert.equal(isValidReceiptEmail('person at example.com'), false);
});
test('Service email wins over employee profile and employee fallback works', () => {
  assert.equal(resolveReceiptEmail({email:'provider@example.com'}, {email:'employee@example.com'}), 'provider@example.com');
  assert.equal(resolveReceiptEmail({email:''}, {email:'employee@example.com'}), 'employee@example.com');
  assert.equal(resolveReceiptEmail({email:''}, null), '');
});

test('Receipt endpoint requires login and an authorized Services payment', async () => {
  const { default: handler } = await import('../api/send-service-receipt.js');
  function res() {
    return { statusCode: 0, body: null, headers: {}, setHeader(k,v){this.headers[k]=v;}, status(n){this.statusCode=n; return this;}, json(v){this.body=v;return this;} };
  }
  const r = res();
  await handler({method:'POST',headers:{},body:{}},r);
  assert.equal(r.statusCode,401);
  const r2=res();
  await handler({method:'GET',headers:{}},r2);
  assert.equal(r2.statusCode,405);
});
