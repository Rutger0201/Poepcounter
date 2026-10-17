// Jarvis voor DeMIX: live modus. Supabase doet het inloggen, de Jarvis-server doet de rest.
import { ls } from './util.js';

const SESSIE = 'jarvis-sessie-v1', TABLET = 'jarvis-tablet-sessie-v1';
const ACTIES = ['ticketMaken', 'ticketBijwerken', 'checklistInleveren', 'checklistAftekenen', 'overurenAanvragen', 'overurenBeoordelen',
  'ruilAanvragen', 'ruilReageren', 'ruilBeoordelen', 'ruilIntrekken', 'medewerkerOpslaan', 'pinZetten', 'apparaatOpslaan'];

function fout(tekst, status) { const e = new Error(tekst); e.status = status; return e; }
const vertaal = m => {
  const s = String(m || '');
  if (/expired|invalid.*(otp|token)/i.test(s)) return 'Die code klopt niet of is verlopen. Vraag een nieuwe aan.';
  if (/rate limit|security purposes/i.test(s)) return 'Even wachten voordat je een nieuwe code aanvraagt.';
  if (/invalid login credentials/i.test(s)) return 'E-mailadres of wachtwoord klopt niet.';
  if (/signups not allowed|user not found/i.test(s)) return 'Dit e-mailadres is niet bekend. Vraag je clubmanager je toe te voegen.';
  return s || 'Er ging iets mis.';
};

export function maakSupabaseStore(cfg) {
  const base = cfg.supabaseUrl.replace(/\/$/, '');
  async function auth(pad, body) {
    let r;
    try { r = await fetch(base + '/auth/v1/' + pad, { method: 'POST', headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { throw fout('Geen verbinding. Controleer je internet.', 0); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw fout(vertaal(j.msg || j.error_description || j.message || j.error), r.status);
    return j;
  }
  function bewaarSessie(j) {
    if (!j || !j.access_token) throw fout('Inloggen lukte niet.', 401);
    ls.set(SESSIE, { access_token: j.access_token, refresh_token: j.refresh_token, verloopt: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
  }
  let verversen = null;
  async function token() {
    const s = ls.get(SESSIE, null); if (!s) return null;
    if (s.verloopt - Date.now() > 60000) return s.access_token;
    if (!verversen) verversen = auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
      .then(j => { bewaarSessie(j); return j.access_token; })
      .catch(e => { if (e.status && e.status < 500) ls.del(SESSIE); throw e; })
      .finally(() => { verversen = null; });
    return verversen;
  }
  async function api(pad, body) {
    const t = await token();
    if (!t) throw fout('Je bent niet ingelogd.', 401);
    const headers = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' };
    const ts = ls.get(TABLET, null); if (ts) headers['X-Tablet-Sessie'] = ts;
    let r;
    try { r = await fetch('/api/' + pad, { method: 'POST', headers, body: JSON.stringify(body || {}), cache: 'no-store' }); }
    catch (e) { throw fout('Geen verbinding met Jarvis. Controleer je internet.', 0); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw fout(j.fout || 'Er ging iets mis.', r.status);
    return j;
  }

  const store = {
    modus: 'live',
    async profiel() {
      if (!ls.get(SESSIE, null)) return { ingelogd: false, medewerker: null, tablet: null };
      try { return await api('profiel'); }
      catch (e) { if (e.status === 401) { ls.del(SESSIE); ls.del(TABLET); return { ingelogd: false, medewerker: null, tablet: null }; } throw e; }
    },
    async emailCode(email) { await auth('otp', { email, create_user: false }); },
    async codeControleren(email, code) { bewaarSessie(await auth('verify', { type: 'email', email, token: code })); },
    async tabletAccountLogin(email, ww) {
      if (!String(email).trim() || !ww) throw fout('Vul het e-mailadres en wachtwoord van de tablet in.', 400);
      bewaarSessie(await auth('token?grant_type=password', { email: String(email).trim(), password: ww }));
    },
    async uitloggen() {
      const t = ls.get(SESSIE, null);
      if (t) fetch(base + '/auth/v1/logout', { method: 'POST', headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + t.access_token } }).catch(() => {});
      ls.del(SESSIE); ls.del(TABLET);
    },
    async lijsten() { return api('actie', { naam: 'lijsten' }); },
    async tabletNamen() { return (await api('tablet/namen')).medewerkers; },
    async tabletInloggen(medewerker_id, pin) {
      const r = await api('tablet/inloggen', { medewerker_id, pin });
      if (r.ok && r.token) ls.set(TABLET, r.token);
      return r;
    },
    async tabletVerleng() { if (ls.get(TABLET, null)) await api('tablet/verleng'); },
    async tabletUitloggen() { try { if (ls.get(TABLET, null)) await api('tablet/uitloggen'); } finally { ls.del(TABLET); } },
    async tabletOntkoppelen() { await store.uitloggen(); },
    async chat(berichten, overzicht) { return api('chat', { berichten, overzicht }); },
    async ai(soort, invoer) { return api('ai', { soort, invoer }); }
  };
  for (const naam of ACTIES) store[naam] = args => api('actie', { naam, args: args || {} });
  return store;
}
