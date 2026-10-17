// Start de echte server tegen een nagemaakte Supabase en loop de belangrijkste API-routes door.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pinHash } from '../public/kern.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const tabellen = { medewerkers: [], tablets: [], apparaten: [], tickets: [], checklists: [], overuren: [], ruilverzoeken: [] };
const TOKENS = { 'tok-sanne': 'sanne@x.nl', 'tok-lisa': 'lisa@x.nl', 'tok-tablet': 'tablet@x.nl', 'tok-vreemd': 'vreemd@x.nl' };
const aangemaakt = [];
let supa, app, poort;

function mockSupabase() {
  return http.createServer((req, res) => {
    let body = ''; req.on('data', d => { body += d; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const stuur = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (url.pathname === '/auth/v1/user') { const t = String(req.headers.authorization).slice(7); return TOKENS[t] ? stuur(200, { email: TOKENS[t] }) : stuur(401, { msg: 'invalid' }); }
      if (url.pathname === '/auth/v1/admin/users') { aangemaakt.push(JSON.parse(body).email); return stuur(200, {}); }
      const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
      if (!m || req.headers.apikey !== 'service') return stuur(404, {});
      const rijen = tabellen[m[1]];
      const filters = [...url.searchParams].filter(([k]) => k !== 'select').map(([k, v]) => [k, v.replace(/^eq\./, '')]);
      const past = r => filters.every(([k, v]) => String(r[k]) === v);
      if (req.method === 'GET') return stuur(200, rijen.filter(past));
      if (req.method === 'POST') { const r = JSON.parse(body); rijen.push(r); return stuur(201, [r]); }
      if (req.method === 'PATCH') { const v = JSON.parse(body); const uit = rijen.filter(past).map(r => Object.assign(r, v)); return stuur(200, uit); }
      stuur(405, {});
    });
  });
}
async function api(pad, body, token, extra = {}) {
  const r = await fetch(`http://localhost:${poort}/api/${pad}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  tabellen.medewerkers.push(
    { id: 'm1', naam: 'Sanne', email: 'sanne@x.nl', locatie: 'Almere', rol: 'clubmanager', afdeling: 'management', actief: true, pin_hash: null },
    { id: 'm2', naam: 'Lisa', email: 'lisa@x.nl', locatie: 'Almere', rol: 'medewerker', afdeling: 'fitness', actief: true, pin_hash: await pinHash('m2', '4821') });
  tabellen.tablets.push({ id: 't1', naam: 'Balie-tablet', locatie: 'Almere', email: 'tablet@x.nl' });
  tabellen.apparaten.push({ id: 'a1', code: 'ALM-F01', naam: 'Loopband 1', locatie: 'Almere', actief: true });
  supa = mockSupabase(); await new Promise(r => supa.listen(0, r));
  poort = 3900 + Math.floor(Math.random() * 90);
  app = spawn(process.execPath, [path.join(hier, '..', 'server.js')], { env: { ...process.env, PORT: String(poort), SUPABASE_URL: `http://localhost:${supa.address().port}`, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ANTHROPIC_API_KEY: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => app.stdout.once('data', r));
});
after(() => { app.kill(); supa.close(); });

test('config geeft alleen publieke sleutels', async () => {
  const r = await (await fetch(`http://localhost:${poort}/api/config`)).json();
  assert.equal(r.supabaseAnonKey, 'anon'); assert.equal(r.aiUit, true);
  assert.ok(!JSON.stringify(r).includes('service'));
});

test('zonder of met ongeldige token: 401', async () => {
  assert.equal((await api('profiel')).status, 401);
  assert.equal((await api('profiel', {}, 'nep')).status, 401);
});

test('onbekend account is ingelogd zonder medewerker en mag niets', async () => {
  assert.deepEqual((await api('profiel', {}, 'tok-vreemd')).body, { ingelogd: true, medewerker: null, tablet: null });
  assert.equal((await api('actie', { naam: 'lijsten' }, 'tok-vreemd')).status, 401);
});

test('medewerker: profiel, ticket maken, geen tickets bijwerken', async () => {
  const p = (await api('profiel', {}, 'tok-lisa')).body;
  assert.equal(p.medewerker.naam, 'Lisa'); assert.ok(!('pin_hash' in p.medewerker));
  const t = await api('actie', { naam: 'ticketMaken', args: { apparaat_code: 'ALM-F01', omschrijving: 'Rook uit de motor' } }, 'tok-lisa');
  assert.equal(t.status, 200); assert.equal(t.body.prio, 1); assert.equal(t.body.apparaat_naam, 'Loopband 1');
  const b = await api('actie', { naam: 'ticketBijwerken', args: { id: t.body.id, status: 'klaar' } }, 'tok-lisa');
  assert.equal(b.status, 403);
  assert.equal((await api('actie', { naam: 'bestaatNiet' }, 'tok-lisa')).status, 400);
});

test('clubmanager maakt collega aan, server maakt inlogaccount', async () => {
  const r = await api('actie', { naam: 'medewerkerOpslaan', args: { naam: 'Tim', email: 'tim@x.nl', rol: 'medewerker', afdeling: 'fitness' } }, 'tok-sanne');
  assert.equal(r.status, 200); assert.ok(aangemaakt.includes('tim@x.nl'));
});

test('balie-tablet: namen, PIN-login, acties via sessie, uitloggen', async () => {
  const p = (await api('profiel', {}, 'tok-tablet')).body;
  assert.equal(p.tablet.locatie, 'Almere'); assert.equal(p.medewerker, null); assert.ok(!('email' in p.tablet));
  assert.equal((await api('actie', { naam: 'lijsten' }, 'tok-tablet')).status, 401, 'zonder PIN niets');
  const namen = (await api('tablet/namen', {}, 'tok-tablet')).body.medewerkers;
  assert.ok(namen.some(n => n.naam === 'Lisa' && n.heeft_pin));
  assert.equal((await api('tablet/inloggen', { medewerker_id: 'm2', pin: '0000' }, 'tok-tablet')).body.ok, false);
  const ok = (await api('tablet/inloggen', { medewerker_id: 'm2', pin: '4821' }, 'tok-tablet')).body;
  assert.equal(ok.ok, true);
  const h = { 'X-Tablet-Sessie': ok.token };
  const p2 = (await api('profiel', {}, 'tok-tablet', h)).body;
  assert.equal(p2.medewerker.naam, 'Lisa'); assert.equal(p2.medewerker.via_tablet, true);
  assert.equal((await api('actie', { naam: 'lijsten' }, 'tok-tablet', h)).status, 200);
  assert.equal((await api('tablet/inloggen', { medewerker_id: 'm2', pin: '4821' }, 'tok-lisa')).status, 403, 'alleen op de tablet');
  await api('tablet/uitloggen', {}, 'tok-tablet', h);
  assert.equal((await api('profiel', {}, 'tok-tablet', h)).body.medewerker, null);
});

test('AI uit: nette 503', async () => {
  const r = await api('chat', { berichten: [{ role: 'user', content: 'hoi' }] }, 'tok-lisa');
  assert.equal(r.status, 503); assert.match(r.body.fout, /AI/);
});

test('bestanden: NFC-link geeft de app, map-uitbraak niet', async () => {
  const r = await fetch(`http://localhost:${poort}/t/ALM-F01`);
  assert.equal(r.status, 200); assert.match(await r.text(), /<title>Jarvis/);
  assert.ok(r.headers.get('content-security-policy').includes("script-src 'self'"));
  const r2 = await fetch(`http://localhost:${poort}/%2e%2e/server.js`);
  assert.notEqual(r2.status, 200);
});
