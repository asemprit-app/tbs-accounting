import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const publicHeaders=Object.fromEntries(
  (config.headers||[]).find(r=>r.source==='/(.*)')?.headers.map(h=>[h.key,h.value])||[]
);

test('All application paths have baseline anti-framing and nosniff headers',()=>{
 assert.equal(publicHeaders['X-Frame-Options'],'DENY');
 assert.equal(publicHeaders['X-Content-Type-Options'],'nosniff');
 assert.ok(publicHeaders['Referrer-Policy']);
});

test('Server API responses are marked private and uncacheable',()=>{
 const rule=(config.headers||[]).find(r=>r.source==='/api/(.*)');
 assert.equal(rule?.headers.find(h=>h.key==='Cache-Control')?.value,'private, no-store');
});

test('Preview edge config blocks unauthenticated GET diagnostics for user administration',()=>{
 const route=(config.routes||[]).find(r=>r.src.includes('create-client-user'));
 assert.ok(route,'Admin route exists');
 assert.equal(route.status,405);
 assert.ok(route.methods.includes('GET'));
 assert.ok(route.methods.includes('HEAD'));
 assert.ok(!route.methods.includes('POST'),'Staff-authenticated POST must remain routable');
});
