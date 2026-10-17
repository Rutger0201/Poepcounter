// Jarvis voor DeMIX: server. Serveert de app, controleert wie je bent en voert acties uit in Supabase.
// Zonder SUPABASE_URL draait de app in demomodus (alles in de browser).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maakKern, Fout } from './public/kern.js';
import { isManager } from './public/data.js';
import { maakAi } from './ai.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(hier, 'public');
const PORT = Number(process.env.PORT) || 3000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const LIVE = !!(SUPABASE_URL && ANON && SERVICE);
const handboek = existsSync(path.join(hier, 'handboek.md')) ? readFileSync(path.join(hier, 'handboek.md'), 'utf8') : '';
const ai = process.env.ANTHROPIC_API_KEY ? maakAi({ handboek }) : null;

/* ---------- Supabase-database via PostgREST (service role, alleen op de server) ---------- */
const TABELLEN = new Set(['medewerkers', 'tablets', 'apparaten', 'tickets', 'checklists', 'overuren', 'ruilverzoeken']);
async function rest(methode, pad, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pad}`, {
    method: methode,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) { console.error('Supabase', methode, pad, r.status, await r.text().catch(() => '')); throw new Fout('De database gaf een fout. Probeer het zo opnieuw.', 502); }
  return r.json();
}
const db = {
  async lees(tabel, gelijk = {}) {
    if (!TABELLEN.has(tabel)) throw new Fout('Onbekende tabel.', 500);
    const q = Object.entries(gelijk).map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`);
    return rest('GET', `${tabel}?select=*${q.length ? '&' + q.join('&') : ''}`);
  },
  async voegToe(tabel, rij) { if (!TABELLEN.has(tabel)) throw new Fout('Onbekende tabel.', 500); return (await rest('POST', tabel, rij))[0]; },
  async werkBij(tabel, id, velden) {
    if (!TABELLEN.has(tabel)) throw new Fout('Onbekende tabel.', 500);
    const [r] = await rest('PATCH', `${tabel}?id=eq.${encodeURIComponent(id)}`, velden);
    if (!r) throw new Fout('Niet gevonden.', 404);
    return r;
  }
};
const kern = maakKern(db);

// Zorg dat een nieuwe collega met een inlogcode per mail kan inloggen (Supabase-account zonder wachtwoord)
async function maakLoginAccount(email) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, email_confirm: true })
  });
  // 422: account bestaat al, prima
  if (!r.ok && r.status !== 422) console.error('Supabase account aanmaken', r.status, await r.text().catch(() => ''));
}

/* ---------- Wie ben je? ---------- */
const tokenCache = new Map();
async function emailVanToken(token) {
  const c = tokenCache.get(token);
  if (c && c.tot > Date.now()) return c.email;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Fout('Je bent niet meer ingelogd.', 401);
  const u = await r.json();
  if (tokenCache.size > 2000) tokenCache.clear();
  tokenCache.set(token, { email: u.email, tot: Date.now() + 60000 });
  return u.email;
}
async function wieIsDit(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) throw new Fout('Je bent niet ingelogd.', 401);
  const p = await kern.profielVoorEmail(await emailVanToken(m[1]));
  if (p.tablet) {
    const sessie = String(req.headers['x-tablet-sessie'] || '');
    p.sessie = sessie;
    p.medewerker = sessie ? await kern.medewerkerVoorSessie(p.tablet, sessie) : null;
  }
  return p;
}
function eisMedewerker(p) { if (!p.medewerker) throw new Fout(p.tablet ? 'Log eerst in met je PIN.' : 'Jarvis kent je account nog niet.', 401); return p.medewerker; }
function eisTablet(p) { if (!p.tablet) throw new Fout('Dit kan alleen op de balie-tablet.', 403); return p.tablet; }

/* ---------- Eenvoudige rem op herhaalde verzoeken ---------- */
const emmers = new Map();
function rem(sleutel, max, perMs) {
  const t = Date.now(); const e = emmers.get(sleutel) || { n: 0, sinds: t };
  if (t - e.sinds > perMs) { e.n = 0; e.sinds = t; }
  e.n += 1; emmers.set(sleutel, e);
  if (emmers.size > 10000) emmers.clear();
  if (e.n > max) throw new Fout('Even rustig aan. Probeer het over een minuut opnieuw.', 429);
}

/* ---------- API ---------- */
const ACTIES = new Set(['lijsten', 'ticketMaken', 'ticketBijwerken', 'checklistInleveren', 'checklistAftekenen', 'overurenAanvragen', 'overurenBeoordelen',
  'ruilAanvragen', 'ruilReageren', 'ruilBeoordelen', 'ruilIntrekken', 'medewerkerOpslaan', 'pinZetten', 'apparaatOpslaan']);
const zonderTabletEmail = p => ({ ingelogd: p.ingelogd, medewerker: p.medewerker, tablet: p.tablet ? { id: p.tablet.id, naam: p.tablet.naam, locatie: p.tablet.locatie } : null });

async function api(req, pad, body, ip) {
  if (!LIVE) throw new Fout('Jarvis draait zonder database (demomodus).', 404);
  const p = await wieIsDit(req);
  switch (pad) {
    case 'profiel': return zonderTabletEmail(p);
    case 'actie': {
      const naam = String(body.naam || '');
      if (!ACTIES.has(naam)) throw new Fout('Onbekende actie.', 400);
      const r = await kern.acties[naam](eisMedewerker(p), body.args && typeof body.args === 'object' ? body.args : {});
      if (naam === 'medewerkerOpslaan' && r.email) await maakLoginAccount(r.email);
      return r;
    }
    case 'tablet/namen': return { medewerkers: await kern.tabletNamen(eisTablet(p)) };
    case 'tablet/inloggen': {
      const t = eisTablet(p); rem('pin:' + t.id, 30, 60000);
      return kern.tabletInloggen(t, String(body.medewerker_id || ''), String(body.pin || ''));
    }
    case 'tablet/verleng': eisTablet(p); return kern.tabletVerleng(p.sessie);
    case 'tablet/uitloggen': eisTablet(p); return kern.tabletUitloggen(p.sessie);
    case 'chat': {
      const m = eisMedewerker(p);
      if (!ai) throw new Fout('Het AI-deel van Jarvis staat uit.', 503);
      rem('ai:' + m.id, 20, 60000);
      return ai.chat({ medewerker: m, berichten: body.berichten, overzicht: body.overzicht, ticketMaken: args => kern.acties.ticketMaken(m, { ...args, bron: 'jarvis' }) });
    }
    case 'ai': {
      const m = eisMedewerker(p);
      if (!ai) throw new Fout('Het AI-deel van Jarvis staat uit.', 503);
      rem('ai:' + m.id, 20, 60000);
      if (body.soort === 'schema') return ai.schema(body.invoer || {});
      if (body.soort === 'week') { if (!isManager(m)) throw new Fout('Alleen voor managers.', 403); return ai.week(m, body.invoer || {}); }
      throw new Fout('Onbekende AI-opdracht.', 400);
    }
    default: throw new Fout('Niet gevonden.', 404);
  }
}

/* ---------- Bestanden ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const csp = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", `connect-src 'self'${SUPABASE_URL ? ' ' + SUPABASE_URL : ''}`, "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
function headers(extra) {
  return { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', ...extra };
}
async function bestand(res, pad) {
  let rel = decodeURIComponent(pad);
  if (rel === '/' || /^\/t\/[A-Za-z0-9-]{2,20}\/?$/.test(rel)) rel = '/index.html';
  const vol = path.normalize(path.join(PUBLIC, rel));
  if (!vol.startsWith(PUBLIC + path.sep)) { res.writeHead(403, headers()); res.end(); return; }
  try {
    const inhoud = await readFile(vol);
    const ext = path.extname(vol);
    res.writeHead(200, headers({ 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || rel === '/sw.js' ? 'no-cache' : 'public, max-age=300' }));
    res.end(inhoud);
  } catch (e) { res.writeHead(404, headers({ 'Content-Type': 'text/plain; charset=utf-8' })); res.end('Niet gevonden'); }
}

function leesBody(req) {
  return new Promise((ok, nee) => {
    let n = 0; const delen = [];
    req.on('data', d => { n += d.length; if (n > 256 * 1024) { nee(new Fout('Bericht te groot.', 413)); req.destroy(); } else delen.push(d); });
    req.on('end', () => { try { ok(delen.length ? JSON.parse(Buffer.concat(delen).toString('utf8')) : {}); } catch (e) { nee(new Fout('Ongeldige JSON.', 400)); } });
    req.on('error', nee);
  });
}
function json(res, status, obj) { res.writeHead(status, headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })); res.end(JSON.stringify(obj)); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    if (url.pathname === '/api/config' && req.method === 'GET') return json(res, 200, LIVE ? { supabaseUrl: SUPABASE_URL, supabaseAnonKey: ANON, aiUit: !ai } : {});
    if (url.pathname === '/api/gezond') return json(res, 200, { ok: true, live: LIVE, ai: !!ai });
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'POST') return json(res, 405, { fout: 'Gebruik POST.' });
      rem('ip:' + ip, 600, 60000);
      const body = await leesBody(req);
      return json(res, 200, await api(req, url.pathname.slice(5), body, ip));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, headers()); res.end(); return; }
    return bestand(res, url.pathname);
  } catch (e) {
    const status = e instanceof Fout ? e.status : 500;
    if (!(e instanceof Fout)) console.error(e);
    json(res, status, { fout: e instanceof Fout ? e.message : 'Er ging iets mis op de server.' });
  }
});

server.listen(PORT, () => console.log(`Jarvis draait op http://localhost:${PORT} (${LIVE ? 'live met Supabase' : 'demomodus'}${ai ? ', AI aan' : ', AI uit'})`));
