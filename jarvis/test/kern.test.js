import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maakKern, pinHash } from '../public/kern.js';
import { magBeoordelen, ruilCheck, berekenOveruren, triage, DEMO_MEDEWERKERS, DEMO_APPARATEN } from '../public/data.js';

const mw = id => DEMO_MEDEWERKERS.find(m => m.id === id);
async function nieuweKern() {
  const tabellen = { medewerkers: [], tablets: [{ id: 'tab-alm', naam: 'Balie', locatie: 'Almere', email: 'tablet@x.nl' }], apparaten: DEMO_APPARATEN.map(a => ({ ...a })), tickets: [], checklists: [], overuren: [], ruilverzoeken: [] };
  for (const m of DEMO_MEDEWERKERS) tabellen.medewerkers.push({ ...m, pin_hash: await pinHash(m.id, '2580') });
  const db = {
    async lees(t, g = {}) { return tabellen[t].filter(r => Object.entries(g).every(([k, v]) => r[k] === v)).map(r => ({ ...r })); },
    async voegToe(t, r) { tabellen[t].push(r); return { ...r }; },
    async werkBij(t, id, v) { const r = tabellen[t].find(x => x.id === id); Object.assign(r, v); return { ...r }; }
  };
  return { kern: maakKern(db), tabellen };
}

test('wie mag wat beoordelen', () => {
  assert.equal(magBeoordelen(mw('mw-joost'), mw('mw-lisa')), true, 'teamleider fitness -> medewerker fitness');
  assert.equal(magBeoordelen(mw('mw-joost'), mw('mw-eva')), false, 'teamleider fitness -> receptie');
  assert.equal(magBeoordelen(mw('mw-sanne'), mw('mw-eva')), true, 'clubmanager -> iedereen eigen vestiging');
  assert.equal(magBeoordelen(mw('mw-sanne'), mw('mw-noor')), false, 'clubmanager -> andere vestiging');
  assert.equal(magBeoordelen(mw('mw-sanne'), mw('mw-sanne')), false, 'niet zichzelf');
  assert.equal(magBeoordelen(mw('mw-lisa'), mw('mw-mo')), false, 'medewerker -> niemand');
});

test('ruilcheck', () => {
  const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  assert.equal(ruilCheck(mw('mw-lisa'), mw('mw-mo'), morgen), null);
  assert.match(ruilCheck(mw('mw-lisa'), mw('mw-eva'), morgen), /andere afdeling/);
  assert.match(ruilCheck(mw('mw-lisa'), mw('mw-lisa'), morgen), /jezelf/);
  assert.match(ruilCheck(mw('mw-lisa'), mw('mw-mo'), '2020-01-01'), /verleden/);
});

test('overuren berekenen', () => {
  assert.deepEqual(berekenOveruren('21:30', '22:45', 0), { uren: 1.25, fout: null });
  assert.equal(berekenOveruren('23:00', '01:00', 30).uren, 1.5, 'over middernacht');
  assert.ok(berekenOveruren('10:00', '10:30', 60).fout);
  assert.ok(berekenOveruren('', '10:30').fout);
});

test('triage', () => {
  assert.equal(triage('Kabel rafelt bij de katrol'), 1);
  assert.equal(triage('Rook uit de motor van de loopband'), 1);
  assert.equal(triage('Band loopt schokkerig'), 2);
  assert.equal(triage('Bekleding heeft een scheurtje in de zitting'), 3);
});

test('ticket krijgt volgnummer en apparaatnaam', async () => {
  const { kern } = await nieuweKern();
  const a = await kern.acties.ticketMaken(mw('mw-lisa'), { apparaat_code: 'alm-f02', omschrijving: 'Maakt raar geluid' });
  const b = await kern.acties.ticketMaken(mw('mw-lisa'), { apparaat_code: '', omschrijving: 'Kabel los bij de deur' });
  assert.equal(a.nummer, 'TD-0001'); assert.equal(a.apparaat_naam, 'Loopband 2'); assert.equal(a.prio, 2);
  assert.equal(b.nummer, 'TD-0002'); assert.equal(b.prio, 1);
  const c = await kern.acties.ticketMaken(mw('mw-noor'), { omschrijving: 'Spiegel vies' });
  assert.equal(c.nummer, 'TD-0001', 'eigen nummering per vestiging');
});

test('alleen TD of manager werkt tickets bij, en alleen in de eigen vestiging', async () => {
  const { kern } = await nieuweKern();
  const t = await kern.acties.ticketMaken(mw('mw-lisa'), { omschrijving: 'Loopband doet het niet' });
  await assert.rejects(kern.acties.ticketBijwerken(mw('mw-lisa'), { id: t.id, status: 'klaar' }), /Alleen de TD/);
  await assert.rejects(kern.acties.ticketBijwerken(mw('mw-bram'), { id: t.id, status: 'klaar' }), /andere vestiging/);
  const k = await kern.acties.ticketBijwerken(mw('mw-kees'), { id: t.id, status: 'bezig' });
  assert.equal(k.opgepakt_door, 'mw-kees');
});

test('checklist: inleveren, defecten worden tickets, aftekenen door de juiste persoon', async () => {
  const { kern } = await nieuweKern();
  const vandaag = new Date(); const datum = `${vandaag.getFullYear()}-${String(vandaag.getMonth() + 1).padStart(2, '0')}-${String(vandaag.getDate()).padStart(2, '0')}`;
  const r = await kern.acties.checklistInleveren(mw('mw-lisa'), { datum, dienst: 'avond', taken: { ronde: true }, leden_contact: 4, defecten: [{ apparaat_code: 'ALM-K03', omschrijving: 'Kabel los', prio: 1 }] });
  assert.equal(r.tickets.length, 1); assert.equal(r.tickets[0].bron, 'checklist');
  await assert.rejects(kern.acties.checklistInleveren(mw('mw-lisa'), { datum, dienst: 'avond' }), /al ingeleverd/);
  await assert.rejects(kern.acties.checklistAftekenen(mw('mw-mo'), { id: r.checklist.id }), /niet aftekenen/);
  await assert.rejects(kern.acties.checklistAftekenen(mw('mw-daan'), { id: r.checklist.id }), /andere vestiging/);
  const a = await kern.acties.checklistAftekenen(mw('mw-joost'), { id: r.checklist.id });
  assert.equal(a.afgetekend_door, 'mw-joost');
});

test('ruilen: collega zegt ja, dan keurt de teamleider goed', async () => {
  const { kern } = await nieuweKern();
  const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const r = await kern.acties.ruilAanvragen(mw('mw-lisa'), { collega_id: 'mw-mo', datum: morgen, dienst: 'avond' });
  await assert.rejects(kern.acties.ruilBeoordelen(mw('mw-joost'), { id: r.id, besluit: 'goed' }), /wacht niet/);
  await assert.rejects(kern.acties.ruilReageren(mw('mw-eva'), { id: r.id, akkoord: true }), /niet aan jou/);
  await kern.acties.ruilReageren(mw('mw-mo'), { id: r.id, akkoord: true });
  const g = await kern.acties.ruilBeoordelen(mw('mw-joost'), { id: r.id, besluit: 'goed' });
  assert.equal(g.status, 'goed');
});

test('lijsten laat geen PIN-hashes en geen andere vestiging zien', async () => {
  const { kern } = await nieuweKern();
  const l = await kern.acties.lijsten(mw('mw-lisa'));
  assert.ok(l.medewerkers.every(m => m.locatie === 'Almere' && !('pin_hash' in m) && m.heeft_pin === true));
});

test('tablet: PIN, sessie en blokkade na 5 fouten', async () => {
  const { kern } = await nieuweKern();
  const tablet = { id: 'tab-alm', locatie: 'Almere' };
  assert.equal((await kern.tabletInloggen(tablet, 'mw-noor', '2580')).ok, false, 'andere vestiging');
  const ok = await kern.tabletInloggen(tablet, 'mw-lisa', '2580');
  assert.equal(ok.ok, true);
  const m = await kern.medewerkerVoorSessie(tablet, ok.token);
  assert.equal(m.id, 'mw-lisa'); assert.equal(m.via_tablet, true);
  assert.equal(await kern.medewerkerVoorSessie({ id: 'tab-andere', locatie: 'Almere' }, ok.token), null, 'token hoort bij één tablet');
  kern.tabletUitloggen(ok.token);
  assert.equal(await kern.medewerkerVoorSessie(tablet, ok.token), null);
  for (let i = 0; i < 4; i++) assert.equal((await kern.tabletInloggen(tablet, 'mw-mo', '1111')).fout, 'Verkeerde PIN.');
  assert.match((await kern.tabletInloggen(tablet, 'mw-mo', '1111')).fout, /Wacht 5 minuten/);
  assert.match((await kern.tabletInloggen(tablet, 'mw-mo', '2580')).fout, /Te vaak/, 'ook de goede PIN wordt geweigerd tijdens de blokkade');
});

test('beheer: alleen clubmanager, en PIN-regels', async () => {
  const { kern } = await nieuweKern();
  await assert.rejects(kern.acties.medewerkerOpslaan(mw('mw-joost'), { naam: 'X', rol: 'medewerker', afdeling: 'fitness' }), /Alleen de clubmanager/);
  const n = await kern.acties.medewerkerOpslaan(mw('mw-sanne'), { naam: 'Tim', email: 'tim@x.nl', rol: 'medewerker', afdeling: 'fitness' });
  assert.equal(n.locatie, 'Almere'); assert.equal(n.heeft_pin, false);
  await assert.rejects(kern.acties.medewerkerOpslaan(mw('mw-sanne'), { naam: 'Tom', email: 'TIM@x.nl', rol: 'medewerker', afdeling: 'fitness' }), /al in gebruik/);
  await assert.rejects(kern.acties.pinZetten(mw('mw-lisa'), { medewerker_id: 'mw-mo', pin: '4821' }), /Alleen de clubmanager/);
  await assert.rejects(kern.acties.pinZetten(mw('mw-lisa'), { pin: '1234' }), /minder voor de hand/);
  await assert.rejects(kern.acties.pinZetten({ ...mw('mw-lisa'), via_tablet: true }, { pin: '4821' }), /eigen telefoon/);
  assert.deepEqual(await kern.acties.pinZetten(mw('mw-lisa'), { pin: '4821' }), { ok: true });
});
