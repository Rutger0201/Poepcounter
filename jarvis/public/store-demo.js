// Jarvis voor DeMIX: demomodus. Alles staat in deze browser (localStorage), er is geen server nodig.
import { ls } from './util.js';
import { maakKern, pinHash, Fout } from './kern.js';
import { DEMO_MEDEWERKERS, DEMO_APPARATEN } from './data.js';

const SLEUTEL = 'jarvis-demo-db-v1', STAAT = 'jarvis-demo-staat-v1', WIE = 'jarvis-demo-wie-v1';
export const DEMO_PIN = '2580';
export const ACTIES = ['ticketMaken', 'ticketBijwerken', 'checklistInleveren', 'checklistAftekenen', 'overurenAanvragen', 'overurenBeoordelen',
  'ruilAanvragen', 'ruilReageren', 'ruilBeoordelen', 'ruilIntrekken', 'medewerkerOpslaan', 'pinZetten', 'apparaatOpslaan'];

async function startData() {
  const d = new Date(); const dag = n => { const x = new Date(d); x.setDate(x.getDate() - n); return x; };
  const isoD = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const medewerkers = [];
  for (const m of DEMO_MEDEWERKERS) medewerkers.push({ ...m, pin_hash: await pinHash(m.id, DEMO_PIN) });
  const t = (nummer, locatie, code, oms, prio, status, door, n) => {
    const app = DEMO_APPARATEN.find(a => a.code === code);
    return { id: 'tk-' + locatie + nummer, nummer, locatie, apparaat_code: code, apparaat_naam: app ? app.naam : null, omschrijving: oms, prio, status, bron: 'app',
      gemeld_door: door, gemeld_op: dag(n).toISOString(), opgepakt_door: status === 'bezig' ? (locatie === 'Almere' ? 'mw-kees' : 'mw-bram') : null, notitie: null, klaar_op: null };
  };
  return {
    medewerkers,
    tablets: [{ id: 'tab-alm', naam: 'Balie-tablet', locatie: 'Almere', email: 'tablet-almere@demix.example' }, { id: 'tab-nwg', naam: 'Balie-tablet', locatie: 'Nieuwegein', email: 'tablet-nieuwegein@demix.example' }],
    apparaten: DEMO_APPARATEN.map(a => ({ ...a })),
    tickets: [
      t('TD-0001', 'Almere', 'ALM-K02', 'Kabel rafelt bij de bovenste katrol', 1, 'open', 'mw-lisa', 0),
      t('TD-0002', 'Almere', 'ALM-F02', 'Band loopt schokkerig boven de 12 km/u', 2, 'bezig', 'mw-mo', 1),
      t('TD-0003', 'Almere', 'ALM-KK2', 'Douchekop 3 druppelt na', 3, 'open', 'mw-eva', 3),
      t('TD-0001', 'Nieuwegein', 'NWG-SP1', 'Bike 7 trapper zit los', 2, 'open', 'mw-ravi', 1)
    ],
    checklists: [
      { id: 'cl-1', locatie: 'Almere', medewerker_id: 'mw-lisa', datum: isoD(dag(1)), dienst: 'avond', taken: { ronde: true, overdracht: true, aed: true, schoon: true, leden: true, kassa: true, sluit: true, notitie: true },
        leden_contact: 4, incident: null, bijzonderheden: 'Rustige avond. Nieuw lid Fatima intake gedaan.', ingeleverd_op: dag(1).toISOString(), afgetekend_door: null, afgetekend_op: null }
    ],
    overuren: [
      { id: 'ou-1', locatie: 'Almere', medewerker_id: 'mw-mo', datum: isoD(dag(2)), start: '22:00', eind: '22:45', pauze: 0, uren: 0.75, reden: 'Lid onwel geworden, gewacht op ambulance.', status: 'wacht', aangevraagd_op: dag(2).toISOString(), beoordeeld_door: null, beoordeeld_op: null }
    ],
    ruilverzoeken: []
  };
}

export function maakDemoStore() {
  let db = null;
  const staat = ls.get(STAAT, { sessies: {}, pogingen: {} });
  const bewaarStaat = () => ls.set(STAAT, staat);
  const bewaar = () => ls.set(SLEUTEL, db);
  async function laad() { if (!db) { db = ls.get(SLEUTEL, null); if (!db) { db = await startData(); bewaar(); } } return db; }
  const past = (rij, gelijk) => Object.entries(gelijk || {}).every(([k, v]) => rij[k] === v);
  const adapter = {
    async lees(tabel, gelijk) { await laad(); return (db[tabel] || []).filter(r => past(r, gelijk)).map(r => structuredClone(r)); },
    async voegToe(tabel, rij) { await laad(); (db[tabel] = db[tabel] || []).push(rij); bewaar(); return structuredClone(rij); },
    async werkBij(tabel, id, velden) { await laad(); const r = db[tabel].find(x => x.id === id); if (!r) throw new Fout('Niet gevonden.', 404); Object.assign(r, velden); bewaar(); return structuredClone(r); }
  };
  const kern = maakKern(adapter, staat, bewaarStaat);
  const wie = () => ls.get(WIE, null);

  async function profiel() {
    const w = wie(); if (!w) return { ingelogd: false, medewerker: null, tablet: null };
    await laad();
    if (w.tablet) {
      const tablet = db.tablets.find(t => t.id === w.tablet); if (!tablet) return { ingelogd: false, medewerker: null, tablet: null };
      const medewerker = w.token ? await kern.medewerkerVoorSessie(tablet, w.token) : null;
      return { ingelogd: true, tablet, medewerker };
    }
    const m = db.medewerkers.find(x => x.id === w.medewerker && x.actief);
    if (!m) return { ingelogd: true, medewerker: null, tablet: null };
    const { pin_hash, ...rest } = m;
    return { ingelogd: true, tablet: null, medewerker: { ...rest, heeft_pin: !!pin_hash } };
  }
  async function actor() {
    const p = await profiel();
    if (!p.medewerker) { const e = new Fout('Je bent niet meer ingelogd.', 401); throw e; }
    return p.medewerker;
  }

  const store = {
    modus: 'demo',
    profiel,
    async demoLogin(id) { ls.set(WIE, { medewerker: id }); },
    async demoTablet(locatie) { await laad(); const t = db.tablets.find(x => x.locatie === locatie); ls.set(WIE, { tablet: t.id }); },
    async uitloggen() { ls.del(WIE); },
    async lijsten() { return kern.acties.lijsten(await actor()); },
    async tabletNamen() {
      const w = wie(); await laad(); const tablet = w && db.tablets.find(t => t.id === w.tablet);
      if (!tablet) throw new Fout('Deze tablet is niet gekoppeld.', 401);
      return kern.tabletNamen(tablet);
    },
    async tabletInloggen(medewerkerId, pin) {
      const w = wie(); await laad(); const tablet = w && db.tablets.find(t => t.id === w.tablet);
      if (!tablet) throw new Fout('Deze tablet is niet gekoppeld.', 401);
      const r = await kern.tabletInloggen(tablet, medewerkerId, pin);
      if (r.ok) ls.set(WIE, { ...w, token: r.token });
      return r;
    },
    async tabletVerleng() { const w = wie(); if (w && w.token) kern.tabletVerleng(w.token); },
    async tabletUitloggen() { const w = wie(); if (w && w.token) { kern.tabletUitloggen(w.token); ls.set(WIE, { tablet: w.tablet }); } },
    async tabletOntkoppelen() { ls.del(WIE); },
    async demoReset() { ls.del(SLEUTEL); ls.del(STAAT); ls.del(WIE); db = null; },
    async chat() { throw new Fout('In de demo werkt de AI nog niet.', 503); },
    async ai() { throw new Fout('In de demo werkt de AI nog niet.', 503); }
  };
  for (const naam of ACTIES) store[naam] = async args => kern.acties[naam](await actor(), args || {});
  return store;
}
