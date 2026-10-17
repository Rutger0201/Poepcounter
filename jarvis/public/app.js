// Jarvis voor DeMIX: hoofdapp
import { $, $$, h, ls, toast, showErr, md, DAGEN, MAANDEN, MAANDEN_L, pad, iso, parseISO, addDays, cap, fmtDate, nl, tijd, isoWeek, ago } from './util.js';
import { ROLLEN, AFDELINGEN, functieLabel, isManager, isTD, magBeoordelen, ruilCheck, berekenOveruren, TAKEN, triage } from './data.js';

/* ================= Status ================= */
let store = null;
let profiel = { ingelogd: false, medewerker: null, tablet: null };
let data = { medewerkers: [], apparaten: [], tickets: [], checklists: [], overuren: [], ruilverzoeken: [] };
let aiUit = false, appGestart = false, peilT = null, nfcCode = null, tdBron = 'app';
const chat = { turns: [], bezig: false };
const me = () => profiel.medewerker;
const mwVan = id => data.medewerkers.find(m => m.id === id);
const naamVan = id => (mwVan(id) || {}).naam || 'onbekend';
const viaTablet = () => !!(me() && me().via_tablet);

/* ================= Weergave ================= */
function zetThema() {
  const t = ls.get('jarvis-weergave', 'auto');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}
zetThema();

function toonScherm(id) { $$('.screen').forEach(s => { s.hidden = s.id !== 'scr-' + id; }); window.scrollTo(0, 0); }

async function doe(fn, okTekst) {
  try { const r = await fn(); if (okTekst) toast(okTekst); return r; }
  catch (e) {
    toast(e.message || 'Er ging iets mis.');
    if (e.status === 401) await herlaad();
    throw e;
  }
}
// Knop uitzetten tijdens een actie, foutmelding in een veld
async function metKnop(knop, errSel, fn) {
  if (knop) knop.disabled = true; if (errSel) showErr(errSel, '');
  try { return await fn(); }
  catch (e) { if (errSel) showErr(errSel, e.message || 'Er ging iets mis.'); else toast(e.message || 'Er ging iets mis.'); if (e.status === 401) await herlaad(); return undefined; }
  finally { if (knop) knop.disabled = false; }
}

/* ================= Opstarten ================= */
async function start() {
  const m = location.pathname.match(/^\/t\/([A-Za-z0-9-]{2,20})\/?$/);
  nfcCode = m ? m[1].toUpperCase() : (new URLSearchParams(location.search).get('t') || null);
  if (nfcCode) { nfcCode = nfcCode.toUpperCase(); history.replaceState(null, '', '/'); }

  let cfg = null;
  if (!new URLSearchParams(location.search).has('demo')) {
    try {
      const r = await fetch('/api/config', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j && j.supabaseUrl && j.supabaseAnonKey) cfg = j; if (j && j.aiUit) aiUit = true; }
    } catch (e) { /* geen server: demomodus */ }
  }
  if (cfg) store = (await import('./store-supabase.js')).maakSupabaseStore(cfg);
  else store = (await import('./store-demo.js')).maakDemoStore();
  if (store.modus === 'demo') { aiUit = true; }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  bindAlles();
  await herlaad();
}

async function herlaad() {
  try { profiel = await store.profiel(); }
  catch (e) { profiel = { ingelogd: false, medewerker: null, tablet: null }; toast('Geen verbinding met Jarvis. Controleer je internet.'); }
  route();
}

function route() {
  stopPeilen();
  if (!profiel.ingelogd) { if (store.modus === 'demo') toonDemoLogin(); else toonLogin(); return; }
  if (profiel.tablet && !profiel.medewerker) { toonTabletKiezer(); return; }
  if (!profiel.medewerker) { toonScherm('onbekend'); return; }
  toonApp();
}

/* ================= Inloggen (live) ================= */
let loginEmail = '';
function toonLogin() {
  toonScherm('login');
  $('#login-email').hidden = false; $('#login-code').hidden = true; $('#login-tablet').hidden = true; $('#li-tablet').hidden = false;
  showErr('#li-err', ''); showErr('#li-err2', ''); showErr('#lt-err', '');
}
async function stuurCode() {
  const email = $('#li-email').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showErr('#li-err', 'Vul een geldig e-mailadres in.'); return; }
  const b = $('#li-stuur'); b.disabled = true; showErr('#li-err', '');
  try {
    await store.emailCode(email); loginEmail = email;
    $('#li-naar').textContent = email; $('#login-email').hidden = true; $('#login-code').hidden = false; $('#li-tablet').hidden = true;
    $('#li-code').value = ''; $('#li-code').focus();
  } catch (e) { showErr('#li-err', e.message); }
  finally { b.disabled = false; }
}
async function checkCode() {
  const code = $('#li-code').value.replace(/\s/g, '');
  if (!/^\d{4,10}$/.test(code)) { showErr('#li-err2', 'Vul de code uit de mail in.'); return; }
  const b = $('#li-check'); b.disabled = true; showErr('#li-err2', '');
  try { await store.codeControleren(loginEmail, code); await herlaad(); }
  catch (e) { showErr('#li-err2', e.message); }
  finally { b.disabled = false; }
}
async function koppelTablet() {
  const b = $('#lt-go'); b.disabled = true; showErr('#lt-err', '');
  try {
    await store.tabletAccountLogin($('#lt-email').value, $('#lt-ww').value);
    $('#lt-ww').value = '';
    await herlaad();
    if (!profiel.tablet && profiel.medewerker) toast('Dit is een persoonlijk account, geen tablet. Je bent gewoon ingelogd.');
  } catch (e) { showErr('#lt-err', e.message); }
  finally { b.disabled = false; }
}

/* ================= Inloggen (demo) ================= */
function toonDemoLogin() {
  toonScherm('demo');
  const lijst = $('#demo-lijst'); lijst.replaceChildren();
  // Demo kent geen API voor alle medewerkers zonder login: gebruik de vaste demolijst
  import('./data.js').then(({ DEMO_MEDEWERKERS }) => {
    for (const loc of ['Almere', 'Nieuwegein']) {
      lijst.append(h('h3', { class: 'h-m spaced' }, loc));
      lijst.append(h('div', { class: 'namen' }, ...DEMO_MEDEWERKERS.filter(m => m.locatie === loc).map(m =>
        h('button', { class: 'naam-btn', type: 'button', onclick: async () => { await store.demoLogin(m.id); await herlaad(); } },
          h('b', null, m.naam), h('small', null, functieLabel(m))))));
    }
    $('#demo-tablets').replaceChildren(...['Almere', 'Nieuwegein'].map(loc =>
      h('button', { class: 'naam-btn', type: 'button', onclick: async () => { await store.demoTablet(loc); await herlaad(); } },
        h('b', null, 'Balie ' + loc), h('small', null, 'Inloggen met PIN'))));
  });
}

/* ================= Balie-tablet: wie ben jij + PIN ================= */
let pinVoor = null, pinInvoer = '', pinBezig = false;
async function toonTabletKiezer() {
  toonScherm('tablet');
  $('#tab-sub').textContent = `${profiel.tablet.naam}, DeMIX ${profiel.tablet.locatie}`;
  $('#tab-kies').hidden = false; $('#tab-pin').hidden = true; pinVoor = null; pinInvoer = '';
  $('#tab-ontkoppel').hidden = false;
  let actief = [];
  try { actief = await store.tabletNamen(); } catch (e) { if (e.status === 401) { await herlaad(); return; } toast(e.message || 'Namen laden lukte niet.'); }
  $('#tab-namen').replaceChildren(...(actief.length ? actief.map(m =>
    h('button', { class: 'naam-btn', type: 'button', onclick: () => kiesPinPersoon(m) }, h('b', null, m.naam), h('small', null, functieLabel(m))))
    : [h('p', { class: 'empty' }, 'Nog geen collega’s voor deze vestiging. De clubmanager voegt ze toe via Beheer.')]));
}
function kiesPinPersoon(m) {
  pinVoor = m; pinInvoer = '';
  $('#tab-kies').hidden = true; $('#tab-pin').hidden = false;
  $('#tab-pin-titel').textContent = `Hoi ${m.naam}, je PIN`;
  showErr('#tab-err', m.heeft_pin === false ? 'Je hebt nog geen PIN. Stel er een in via je eigen telefoon (profiel) of vraag je clubmanager.' : ''); tekenPin();
}
function tekenPin() {
  $('#tab-dots').replaceChildren(...Array.from({ length: 4 }, (_, i) => h('span', { class: i < pinInvoer.length ? 'vol' : '' })));
}
async function pinToets(k) {
  if (pinBezig) return;
  if (k === 'terug') { pinVoor = null; $('#tab-kies').hidden = false; $('#tab-pin').hidden = true; return; }
  if (k === 'wis') { pinInvoer = pinInvoer.slice(0, -1); tekenPin(); return; }
  if (pinInvoer.length >= 4) return;
  pinInvoer += k; tekenPin(); showErr('#tab-err', '');
  if (pinInvoer.length < 4) return;
  pinBezig = true;
  try {
    const r = await store.tabletInloggen(pinVoor.id, pinInvoer);
    pinInvoer = '';
    if (r && r.ok) { await herlaad(); return; }
    showErr('#tab-err', (r && r.fout) || 'Inloggen lukte niet.'); tekenPin();
  } catch (e) { showErr('#tab-err', e.message || 'Inloggen lukte niet.'); pinInvoer = ''; tekenPin(); }
  finally { pinBezig = false; }
}
function bouwPinpad() {
  const toetsen = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'terug', '0', 'wis'];
  $('#tab-pad').replaceChildren(...toetsen.map(k => h('button', {
    type: 'button', class: (k === 'terug' || k === 'wis') ? 'zacht' : '',
    'aria-label': k === 'wis' ? 'Wis laatste cijfer' : k === 'terug' ? 'Terug naar namen' : k,
    onclick: () => pinToets(k)
  }, k === 'wis' ? '⌫' : k === 'terug' ? 'Terug' : k)));
}

// Automatisch afmelden op de tablet na 3 minuten niets doen
let laatsteActie = Date.now(), laatsteVerleng = 0, idleT = null;
function startTabletBewaking() {
  clearInterval(idleT);
  if (!viaTablet()) return;
  laatsteActie = Date.now();
  idleT = setInterval(async () => {
    if (!viaTablet()) { clearInterval(idleT); return; }
    if (Date.now() - laatsteActie > 180000) { clearInterval(idleT); await meldTabletAf('Na 3 minuten automatisch afgemeld.'); }
  }, 10000);
}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => {
  laatsteActie = Date.now();
  if (viaTablet() && Date.now() - laatsteVerleng > 60000) { laatsteVerleng = Date.now(); store.tabletVerleng().catch(() => {}); }
}, { passive: true }));
async function meldTabletAf(tekst) {
  clearInterval(idleT);
  try { await store.tabletUitloggen(); } catch (e) { /* sessie verloopt vanzelf */ }
  chat.turns = []; $('#thread').replaceChildren(); appGestart = false;
  await herlaad();
  if (tekst) toast(tekst);
}

/* ================= App ================= */
function toonApp() {
  toonScherm('app');
  const m = me();
  $('#demo-strip').hidden = store.modus !== 'demo';
  $('#band-loc').textContent = `DeMIX ${m.locatie}`;
  $('#me-av').textContent = m.naam.trim().charAt(0).toUpperCase();
  $('#me-rol').textContent = viaTablet() ? `Klaar, ${m.naam}` : functieLabel(m);
  $('#me-btn').classList.toggle('klaar', viaTablet());
  $('#me-btn').setAttribute('aria-label', viaTablet() ? 'Klaar: afmelden van de tablet' : 'Profiel en instellingen');
  $('#cl-wie').textContent = `${m.naam}, ${functieLabel(m).toLowerCase()}`;
  $('#dash-ai-card').hidden = !isManager(m);
  if (aiUit) zetAiUit(store.modus === 'demo'
    ? 'In de demo werkt de AI nog niet. Zodra Jarvis online staat beantwoordt hij vragen uit het handboek, maakt hij tickets en schrijft hij schema’s.'
    : 'Het AI-deel van Jarvis is nu niet beschikbaar. Checklist, TD en uren werken gewoon.');
  if (!appGestart) {
    appGestart = true;
    chat.turns = [];
    $('#thread').replaceChildren();
    addBubble('jarvis', `Yo ${m.naam}! Jarvis hier, klaar voor actie. Vraag me alles uit het personeelshandboek, meld een defect of check wat er openstaat. **Add life to years**, en vandaag ook een beetje Jarvis to je dienst.`);
    resetChecklist(); resetFormulieren();
  }
  startTabletBewaking();
  let tab = ls.get('jarvis-tab', 'jarvis');
  if (!['jarvis', 'checklist', 'td', 'uren', 'schema', 'dash'].includes(tab)) tab = 'jarvis';
  if (viaTablet()) tab = 'jarvis';
  if (nfcCode) { tab = 'td'; }
  go(tab);
  if (nfcCode) { $('#td-code').value = nfcCode; tdBron = 'nfc'; nfcCode = null; toonApparaatNaam(); setTimeout(() => $('#td-desc').focus(), 50); }
  renderAlles();
  laadData();
  startPeilen();
}

async function laadData() {
  try { data = await store.lijsten(); renderAlles(); }
  catch (e) { if (e.status === 401) await herlaad(); }
}
function startPeilen() {
  stopPeilen();
  peilT = setInterval(() => { if (document.visibilityState === 'visible') laadData(); }, 20000);
}
function stopPeilen() { clearInterval(peilT); peilT = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && peilT) laadData(); });

function go(tab) {
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== tab; });
  $$('.tab').forEach(t => t.setAttribute('aria-current', t.dataset.tab === tab ? 'page' : 'false'));
  if (tab !== 'beheer') ls.set('jarvis-tab', tab);
  if (tab === 'beheer') renderBeheer();
  window.scrollTo(0, 0);
}
function goSub(sub) { go('uren'); zetSub(sub); }
function zetSub(sub) {
  $$('#uren-seg button').forEach(b => b.setAttribute('aria-selected', b.dataset.sub === sub ? 'true' : 'false'));
  $$('[data-subview]').forEach(v => { v.hidden = v.dataset.subview !== sub; });
}

function renderAlles() {
  if (!me()) return;
  $('#apparaten').replaceChildren(...data.apparaten.filter(a => a.actief).map(a => h('option', { value: a.code, label: a.naam })));
  if ($('#td-code').value) toonApparaatNaam();
  renderGroet(); renderBadges(); renderChecklists(); renderTickets(); renderOveruren(); renderRuilen(); renderDash();
  if (!$('[data-view=beheer]').hidden) renderBeheer();
}

/* ================= Overzicht ================= */
function overzicht() {
  const m = me();
  const tk = data.tickets.filter(t => t.status !== 'klaar');
  const vandaag = iso(new Date());
  return {
    vestiging: m.locatie,
    tickets_open: { prio1: tk.filter(t => t.prio === 1).length, prio2: tk.filter(t => t.prio === 2).length, prio3: tk.filter(t => t.prio === 3).length },
    prio1_details: tk.filter(t => t.prio === 1).slice(0, 5).map(t => `${t.nummer} ${t.apparaat_code || 'vrije plek'}: ${t.omschrijving} (${t.status})`),
    checklists_te_controleren: data.checklists.filter(c => !c.afgetekend_door && magBeoordelen(m, mwVan(c.medewerker_id))).length,
    checklists_vandaag: data.checklists.filter(c => String(c.datum).slice(0, 10) === vandaag).map(c => c.dienst),
    overuren_wachtend: data.overuren.filter(o => o.status === 'wacht' && magBeoordelen(m, mwVan(o.medewerker_id))).length,
    ruilverzoeken_wachtend: data.ruilverzoeken.filter(r => r.status === 'wacht' && magBeoordelen(m, mwVan(r.aanvrager_id))).length,
    ruil_aan_mij: data.ruilverzoeken.filter(r => r.status === 'collega' && r.collega_id === m.id).length
  };
}
function renderGroet() {
  const m = me(); const hr = new Date().getHours();
  const g = hr < 6 ? 'Goedenacht' : hr < 12 ? 'Goedemorgen' : hr < 18 ? 'Goedemiddag' : 'Goedenavond';
  $('#greet-title').textContent = `${g}, ${m.naam}.`;
  const o = overzicht(); const pills = [];
  const p1 = o.tickets_open.prio1, rest = o.tickets_open.prio2 + o.tickets_open.prio3;
  if (p1) pills.push(h('button', { class: 'pill alert', type: 'button', onclick: () => go('td') }, `${p1} prio 1 open`));
  if (rest) pills.push(h('button', { class: 'pill', type: 'button', onclick: () => go('td') }, `${rest} TD-${rest === 1 ? 'ticket' : 'tickets'} open`));
  if (o.checklists_te_controleren) pills.push(h('button', { class: 'pill', type: 'button', onclick: () => go('checklist') }, `${o.checklists_te_controleren} ${o.checklists_te_controleren === 1 ? 'checklist' : 'checklists'} aftekenen`));
  const n = o.overuren_wachtend + o.ruilverzoeken_wachtend;
  if (n) pills.push(h('button', { class: 'pill', type: 'button', onclick: () => goSub(o.overuren_wachtend ? 'overuren' : 'ruilen') }, `${n} ${n === 1 ? 'aanvraag' : 'aanvragen'} goedkeuren`));
  if (o.ruil_aan_mij) pills.push(h('button', { class: 'pill', type: 'button', onclick: () => goSub('ruilen') }, `${o.ruil_aan_mij} ${o.ruil_aan_mij === 1 ? 'collega vraagt' : 'collega’s vragen'} je om te ruilen`));
  if (!pills.length) pills.push(h('span', { class: 'pill quiet' }, 'Alles onder controle. Tijd voor ledencontact.'));
  $('#greet-status').replaceChildren(...pills);
}
function zetBadge(id, n) { const b = $(id); b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n; }
function renderBadges() {
  const o = overzicht();
  zetBadge('#b-td', o.tickets_open.prio1);
  zetBadge('#b-checklist', o.checklists_te_controleren);
  zetBadge('#b-uren', o.overuren_wachtend + o.ruilverzoeken_wachtend + o.ruil_aan_mij);
}

/* ================= Alarm ================= */
function toonAlarm(t) {
  $('#al-what').textContent = `${t.apparaat_code || 'Vrije plek'}${t.apparaat_naam ? ' (' + t.apparaat_naam + ')' : ''}: ${t.omschrijving}`;
  const almere = me().locatie === 'Almere';
  const stappen = [
    'Handel niet te snel: overzie de situatie.',
    'Zorg eerst voor je eigen veiligheid, dan voor die van anderen. Zet de plek af als dat kan.',
    'Roep hulp en meld het bij de receptie: daar vindt de coördinatie plaats.',
    almere ? 'AED en EHBO-koffer liggen bij de receptie.' : 'AED en EHBO-koffer liggen bij de receptie, een tweede AED op de eerste verdieping bij Fitplan.',
    'Bij letsel of brand: bel 112. Brandblusser? Check eerst voor welk materiaal hij geschikt is.',
    almere ? 'Bij evacuatie: verzamelplaats Carel Willinklaan, ter hoogte van BSO Merlijn.' : 'Bij evacuatie: volg het ontruimingsplan van Nieuwegein (op te vragen bij PZ).'
  ];
  $('#al-steps').replaceChildren(...stappen.map(s => h('li', null, h('span', null, s))));
  $('#al-sent').textContent = `Ticket ${t.nummer} staat bovenaan bij de TD. Iedereen die Jarvis open heeft ziet hem binnen een halve minuut. Bel bij twijfel ook direct je manager.`;
  openOverlay('#ov-alarm');
}
let lastFocus = null;
function openOverlay(sel) { lastFocus = document.activeElement; $(sel).hidden = false; const f = $(sel + ' button'); if (f) f.focus(); }
function sluitOverlay(sel) { $(sel).hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }

async function maakTicket({ apparaat_code, omschrijving, prio, bron }) {
  const t = await doe(() => store.ticketMaken({ apparaat_code, omschrijving, prio, bron }));
  if (t && t.prio === 1) toonAlarm(t);
  else if (t) toast(`${t.nummer} staat ${t.prio === 2 ? 'op de dagplanning' : 'klaar voor de weekronde'} van de TD`);
  laadData();
  return t;
}

/* ================= Checklist ================= */
let clLeden = 0, clBevestig = false;
const dienstWaarde = () => { const r = $('input[name=cl-dienst]:checked'); return r ? r.value : 'avond'; };
function sluitNodig() { const d = parseISO($('#cl-datum').value || iso(new Date())); return dienstWaarde() === 'avond' || d.getDay() === 0 || d.getDay() === 6; }
function bouwChecklist() {
  const box = $('#cl-taken'); box.replaceChildren(); let grp = null, card = null;
  for (const t of TAKEN) {
    if (t.groep !== grp) { grp = t.groep; card = h('div', { class: 'card' }, h('h3', { class: 'h-m' }, grp)); box.append(card); }
    card.append(h('label', { class: 'check', id: 'row-' + t.id }, h('input', { type: 'checkbox', id: 'cl-' + t.id }), h('span', null, t.label, t.sub ? h('small', null, t.sub) : null)));
  }
}
function resetWaarschuwing() { clBevestig = false; $('#cl-warn').hidden = true; $('#cl-submit').textContent = 'Checklist inleveren'; $$('#cl-taken .check').forEach(r => r.classList.remove('mist')); }
function updateClMeta() {
  const v = $('#cl-datum').value;
  $('#cl-dag').textContent = v ? cap(DAGEN[parseISO(v).getDay()]) : '';
  $('#row-sluit').hidden = !sluitNodig();
  resetWaarschuwing();
}
function zetLeden(n) {
  clLeden = Math.max(0, Math.min(99, n)); $('#cl-leden').textContent = clLeden;
  $('#cl-leden-txt').textContent = clLeden >= 3 ? 'Doel gehaald. Lekker bezig.' : `Nog ${3 - clLeden} te gaan voor het doel van 3`;
}
function resetChecklist() {
  const now = new Date(); const hr = now.getHours();
  $('#cl-datum').value = iso(now); $('#cl-datum').max = iso(now);
  const d = hr < 12 ? 'ochtend' : hr < 17 ? 'middag' : 'avond';
  $$('input[name=cl-dienst]').forEach(r => { r.checked = r.value === d; });
  $$('#cl-taken input').forEach(i => { i.checked = false; });
  $('#cl-geeninc').checked = true; $('#cl-inc-wrap').hidden = true; $('#cl-inc').value = ''; $('#cl-bijz').value = '';
  $('#cl-defects').replaceChildren(); zetLeden(0); updateClMeta(); showErr('#cl-err', '');
}
function voegDefectToe() {
  const code = h('input', { list: 'apparaten', placeholder: 'Code of plek, bijv. ALM-F01', 'aria-label': 'Apparaat of plek', autocomplete: 'off' });
  const naam = h('div', { class: 'small muted' });
  const desc = h('textarea', { rows: '2', placeholder: 'Wat is er mis?', 'aria-label': 'Omschrijving defect', maxlength: '1000' });
  const sel = h('select', { 'aria-label': 'Prioriteit' },
    h('option', { value: '1' }, 'Prio 1, veiligheid'), h('option', { value: '2', selected: true }, 'Prio 2, storing'), h('option', { value: '3' }, 'Prio 3, klein'));
  let handmatig = false;
  sel.addEventListener('change', () => { handmatig = true; });
  code.addEventListener('input', () => { const a = zoekApparaat(code.value); naam.textContent = a ? a.naam : ''; });
  desc.addEventListener('input', () => { if (!handmatig) sel.value = String(triage(desc.value)); });
  const rij = h('div', { class: 'defect stack' },
    h('button', { class: 'btn small ghost weg', type: 'button', 'aria-label': 'Defect verwijderen', onclick: () => rij.remove() }, '×'),
    code, naam, desc, sel);
  rij._lees = () => ({ apparaat_code: code.value.trim(), omschrijving: desc.value.trim(), prio: Number(sel.value) });
  $('#cl-defects').append(rij); code.focus();
}
const zoekApparaat = v => { const c = String(v || '').trim().toUpperCase(); return c ? data.apparaten.find(a => a.code.toUpperCase() === c) : null; };

async function leverChecklistIn(e) {
  e.preventDefault(); showErr('#cl-err', '');
  const datum = $('#cl-datum').value;
  if (!datum) { showErr('#cl-err', 'Kies een datum.'); return; }
  const taken = {}, mist = [];
  for (const t of TAKEN) {
    if (t.id === 'sluit' && !sluitNodig()) continue;
    taken[t.id] = $('#cl-' + t.id).checked;
    if (!taken[t.id]) mist.push(t);
  }
  const geenInc = $('#cl-geeninc').checked, inc = $('#cl-inc').value.trim();
  if (!geenInc && !inc) { showErr('#cl-err', 'Beschrijf het incident, of vink ‘Geen incidenten’ aan.'); $('#cl-inc').focus(); return; }
  const defecten = $$('#cl-defects .defect').map(r => r._lees()).filter(d => d.omschrijving || d.apparaat_code);
  if (defecten.some(d => !d.omschrijving)) { showErr('#cl-err', 'Schrijf bij elk defect wat er mis is.'); return; }
  if (mist.length && !clBevestig) {
    clBevestig = true;
    mist.forEach(t => $('#row-' + t.id).classList.add('mist'));
    $('#cl-warn').textContent = `${mist.length === 1 ? '1 taak is' : mist.length + ' taken zijn'} nog niet afgevinkt: ${mist.map(t => t.label.toLowerCase()).join(', ')}. Klopt dat? Zet het dan even in de overdracht.`;
    $('#cl-warn').hidden = false; $('#cl-submit').textContent = 'Toch inleveren';
    $('#cl-warn').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const r = await metKnop($('#cl-submit'), '#cl-err', () => store.checklistInleveren({
    datum, dienst: dienstWaarde(), taken, leden_contact: clLeden, incident: geenInc ? '' : inc, bijzonderheden: $('#cl-bijz').value.trim(), defecten
  }));
  if (!r) return;
  const p1 = r.tickets.find(t => t.prio === 1);
  resetChecklist(); window.scrollTo(0, 0);
  toast(`Checklist ingeleverd${r.tickets.length ? `, ${r.tickets.length} ${r.tickets.length === 1 ? 'ticket' : 'tickets'} naar de TD` : ''}. Top gedaan!`);
  if (p1) toonAlarm(p1);
  laadData();
}

function missendeTaken(c) { return TAKEN.filter(t => c.taken && c.taken[t.id] === false).map(t => t.label); }
function checklistItem(c, metAftekenen) {
  const mist = missendeTaken(c);
  return h('div', { class: 'item' },
    h('div', { class: 'item-kop' }, h('b', null, `${naamVan(c.medewerker_id)}, ${c.dienst} ${fmtDate(c.datum)}`),
      c.afgetekend_door ? h('span', { class: 'tag goed' }, 'Afgetekend') : h('span', { class: 'tag wacht' }, 'Open')),
    h('div', { class: 'small muted' }, `${c.leden_contact} ledencontact${c.leden_contact === 1 ? '' : 'en'}${mist.length ? `, niet gedaan: ${mist.join(', ').toLowerCase()}` : ', alle taken gedaan'}`),
    c.incident ? h('div', { class: 'small' }, h('b', null, 'Incident: '), c.incident) : null,
    c.bijzonderheden ? h('div', { class: 'small' }, h('b', null, 'Overdracht: '), c.bijzonderheden) : null,
    c.afgetekend_door ? h('div', { class: 'small muted' }, `Afgetekend door ${naamVan(c.afgetekend_door)}`) : null,
    metAftekenen ? h('div', { class: 'knoppen' }, h('button', { class: 'btn small primary', type: 'button', onclick: ev => metKnop(ev.currentTarget, null, async () => { await store.checklistAftekenen({ id: c.id }); toast('Afgetekend.'); laadData(); }) }, 'Aftekenen')) : null);
}
function renderChecklists() {
  const m = me();
  const teDoen = data.checklists.filter(c => !c.afgetekend_door && magBeoordelen(m, mwVan(c.medewerker_id)));
  $('#cl-review-card').hidden = !teDoen.length;
  $('#cl-review').replaceChildren(...teDoen.map(c => checklistItem(c, true)));
  const mijn = data.checklists.filter(c => c.medewerker_id === m.id).slice(0, 5);
  $('#cl-mijn').replaceChildren(...(mijn.length ? mijn.map(c => checklistItem(c, false)) : [h('p', { class: 'empty' }, 'Nog niets ingeleverd de afgelopen maand.')]));
}

/* ================= TD ================= */
let tdFilter = 'open', tdPrioHandmatig = false;
const PRIO_TEKST = { 1: 'Prio 1, veiligheid: de TD komt direct', 2: 'Prio 2, storing: op de dagplanning', 3: 'Prio 3, klein: mee in de weekronde' };
function toonApparaatNaam() { const a = zoekApparaat($('#td-code').value); $('#td-naam').textContent = a ? a.naam : ($('#td-code').value.trim() ? 'Geen bekend apparaat: wordt gemeld als plek.' : ''); }
function resetTdForm() { $('#td-code').value = ''; $('#td-desc').value = ''; $('#td-prio').value = '2'; $('#td-naam').textContent = ''; $('#td-prio-hint').textContent = ''; tdPrioHandmatig = false; tdBron = 'app'; showErr('#td-err', ''); }
async function meldDefect(e) {
  e.preventDefault();
  const omschrijving = $('#td-desc').value.trim();
  if (omschrijving.length < 3) { showErr('#td-err', 'Beschrijf kort wat er mis is.'); $('#td-desc').focus(); return; }
  const t = await metKnop($('#td-submit'), '#td-err', () => store.ticketMaken({ apparaat_code: $('#td-code').value.trim(), omschrijving, prio: Number($('#td-prio').value), bron: tdBron }));
  if (!t) return;
  resetTdForm();
  if (t.prio === 1) toonAlarm(t); else toast(`${t.nummer} staat ${t.prio === 2 ? 'op de dagplanning' : 'klaar voor de weekronde'} van de TD`);
  laadData();
}
async function ticketStatus(t, status, knop) {
  await metKnop(knop, null, async () => { await store.ticketBijwerken({ id: t.id, status }); toast(status === 'klaar' ? `${t.nummer} afgemeld. Goed werk!` : status === 'bezig' ? `${t.nummer} opgepakt.` : `${t.nummer} staat weer open.`); await laadData(); });
}
function ticketNotitie(t) {
  vraagFormulier(`${t.nummer} bijwerken`, [
    { id: 'prio', label: 'Prioriteit', type: 'select', waarde: String(t.prio), opties: [['1', 'Prio 1, veiligheid'], ['2', 'Prio 2, storing'], ['3', 'Prio 3, klein']] },
    { id: 'notitie', label: 'Notitie voor collega’s', type: 'textarea', waarde: t.notitie || '', max: 1000 }
  ], async v => { await store.ticketBijwerken({ id: t.id, prio: Number(v.prio), notitie: v.notitie }); toast('Opgeslagen.'); laadData(); });
}
function renderTickets() {
  const m = me(); const magBewerken = isTD(m) || isManager(m);
  const lijst = data.tickets.filter(t => t.status === tdFilter);
  $$('#td-filter button').forEach(b => { const n = data.tickets.filter(t => t.status === b.dataset.f).length; b.textContent = `${cap(b.dataset.f)}${b.dataset.f !== 'klaar' && n ? ' (' + n + ')' : ''}`; });
  $('#td-lijst').replaceChildren(...(lijst.length ? lijst.map(t => h('div', { class: 'item' },
    h('div', { class: 'item-kop' }, h('b', null, `${t.nummer} ${t.apparaat_code || 'Vrije plek'}${t.apparaat_naam ? ', ' + t.apparaat_naam : ''}`), h('span', { class: 'tag p' + t.prio }, 'Prio ' + t.prio)),
    h('div', null, t.omschrijving),
    t.notitie ? h('div', { class: 'small' }, h('b', null, 'Notitie: '), t.notitie) : null,
    h('div', { class: 'small muted' }, `Gemeld door ${naamVan(t.gemeld_door)}, ${ago(t.gemeld_op)}${t.bron === 'nfc' ? ' via NFC' : t.bron === 'checklist' ? ' via checklist' : t.bron === 'jarvis' ? ' via Jarvis' : ''}${t.opgepakt_door ? `. Opgepakt door ${naamVan(t.opgepakt_door)}` : ''}${t.klaar_op ? `. Klaar ${ago(t.klaar_op)}` : ''}`),
    magBewerken ? h('div', { class: 'knoppen' },
      t.status === 'open' ? h('button', { class: 'btn small primary', type: 'button', onclick: ev => ticketStatus(t, 'bezig', ev.currentTarget) }, 'Oppakken') : null,
      t.status !== 'klaar' ? h('button', { class: 'btn small', type: 'button', onclick: ev => ticketStatus(t, 'klaar', ev.currentTarget) }, 'Klaar') : h('button', { class: 'btn small', type: 'button', onclick: ev => ticketStatus(t, 'open', ev.currentTarget) }, 'Heropenen'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => ticketNotitie(t) }, 'Bijwerken')) : null))
    : [h('p', { class: 'empty' }, tdFilter === 'open' ? 'Geen open tickets. Alles draait!' : tdFilter === 'bezig' ? 'De TD is nergens mee bezig.' : 'De afgelopen twee weken niets afgemeld.')]));
}

/* ================= Uren: overuren ================= */
const STATUS = { wacht: ['Wacht', 'wacht'], goed: ['Goedgekeurd', 'goed'], afgewezen: ['Afgewezen', 'nee'], collega: ['Wacht op collega', 'wacht'], geweigerd: ['Collega zei nee', 'nee'], ingetrokken: ['Ingetrokken', 'nee'] };
const statusTag = s => { const [t, c] = STATUS[s] || [s, '']; return h('span', { class: 'tag ' + c }, t); };
function updateOuUren() {
  const s = $('#ou-start').value, e = $('#ou-eind').value;
  if (!s || !e) { $('#ou-uren').textContent = ''; return; }
  const r = berekenOveruren(s, e, $('#ou-pauze').value);
  $('#ou-uren').textContent = r.fout || `Samen ${nl(r.uren, 2)} uur.`;
}
function resetOuForm() { $('#ou-datum').value = iso(new Date()); $('#ou-datum').max = iso(new Date()); $('#ou-start').value = ''; $('#ou-eind').value = ''; $('#ou-pauze').value = '0'; $('#ou-reden').value = ''; $('#ou-uren').textContent = ''; showErr('#ou-err', ''); }
async function vraagOverurenAan(e) {
  e.preventDefault();
  const r = berekenOveruren($('#ou-start').value, $('#ou-eind').value, $('#ou-pauze').value);
  if (r.fout) { showErr('#ou-err', r.fout); return; }
  const ok = await metKnop($('#ou-submit'), '#ou-err', () => store.overurenAanvragen({ datum: $('#ou-datum').value, start: $('#ou-start').value, eind: $('#ou-eind').value, pauze: Number($('#ou-pauze').value) || 0, reden: $('#ou-reden').value.trim() }));
  if (!ok) return;
  resetOuForm(); toast(`${nl(ok.uren, 2)} uur aangevraagd. Je leidinggevende krijgt hem te zien.`); laadData();
}
function besluitKnoppen(soort, id) {
  const actie = besluit => ev => metKnop(ev.currentTarget, null, async () => {
    await (soort === 'ou' ? store.overurenBeoordelen({ id, besluit }) : store.ruilBeoordelen({ id, besluit }));
    toast(besluit === 'goed' ? 'Goedgekeurd.' : 'Afgewezen.'); laadData();
  });
  return h('div', { class: 'knoppen' }, h('button', { class: 'btn small primary', type: 'button', onclick: actie('goed') }, 'Goedkeuren'), h('button', { class: 'btn small', type: 'button', onclick: actie('afgewezen') }, 'Afwijzen'));
}
function overurenItem(o, metBesluit) {
  return h('div', { class: 'item' },
    h('div', { class: 'item-kop' }, h('b', null, `${metBesluit ? naamVan(o.medewerker_id) + ', ' : ''}${fmtDate(o.datum)} ${o.start}–${o.eind}`), statusTag(o.status)),
    h('div', { class: 'small' }, `${nl(o.uren, 2)} uur${o.pauze ? ` (${o.pauze} min pauze eraf)` : ''}: ${o.reden}`),
    o.beoordeeld_door ? h('div', { class: 'small muted' }, `${o.status === 'goed' ? 'Goedgekeurd' : 'Beoordeeld'} door ${naamVan(o.beoordeeld_door)}`) : null,
    metBesluit ? besluitKnoppen('ou', o.id) : null);
}
function renderOveruren() {
  const m = me();
  const teDoen = data.overuren.filter(o => o.status === 'wacht' && magBeoordelen(m, mwVan(o.medewerker_id)));
  $('#ou-beoordelen-card').hidden = !teDoen.length;
  $('#ou-beoordelen').replaceChildren(...teDoen.map(o => overurenItem(o, true)));
  const mijn = data.overuren.filter(o => o.medewerker_id === m.id);
  const maand = iso(new Date()).slice(0, 7);
  const totaal = mijn.filter(o => o.status === 'goed' && String(o.datum).startsWith(maand)).reduce((s, o) => s + Number(o.uren), 0);
  $('#ou-totaal').textContent = `Goedgekeurd in ${MAANDEN_L[new Date().getMonth()]}: ${nl(totaal, 2)} uur.`;
  $('#ou-mijn').replaceChildren(...(mijn.length ? mijn.map(o => overurenItem(o, false)) : [h('p', { class: 'empty' }, 'Geen overuren de afgelopen drie maanden.')]));
}

/* ================= Uren: ruilen ================= */
function resetRvForm() { $('#rv-datum').value = iso(addDays(new Date(), 1)); $('#rv-datum').min = iso(new Date()); $('#rv-reden').value = ''; showErr('#rv-err', ''); }
async function vraagRuilAan(e) {
  e.preventDefault();
  const col = mwVan($('#rv-collega').value);
  const fout = ruilCheck(me(), col, $('#rv-datum').value);
  if (fout) { showErr('#rv-err', fout); return; }
  const ok = await metKnop($('#rv-submit'), '#rv-err', () => store.ruilAanvragen({ collega_id: col.id, datum: $('#rv-datum').value, dienst: $('#rv-dienst').value, reden: $('#rv-reden').value.trim() }));
  if (!ok) return;
  resetRvForm(); toast(`Verzoek gestuurd naar ${col.naam}.`); laadData();
}
function ruilItem(r, modus) {
  const tekst = modus === 'mijn' ? `Met ${naamVan(r.collega_id)}` : modus === 'aan-mij' ? `${naamVan(r.aanvrager_id)} vraagt je` : `${naamVan(r.aanvrager_id)} ↔ ${naamVan(r.collega_id)}`;
  let knoppen = null;
  if (modus === 'aan-mij') {
    const reageer = akkoord => ev => metKnop(ev.currentTarget, null, async () => { await store.ruilReageren({ id: r.id, akkoord }); toast(akkoord ? 'Top! Nu nog de goedkeuring van de leidinggevende.' : 'Doorgegeven.'); laadData(); });
    knoppen = h('div', { class: 'knoppen' }, h('button', { class: 'btn small primary', type: 'button', onclick: reageer(true) }, 'Ja, ik neem hem'), h('button', { class: 'btn small', type: 'button', onclick: reageer(false) }, 'Nee, sorry'));
  } else if (modus === 'beoordelen') knoppen = besluitKnoppen('rv', r.id);
  else if (['collega', 'wacht'].includes(r.status)) knoppen = h('div', { class: 'knoppen' }, h('button', { class: 'btn small ghost', type: 'button', onclick: ev => metKnop(ev.currentTarget, null, async () => { await store.ruilIntrekken({ id: r.id }); toast('Ingetrokken.'); laadData(); }) }, 'Intrekken'));
  return h('div', { class: 'item' },
    h('div', { class: 'item-kop' }, h('b', null, `${tekst}: ${r.dienst} ${fmtDate(r.datum)}`), statusTag(r.status)),
    r.reden ? h('div', { class: 'small' }, r.reden) : null,
    r.beoordeeld_door ? h('div', { class: 'small muted' }, `Beoordeeld door ${naamVan(r.beoordeeld_door)}`) : null,
    knoppen);
}
function renderRuilen() {
  const m = me();
  const sel = $('#rv-collega'), oud = sel.value;
  const collegas = data.medewerkers.filter(x => x.actief && x.id !== m.id && x.afdeling === m.afdeling);
  sel.replaceChildren(...(collegas.length ? collegas.map(c => h('option', { value: c.id }, c.naam)) : [h('option', { value: '' }, 'Geen collega’s op je afdeling')]));
  if (collegas.some(c => c.id === oud)) sel.value = oud;
  const aanMij = data.ruilverzoeken.filter(r => r.status === 'collega' && r.collega_id === m.id);
  $('#rv-aan-mij-card').hidden = !aanMij.length; $('#rv-aan-mij').replaceChildren(...aanMij.map(r => ruilItem(r, 'aan-mij')));
  const beo = data.ruilverzoeken.filter(r => r.status === 'wacht' && magBeoordelen(m, mwVan(r.aanvrager_id)));
  $('#rv-beoordelen-card').hidden = !beo.length; $('#rv-beoordelen').replaceChildren(...beo.map(r => ruilItem(r, 'beoordelen')));
  const mijn = data.ruilverzoeken.filter(r => r.aanvrager_id === m.id);
  $('#rv-mijn').replaceChildren(...(mijn.length ? mijn.map(r => ruilItem(r, 'mijn')) : [h('p', { class: 'empty' }, 'Geen ruilverzoeken.')]));
}

/* ================= Trainingsschema ================= */
const OEF = {
  warm: ['5 min fietsen of crosstrainer, rustig tempo', '5 min roeien, rustig opbouwen'],
  benen: [['Leg press', 'Squat aan de Smith machine', 'Goblet squat'], ['Lunges', 'Bulgarian split squat', 'Step-ups op een bankje'], ['Leg curl', 'Romanian deadlift met dumbbells', 'Hip thrust']],
  duw: [['Chest press', 'Bankdrukken met dumbbells', 'Bankdrukken met halter'], ['Shoulder press machine', 'Dumbbell shoulder press', 'Push press']],
  trek: [['Lat pulldown', 'Lat pulldown', 'Pull-ups (eventueel met band)'], ['Seated row', 'Kabelroeien', 'Bent-over row met halter']],
  romp: ['Plank', 'Dead bug', 'Pallof press aan de kabel', 'Side plank'],
  cardio: { start: '15 min fietsen of crosstrainer in rustig tempo, je kunt nog praten', midden: '20 min intervallen op de loopband: 1 min stevig, 2 min rustig', hoog: '25 min intervallen op de roeimachine: 30 sec hard, 60 sec rustig' }
};
function lokaalSchema({ naam, doel, niveau, dagen, duur, beperk }) {
  const n = { start: 0, midden: 1, hoog: 2 }[niveau] || 0;
  const sets = doel === 'kracht' ? ['3 x 10', '4 x 8', '5 x 5'][n] : doel === 'afvallen' || doel === 'conditie' ? ['2 x 15', '3 x 12', '3 x 15'][n] : ['2 x 12', '3 x 10', '3 x 10'][n];
  const rust = doel === 'kracht' ? '90 sec' : '60 sec';
  const doelTekst = { fit: 'fitter en energieker worden', kracht: 'sterker worden', afvallen: 'afvallen', conditie: 'een betere conditie', vitaal: 'vitaal ouder worden' }[doel];
  const regels = [`**Trainingsschema${naam ? ' voor ' + naam : ''}**`, `Doel: ${doelTekst}. ${dagen}x per week, ongeveer ${duur} minuten.`];
  for (let d = 0; d < Number(dagen); d++) {
    const A = d % 2 === 0;
    const oef = A
      ? [OEF.benen[0][n], OEF.duw[0][n], OEF.trek[0][n], OEF.romp[d % OEF.romp.length]]
      : [OEF.benen[d % 3 === 1 ? 2 : 1][n], OEF.duw[1][n], OEF.trek[1][n], OEF.romp[(d + 1) % OEF.romp.length]];
    if (Number(duur) >= 60) oef.splice(3, 0, A ? OEF.benen[2][n] : OEF.benen[0][n]);
    regels.push('', `### Training ${String.fromCharCode(65 + d)}`, `- Warming-up: ${OEF.warm[d % 2]}`);
    oef.forEach((o, i) => regels.push(`- ${o}: ${/plank/i.test(o) ? ['2 x 20 sec', '3 x 30 sec', '3 x 45 sec'][n] : sets}${i < oef.length - 1 ? `, ${rust} rust` : ''}`));
    if (doel !== 'kracht' || Number(duur) >= 60) regels.push(`- Cardio: ${OEF.cardio[niveau] || OEF.cardio.start}`);
    regels.push('- Cooling-down: 5 min rustig fietsen en rekken');
  }
  regels.push('', '**Tips**', `- Kies een gewicht waarbij de laatste 2 herhalingen zwaar voelen maar nog netjes gaan.`, `- Gaat het makkelijk? Verhoog na 2 weken het gewicht met een klein stapje.`, `- Plan na ${n ? 6 : 4} weken een evaluatie met je trainer.`);
  if (beperk) regels.push('', `**Let op:** ${beperk}. Pas oefeningen die pijn doen aan of laat ze weg, en overleg bij twijfel met een fysiotherapeut of huisarts.`);
  return regels.join('\n');
}
async function maakSchema(e) {
  e.preventDefault();
  const invoer = { naam: $('#sc-naam').value.trim(), doel: $('#sc-doel').value, niveau: $('#sc-niveau').value, dagen: $('#sc-dagen').value, duur: $('#sc-duur').value, beperk: $('#sc-beperk').value.trim() };
  let tekst = null;
  if (!aiUit) tekst = await metKnop($('#sc-go'), '#sc-err', async () => (await store.ai('schema', invoer)).tekst);
  if (!tekst) tekst = lokaalSchema(invoer);
  $('#sc-uit').innerHTML = md(tekst); $('#sc-uit').dataset.tekst = tekst;
  $('#sc-uit-card').hidden = false; $('#sc-uit-card').scrollIntoView({ behavior: 'smooth' });
}

/* ================= Dashboard ================= */
function renderDash() {
  const m = me(); const o = overzicht();
  const week = iso(addDays(new Date(), -6));
  const cl = data.checklists.filter(c => c.datum >= week);
  const gem = cl.length ? cl.reduce((s, c) => s + Number(c.leden_contact || 0), 0) / cl.length : 0;
  const klaar = data.tickets.filter(t => t.status === 'klaar' && t.klaar_op && t.klaar_op.slice(0, 10) >= week).length;
  const stat = (n, label, alert) => h('div', { class: 'stat' + (alert && n ? ' alert' : '') }, h('b', null, n), h('span', null, label));
  $('#dash-stats').replaceChildren(
    stat(o.tickets_open.prio1, 'prio 1 open', true),
    stat(o.tickets_open.prio2 + o.tickets_open.prio3, 'overige tickets open'),
    stat(klaar, 'tickets klaar deze week'),
    stat(cl.length, isManager(m) ? 'checklists deze week' : 'mijn checklists deze week'),
    stat(nl(gem, 1), 'gem. ledencontact per dienst'),
    stat(o.overuren_wachtend + o.ruilverzoeken_wachtend, 'aanvragen wachten'));
  const dagen = Array.from({ length: 7 }, (_, i) => iso(addDays(new Date(), i - 6)));
  const perDag = dagen.map(d => data.checklists.filter(c => c.datum === d).reduce((s, c) => s + Number(c.leden_contact || 0), 0));
  const max = Math.max(3, ...perDag);
  $('#dash-leden').replaceChildren(...dagen.map((d, i) => h('div', { class: 'bar', title: `${fmtDate(d)}: ${perDag[i]}` }, h('em', null, perDag[i] || ''), h('i', { style: `height:${Math.round(perDag[i] / max * 100)}%` }), DAGEN[parseISO(d).getDay()].slice(0, 2))));
  const over = data.checklists.filter(c => c.bijzonderheden || c.incident).slice(0, 4);
  $('#dash-overdracht').replaceChildren(...(over.length ? over.map(c => checklistItem(c, false)) : [h('p', { class: 'empty' }, 'Geen overdrachten.')]));
}
async function weekAnalyse() {
  const week = iso(addDays(new Date(), -6));
  const invoer = {
    overzicht: overzicht(),
    tickets: data.tickets.filter(t => t.gemeld_op.slice(0, 10) >= week || t.status !== 'klaar').map(t => ({ nummer: t.nummer, apparaat: t.apparaat_code, omschrijving: t.omschrijving, prio: t.prio, status: t.status, gemeld: t.gemeld_op.slice(0, 10) })),
    checklists: data.checklists.filter(c => c.datum >= week).map(c => ({ datum: c.datum, dienst: c.dienst, wie: naamVan(c.medewerker_id), leden_contact: c.leden_contact, niet_gedaan: missendeTaken(c), incident: c.incident, overdracht: c.bijzonderheden })),
    overuren: data.overuren.filter(o => o.datum >= week).map(o => ({ wie: naamVan(o.medewerker_id), uren: o.uren, reden: o.reden, status: o.status }))
  };
  const r = await metKnop($('#dash-ai-go'), null, () => store.ai('week', invoer));
  if (r) $('#dash-ai-uit').innerHTML = md(r.tekst);
}

/* ================= Jarvis-chat ================= */
function zetAiUit(tekst) { $('#ai-uit').textContent = tekst; $('#ai-uit').hidden = !tekst; }
function addBubble(wie, tekst, extra) {
  const b = h('div', { class: 'bubble ' + wie });
  if (wie === 'ik') b.textContent = tekst; else b.innerHTML = md(tekst);
  if (extra) b.append(extra);
  $('#thread').append(b);
  b.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return b;
}
const SUGGESTIES = ['Wat staat er open?', 'Hoe meld ik me ziek?', 'Wat doe ik bij een ongeval?', 'Loopband 2 maakt een raar geluid'];
function bouwSuggesties() {
  $('#chat-sugg').replaceChildren(...SUGGESTIES.map(s => h('button', { class: 'pill', type: 'button', onclick: () => { $('#chat-in').value = s; verstuurChat(); } }, s)));
}
function zoekApparaatInTekst(t) {
  const up = t.toUpperCase();
  return data.apparaten.find(a => up.includes(a.code.toUpperCase())) || data.apparaten.find(a => new RegExp(`\\b${a.naam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) || null;
}
// Antwoorden die Jarvis ook zonder AI kan geven
function lokaalAntwoord(vraag) {
  const o = overzicht();
  if (/(open|status|overzicht|wat (moet|staat)|te doen)/i.test(vraag) && !/kapot|stuk|defect/i.test(vraag)) {
    const regels = [`Dit staat er open in ${o.vestiging}:`, `- TD: ${o.tickets_open.prio1} prio 1, ${o.tickets_open.prio2} prio 2, ${o.tickets_open.prio3} prio 3`];
    o.prio1_details.forEach(d => regels.push(`- **${d}**`));
    if (o.checklists_te_controleren) regels.push(`- ${o.checklists_te_controleren} checklist(s) om af te tekenen`);
    if (o.overuren_wachtend + o.ruilverzoeken_wachtend) regels.push(`- ${o.overuren_wachtend + o.ruilverzoeken_wachtend} aanvraag/aanvragen om goed te keuren`);
    if (o.ruil_aan_mij) regels.push(`- ${o.ruil_aan_mij} collega('s) vragen of je wilt ruilen`);
    regels.push(`- Checklists vandaag: ${o.checklists_vandaag.length ? o.checklists_vandaag.join(', ') : 'nog geen'}`);
    return { tekst: regels.join('\n') };
  }
  if (/(kapot|stuk|defect|werkt niet|doet het niet|lekt|piept|kraakt|los|raar geluid|storing|gebroken|rafel)/i.test(vraag)) {
    const a = zoekApparaatInTekst(vraag); const prio = triage(vraag);
    const knop = h('div', { class: 'acties' },
      h('button', { class: 'btn small primary', type: 'button', onclick: async ev => { ev.currentTarget.disabled = true; try { const t = await maakTicket({ apparaat_code: a ? a.code : '', omschrijving: vraag, prio, bron: 'jarvis' }); if (t) addBubble('jarvis', `Gedaan: **${t.nummer}** staat bij de TD.`); } catch (e) { ev.currentTarget.disabled = false; } } }, `Meld bij TD (prio ${prio})`),
      h('button', { class: 'btn small', type: 'button', onclick: () => { go('td'); if (a) $('#td-code').value = a.code; $('#td-desc').value = vraag; toonApparaatNaam(); $('#td-prio').value = String(prio); } }, 'Zelf invullen'));
    return { tekst: `Dat klinkt als een melding voor de TD${a ? ` over **${a.code}** (${a.naam})` : ''}. Ik schat het in als **prio ${prio}**: ${PRIO_TEKST[prio].split(': ')[1]}.${prio === 1 ? ' Zet de plek eerst af en waarschuw de receptie.' : ''}`, extra: knop };
  }
  return null;
}
async function verstuurChat(e) {
  if (e) e.preventDefault();
  const inp = $('#chat-in'); const vraag = inp.value.trim();
  if (!vraag || chat.bezig) return;
  inp.value = ''; inp.style.height = '';
  addBubble('ik', vraag);
  $('#chat-sugg').hidden = true;
  if (aiUit) {
    const l = lokaalAntwoord(vraag);
    addBubble('jarvis', l ? l.tekst : 'Die vraag kan ik pas beantwoorden als het AI-deel aan staat. Ik kan wel laten zien **wat er openstaat** of een **defect melden** bij de TD.', l && l.extra);
    return;
  }
  chat.turns.push({ role: 'user', content: vraag });
  chat.bezig = true; $('#chat-send').disabled = true;
  const denkt = addBubble('jarvis denkt', 'Jarvis denkt na…');
  try {
    const r = await store.chat(chat.turns.slice(-20), overzicht());
    denkt.remove();
    chat.turns.push({ role: 'assistant', content: r.antwoord });
    addBubble('jarvis', r.antwoord);
    const tk = r.tickets || [];
    if (tk.length) { laadData(); const p1 = tk.find(t => t.prio === 1); if (p1) toonAlarm(p1); }
  } catch (err) {
    denkt.remove(); chat.turns.pop();
    if (err.status === 401) { await herlaad(); return; }
    const l = lokaalAntwoord(vraag);
    addBubble('jarvis', l ? l.tekst : (err.message || 'Dat lukte even niet. Probeer het zo nog eens.'), l && l.extra);
  } finally { chat.bezig = false; $('#chat-send').disabled = false; }
}

/* ================= Formulier-dialoog ================= */
let ofOpslaan = null;
function vraagFormulier(titel, velden, opslaan) {
  $('#of-titel').textContent = titel; showErr('#of-err', '');
  $('#of-body').replaceChildren(...velden.map(v => {
    let el;
    if (v.type === 'select') { el = h('select', { id: 'of-' + v.id }, ...v.opties.map(([w, t]) => h('option', { value: w }, t))); el.value = v.waarde ?? v.opties[0][0]; }
    else if (v.type === 'textarea') { el = h('textarea', { id: 'of-' + v.id, rows: '3', maxlength: String(v.max || 1000) }); el.value = v.waarde || ''; }
    else if (v.type === 'checkbox') return h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'of-' + v.id, checked: !!v.waarde }), h('span', null, v.label));
    else { el = h('input', { id: 'of-' + v.id, type: v.type || 'text', maxlength: String(v.max || 120), autocomplete: 'off', inputmode: v.inputmode || null, placeholder: v.placeholder || null }); el.value = v.waarde || ''; }
    return h('label', { class: 'fld' }, h('span', null, v.label), el);
  }));
  ofOpslaan = async () => {
    const w = {};
    for (const v of velden) { const el = $('#of-' + v.id); w[v.id] = v.type === 'checkbox' ? el.checked : el.value.trim(); }
    await opslaan(w);
  };
  openOverlay('#ov-form');
  const eerste = $('#of-body input, #of-body select, #of-body textarea'); if (eerste) eerste.focus();
}

/* ================= Beheer ================= */
function bewerkMedewerker(m) {
  const nieuw = !m;
  vraagFormulier(nieuw ? 'Nieuwe medewerker' : `${m.naam} bewerken`, [
    { id: 'naam', label: 'Voornaam', waarde: m && m.naam, max: 60 },
    { id: 'email', label: 'E-mailadres (om in te loggen op de telefoon)', type: 'email', waarde: m && m.email },
    { id: 'rol', label: 'Rol', type: 'select', waarde: m ? m.rol : 'medewerker', opties: Object.entries(ROLLEN) },
    { id: 'afdeling', label: 'Afdeling', type: 'select', waarde: m ? m.afdeling : 'fitness', opties: Object.entries(AFDELINGEN) },
    { id: 'pin', label: m && m.heeft_pin ? 'Nieuwe PIN voor de tablet (leeg laten = niet wijzigen)' : 'PIN voor de tablet (4 cijfers, optioneel)', type: 'password', inputmode: 'numeric', max: 4 },
    ...(nieuw ? [] : [{ id: 'actief', label: 'Actief (uitvinken als iemand uit dienst is)', type: 'checkbox', waarde: m.actief }])
  ], async v => {
    const r = await store.medewerkerOpslaan({ id: m && m.id, naam: v.naam, email: v.email, rol: v.rol, afdeling: v.afdeling, actief: nieuw ? true : v.actief });
    if (v.pin) await store.pinZetten({ medewerker_id: r.id, pin: v.pin });
    toast('Opgeslagen.'); await laadData(); renderBeheer();
  });
}
function bewerkApparaat(a) {
  vraagFormulier(a ? `${a.code} bewerken` : 'Nieuw apparaat of plek', [
    { id: 'code', label: 'Code (staat op de sticker)', waarde: a ? a.code : (me().locatie === 'Almere' ? 'ALM-' : 'NWG-'), max: 20 },
    { id: 'naam', label: 'Naam', waarde: a && a.naam, max: 60 },
    ...(a ? [{ id: 'actief', label: 'Actief', type: 'checkbox', waarde: a.actief }] : [])
  ], async v => { await store.apparaatOpslaan({ id: a && a.id, code: v.code, naam: v.naam, actief: a ? v.actief : true }); toast('Opgeslagen.'); await laadData(); renderBeheer(); });
}
function renderBeheer() {
  const m = me(); if (!m) return;
  const cm = m.rol === 'clubmanager';
  $('#bh-mw-nieuw').hidden = !cm;
  $('#bh-mw').replaceChildren(...data.medewerkers.map(x => h('div', { class: 'item' },
    h('div', { class: 'item-kop' }, h('b', null, x.naam), x.actief ? (x.heeft_pin ? h('span', { class: 'tag goed' }, 'PIN') : h('span', { class: 'tag wacht' }, 'Geen PIN')) : h('span', { class: 'tag nee' }, 'Inactief')),
    h('div', { class: 'small muted' }, `${functieLabel(x)}${x.email ? ', ' + x.email : ''}`),
    cm ? h('div', { class: 'knoppen' }, h('button', { class: 'btn small', type: 'button', onclick: () => bewerkMedewerker(x) }, 'Bewerken')) : null)));
  $('#bh-app-nieuw').hidden = !(cm || isTD(m));
  $('#bh-nfc-voorbeeld').textContent = `${location.origin}/t/${(data.apparaten[0] || { code: 'ALM-F01' }).code}`;
  $('#bh-app').replaceChildren(...(data.apparaten.length ? data.apparaten.map(a => h('div', { class: 'item' },
    h('div', { class: 'item-kop' }, h('b', null, `${a.code} ${a.naam}`), a.actief ? null : h('span', { class: 'tag nee' }, 'Inactief')),
    (cm || isTD(m)) ? h('div', { class: 'knoppen' }, h('button', { class: 'btn small', type: 'button', onclick: () => bewerkApparaat(a) }, 'Bewerken')) : null))
    : [h('p', { class: 'empty' }, 'Nog geen apparaten.')]));
}

/* ================= Profiel ================= */
function openProfiel() {
  const m = me();
  $('#me-titel').textContent = m.naam;
  $('#me-sub').textContent = `${functieLabel(m)}, DeMIX ${m.locatie}${m.email ? ' (' + m.email + ')' : ''}`;
  const w = ls.get('jarvis-weergave', 'auto');
  $$('input[name=weergave]').forEach(r => { r.checked = r.value === w; });
  $('#me-pin').value = ''; showErr('#me-pin-err', '');
  $('#me-pin-status').textContent = m.heeft_pin ? '(ingesteld)' : '(nog niet ingesteld)';
  $('#me-beheer').hidden = !(isManager(m) || isTD(m));
  openOverlay('#ov-me');
}
async function uitloggen() {
  sluitOverlay('#ov-me'); stopPeilen();
  try { await store.uitloggen(); } catch (e) { /* lokaal uitloggen lukt altijd */ }
  appGestart = false; chat.turns = []; data = { medewerkers: [], apparaten: [], tickets: [], checklists: [], overuren: [], ruilverzoeken: [] };
  await herlaad();
}

/* ================= Koppelingen ================= */
function resetFormulieren() { zetSub('overuren'); resetTdForm(); resetOuForm(); resetRvForm(); $('#sc-form').reset(); $('#sc-uit-card').hidden = true; $('#dash-ai-uit').replaceChildren(); $('#chat-sugg').hidden = false; }
function bindAlles() {
  bouwPinpad(); bouwChecklist(); bouwSuggesties();
  // Inloggen
  $('#login-email').addEventListener('submit', e => { e.preventDefault(); stuurCode(); });
  $('#login-code').addEventListener('submit', e => { e.preventDefault(); checkCode(); });
  $('#login-tablet').addEventListener('submit', e => { e.preventDefault(); koppelTablet(); });
  $('#li-opnieuw').addEventListener('click', toonLogin);
  $('#li-tablet').addEventListener('click', () => { $('#login-email').hidden = true; $('#login-code').hidden = true; $('#login-tablet').hidden = false; $('#li-tablet').hidden = true; $('#lt-email').focus(); });
  $('#lt-terug').addEventListener('click', toonLogin);
  $('#onb-uit').addEventListener('click', uitloggen);
  $('#demo-reset').addEventListener('click', async () => { if (confirm('Alle demogegevens wissen en opnieuw beginnen?')) { await store.demoReset(); location.reload(); } });
  $('#demo-wissel').addEventListener('click', uitloggen);
  $('#tab-ontkoppel').addEventListener('click', async () => { if (confirm('Deze tablet ontkoppelen? Daarna moet de clubmanager opnieuw inloggen met het tablet-account.')) { await store.tabletOntkoppelen(); await herlaad(); } });
  // Navigatie
  $$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.tab)));
  $$('#uren-seg button').forEach(b => b.addEventListener('click', () => zetSub(b.dataset.sub)));
  $('#me-btn').addEventListener('click', () => { if (viaTablet()) meldTabletAf('Afgemeld. Tot de volgende keer!'); else openProfiel(); });
  // Chat
  $('#chat-form').addEventListener('submit', verstuurChat);
  $('#chat-in').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); verstuurChat(); } });
  $('#chat-in').addEventListener('input', e => { e.target.style.height = ''; e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px'; });
  // Checklist
  $('#cl-form').addEventListener('submit', leverChecklistIn);
  $('#cl-datum').addEventListener('change', updateClMeta);
  $$('input[name=cl-dienst]').forEach(r => r.addEventListener('change', updateClMeta));
  $('#cl-taken').addEventListener('change', resetWaarschuwing);
  $('#cl-min').addEventListener('click', () => zetLeden(clLeden - 1));
  $('#cl-plus').addEventListener('click', () => zetLeden(clLeden + 1));
  $('#cl-add-defect').addEventListener('click', voegDefectToe);
  $('#cl-geeninc').addEventListener('change', e => { $('#cl-inc-wrap').hidden = e.target.checked; if (!e.target.checked) $('#cl-inc').focus(); });
  // TD
  $('#td-form').addEventListener('submit', meldDefect);
  $('#td-code').addEventListener('input', toonApparaatNaam);
  $('#td-prio').addEventListener('change', () => { tdPrioHandmatig = true; $('#td-prio-hint').textContent = ''; });
  $('#td-desc').addEventListener('input', () => {
    if (tdPrioHandmatig) return;
    const p = triage($('#td-desc').value); $('#td-prio').value = String(p);
    $('#td-prio-hint').textContent = $('#td-desc').value.trim().length > 5 ? `Jarvis schat: ${PRIO_TEKST[p].toLowerCase()}. Pas aan als dat niet klopt.` : '';
  });
  $$('#td-filter button').forEach(b => b.addEventListener('click', () => { tdFilter = b.dataset.f; $$('#td-filter button').forEach(x => x.setAttribute('aria-selected', x === b ? 'true' : 'false')); renderTickets(); }));
  // Uren
  $('#ou-form').addEventListener('submit', vraagOverurenAan);
  ['#ou-start', '#ou-eind', '#ou-pauze'].forEach(s => $(s).addEventListener('input', updateOuUren));
  $('#rv-form').addEventListener('submit', vraagRuilAan);
  // Schema
  $('#sc-form').addEventListener('submit', maakSchema);
  $('#sc-print').addEventListener('click', () => window.print());
  $('#sc-kopie').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#sc-uit').dataset.tekst.replace(/\*\*|###? /g, '')); toast('Gekopieerd.'); } catch (e) { toast('Kopiëren lukte niet. Selecteer de tekst zelf.'); } });
  // Dashboard en beheer
  $('#dash-ai-go').addEventListener('click', weekAnalyse);
  $('#bh-terug').addEventListener('click', () => go('dash'));
  $('#bh-mw-nieuw').addEventListener('click', () => bewerkMedewerker(null));
  $('#bh-app-nieuw').addEventListener('click', () => bewerkApparaat(null));
  // Profiel
  $('#me-sluit').addEventListener('click', () => sluitOverlay('#ov-me'));
  $$('input[name=weergave]').forEach(r => r.addEventListener('change', () => { ls.set('jarvis-weergave', r.value); zetThema(); }));
  $('#me-pin-form').addEventListener('submit', async e => {
    e.preventDefault();
    const ok = await metKnop($('#me-pin-form button'), '#me-pin-err', () => store.pinZetten({ pin: $('#me-pin').value.trim() }));
    if (ok) { $('#me-pin').value = ''; profiel.medewerker.heeft_pin = true; $('#me-pin-status').textContent = '(ingesteld)'; toast('PIN opgeslagen. Hiermee log je in op de balie-tablet.'); }
  });
  $('#me-beheer').addEventListener('click', () => { sluitOverlay('#ov-me'); go('beheer'); });
  $('#me-uit').addEventListener('click', uitloggen);
  // Dialogen
  $('#al-ok').addEventListener('click', () => sluitOverlay('#ov-alarm'));
  $('#of-annuleer').addEventListener('click', () => sluitOverlay('#ov-form'));
  $('#of-form').addEventListener('submit', async e => {
    e.preventDefault();
    const ok = await metKnop($('#of-ok'), '#of-err', async () => { await ofOpslaan(); return true; });
    if (ok) sluitOverlay('#ov-form');
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    for (const s of ['#ov-form', '#ov-me']) if (!$(s).hidden) { sluitOverlay(s); return; }
  });
  $$('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o && o.id !== 'ov-alarm') sluitOverlay('#' + o.id); }));
}

start();
