// Jarvis voor DeMIX: de regels achter alle acties.
// Draait in de browser (demo, met localStorage) en op de server (live, met Supabase).
import { magBeoordelen, isManager, isClubmanager, isTD, ruilCheck, berekenOveruren, triage, ROLLEN, AFDELINGEN, LOCATIES } from './data.js';

export class Fout extends Error { constructor(tekst, status = 400) { super(tekst); this.status = status; } }

const nu = () => new Date().toISOString();
const vandaagISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nieuwId = () => globalThis.crypto.randomUUID();
const tekst = (v, max, naam) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw new Fout(`${naam} is te lang (max ${max} tekens).`);
  return s;
};
const isDatum = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const dagenTerug = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

export async function pinHash(medewerkerId, pin) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`jarvis-pin:${medewerkerId}:${pin}`));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
const zonderGeheim = m => { if (!m) return m; const { pin_hash, ...rest } = m; return { ...rest, heeft_pin: !!pin_hash }; };

/**
 * db: { lees(tabel, gelijk), voegToe(tabel, rij), werkBij(tabel, id, velden) } — allemaal async.
 * staat: { sessies: {}, pogingen: {} } plus bewaar(): voor tabletsessies en PIN-pogingen.
 */
export function maakKern(db, staat = { sessies: {}, pogingen: {} }, bewaar = () => {}) {
  const SESSIE_MS = 5 * 60 * 1000, MAX_POGINGEN = 5, BLOK_MS = 5 * 60 * 1000;

  async function een(tabel, id) {
    const [r] = await db.lees(tabel, { id });
    if (!r) throw new Fout('Niet gevonden.', 404);
    return r;
  }
  async function medewerkersVan(locatie) { return db.lees('medewerkers', { locatie }); }
  function zelfdeLocatie(actor, rij) { if (rij.locatie !== actor.locatie) throw new Fout('Dat hoort bij een andere vestiging.', 403); }

  /* ---------- Inloggen ---------- */
  async function profielVoorEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e) return { ingelogd: false, medewerker: null, tablet: null };
    const [tablet] = (await db.lees('tablets', {})).filter(t => String(t.email).toLowerCase() === e);
    if (tablet) return { ingelogd: true, medewerker: null, tablet };
    const [m] = (await db.lees('medewerkers', {})).filter(x => String(x.email || '').toLowerCase() === e && x.actief);
    return { ingelogd: true, medewerker: m ? zonderGeheim(m) : null, tablet: null };
  }

  function opruimen() {
    const t = Date.now();
    for (const [k, s] of Object.entries(staat.sessies)) if (s.verloopt < t) delete staat.sessies[k];
  }
  async function medewerkerVoorSessie(tablet, token) {
    opruimen();
    const s = token && staat.sessies[token];
    if (!s || s.tablet_id !== tablet.id) return null;
    const [m] = await db.lees('medewerkers', { id: s.medewerker_id });
    if (!m || !m.actief || m.locatie !== tablet.locatie) return null;
    return { ...zonderGeheim(m), via_tablet: true };
  }
  async function tabletInloggen(tablet, medewerkerId, pin) {
    const p = staat.pogingen[medewerkerId] || { n: 0, tot: 0 };
    if (p.tot > Date.now()) return { ok: false, fout: `Te vaak een verkeerde PIN. Probeer het over ${Math.ceil((p.tot - Date.now()) / 60000)} minuten opnieuw.` };
    const [m] = await db.lees('medewerkers', { id: medewerkerId });
    if (!m || !m.actief || m.locatie !== tablet.locatie) return { ok: false, fout: 'Deze collega hoort niet bij deze tablet.' };
    if (!m.pin_hash) return { ok: false, fout: 'Je hebt nog geen PIN. Vraag je manager er een in te stellen, of stel hem zelf in via je telefoon.' };
    if (!/^\d{4}$/.test(String(pin))) return { ok: false, fout: 'Verkeerde PIN.' };
    if (await pinHash(m.id, pin) !== m.pin_hash) {
      p.n += 1;
      if (p.n >= MAX_POGINGEN) { p.n = 0; p.tot = Date.now() + BLOK_MS; staat.pogingen[medewerkerId] = p; bewaar(); return { ok: false, fout: 'Te vaak een verkeerde PIN. Wacht 5 minuten.' }; }
      staat.pogingen[medewerkerId] = p; bewaar();
      return { ok: false, fout: 'Verkeerde PIN.' };
    }
    delete staat.pogingen[medewerkerId];
    const token = nieuwId() + nieuwId().replace(/-/g, '');
    staat.sessies[token] = { tablet_id: tablet.id, medewerker_id: m.id, verloopt: Date.now() + SESSIE_MS };
    bewaar();
    return { ok: true, token };
  }
  async function tabletNamen(tablet) {
    return (await medewerkersVan(tablet.locatie)).filter(m => m.actief)
      .map(m => ({ id: m.id, naam: m.naam, rol: m.rol, afdeling: m.afdeling, locatie: m.locatie, actief: true, heeft_pin: !!m.pin_hash }))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  }
  function tabletVerleng(token) { const s = staat.sessies[token]; if (s) { s.verloopt = Date.now() + SESSIE_MS; bewaar(); } return { ok: !!s }; }
  function tabletUitloggen(token) { delete staat.sessies[token]; bewaar(); return { ok: true }; }

  /* ---------- Acties namens een ingelogde medewerker ---------- */
  const acties = {
    async lijsten(actor) {
      const loc = actor.locatie;
      const [mws, app, tk, cl, ou, rv] = await Promise.all([
        medewerkersVan(loc), db.lees('apparaten', { locatie: loc }), db.lees('tickets', { locatie: loc }),
        db.lees('checklists', { locatie: loc }), db.lees('overuren', { locatie: loc }), db.lees('ruilverzoeken', { locatie: loc })
      ]);
      const mwVan = id => mws.find(m => m.id === id);
      const grens = dagenTerug(14), grensCl = dagenTerug(31).slice(0, 10), grensUren = dagenTerug(92).slice(0, 10);
      const nieuwste = (a, b) => String(b.gemeld_op || b.aangevraagd_op || b.ingeleverd_op || '').localeCompare(String(a.gemeld_op || a.aangevraagd_op || a.ingeleverd_op || ''));
      return {
        medewerkers: mws.map(zonderGeheim).sort((a, b) => a.naam.localeCompare(b.naam, 'nl')),
        apparaten: app.sort((a, b) => a.code.localeCompare(b.code)),
        tickets: tk.filter(t => t.status !== 'klaar' || (t.klaar_op || '') > grens).sort((a, b) => a.prio - b.prio || nieuwste(a, b)),
        checklists: cl.filter(c => String(c.datum) >= grensCl && (c.medewerker_id === actor.id || magBeoordelen(actor, mwVan(c.medewerker_id))) ).sort(nieuwste),
        overuren: ou.filter(o => String(o.datum) >= grensUren && (o.medewerker_id === actor.id || magBeoordelen(actor, mwVan(o.medewerker_id)))).sort(nieuwste),
        ruilverzoeken: rv.filter(r => String(r.datum) >= grensUren && (r.aanvrager_id === actor.id || r.collega_id === actor.id || magBeoordelen(actor, mwVan(r.aanvrager_id)))).sort(nieuwste)
      };
    },

    async ticketMaken(actor, { apparaat_code, omschrijving, prio, bron }) {
      const oms = tekst(omschrijving, 1000, 'De omschrijving');
      if (oms.length < 3) throw new Fout('Beschrijf kort wat er mis is.');
      const code = tekst(apparaat_code, 40, 'De code').toUpperCase();
      const app = code ? (await db.lees('apparaten', { locatie: actor.locatie })).find(a => a.code.toUpperCase() === code) : null;
      let p = Number(prio); if (![1, 2, 3].includes(p)) p = triage(oms);
      const alle = await db.lees('tickets', { locatie: actor.locatie });
      const volg = alle.reduce((mx, t) => Math.max(mx, Number(String(t.nummer).replace(/\D/g, '')) || 0), 0) + 1;
      return db.voegToe('tickets', {
        id: nieuwId(), nummer: `TD-${String(volg).padStart(4, '0')}`, locatie: actor.locatie,
        apparaat_code: app ? app.code : (code || null), apparaat_naam: app ? app.naam : null,
        omschrijving: oms, prio: p, status: 'open', bron: ['app', 'nfc', 'checklist', 'jarvis'].includes(bron) ? bron : 'app',
        gemeld_door: actor.id, gemeld_op: nu(), opgepakt_door: null, notitie: null, klaar_op: null
      });
    },

    async ticketBijwerken(actor, { id, status, notitie, prio }) {
      const t = await een('tickets', id); zelfdeLocatie(actor, t);
      if (!isTD(actor) && !isManager(actor)) throw new Fout('Alleen de TD of een manager kan tickets bijwerken.', 403);
      const v = {};
      if (status) {
        if (!['open', 'bezig', 'klaar'].includes(status)) throw new Fout('Onbekende status.');
        v.status = status;
        if (status === 'bezig' && !t.opgepakt_door) v.opgepakt_door = actor.id;
        v.klaar_op = status === 'klaar' ? nu() : null;
      }
      if (prio != null) { const p = Number(prio); if (![1, 2, 3].includes(p)) throw new Fout('Onbekende prioriteit.'); v.prio = p; }
      if (notitie != null) v.notitie = tekst(notitie, 1000, 'De notitie') || null;
      return db.werkBij('tickets', id, v);
    },

    async checklistInleveren(actor, c) {
      if (!isDatum(c.datum)) throw new Fout('Kies een datum.');
      if (c.datum > vandaagISO()) throw new Fout('Een checklist voor een dag in de toekomst kan nog niet.');
      if (!['ochtend', 'middag', 'avond'].includes(c.dienst)) throw new Fout('Kies een dienst.');
      const bestaand = (await db.lees('checklists', { locatie: actor.locatie })).find(x => x.medewerker_id === actor.id && x.datum === c.datum && x.dienst === c.dienst);
      if (bestaand) throw new Fout(`Je hebt de ${c.dienst}checklist van die dag al ingeleverd.`);
      const taken = {}; for (const [k, v] of Object.entries(c.taken || {})) taken[String(k).slice(0, 30)] = !!v;
      const rij = await db.voegToe('checklists', {
        id: nieuwId(), locatie: actor.locatie, medewerker_id: actor.id, datum: c.datum, dienst: c.dienst, taken,
        leden_contact: Math.max(0, Math.min(99, Number(c.leden_contact) || 0)),
        incident: tekst(c.incident, 2000, 'Het incident') || null, bijzonderheden: tekst(c.bijzonderheden, 2000, 'De bijzonderheden') || null,
        ingeleverd_op: nu(), afgetekend_door: null, afgetekend_op: null
      });
      const tickets = [];
      for (const d of (c.defecten || []).slice(0, 10)) {
        if (!String(d.omschrijving || '').trim()) continue;
        tickets.push(await acties.ticketMaken(actor, { ...d, bron: 'checklist' }));
      }
      return { checklist: rij, tickets };
    },

    async checklistAftekenen(actor, { id }) {
      const c = await een('checklists', id); zelfdeLocatie(actor, c);
      const [mw] = await db.lees('medewerkers', { id: c.medewerker_id });
      if (!magBeoordelen(actor, mw)) throw new Fout('Deze checklist mag jij niet aftekenen.', 403);
      if (c.afgetekend_door) throw new Fout('Deze checklist is al afgetekend.');
      return db.werkBij('checklists', id, { afgetekend_door: actor.id, afgetekend_op: nu() });
    },

    async overurenAanvragen(actor, o) {
      if (!isDatum(o.datum)) throw new Fout('Kies een datum.');
      if (o.datum > vandaagISO()) throw new Fout('Overuren schrijf je achteraf.');
      const r = berekenOveruren(o.start, o.eind, o.pauze);
      if (r.fout) throw new Fout(r.fout);
      const reden = tekst(o.reden, 500, 'De reden');
      if (reden.length < 3) throw new Fout('Schrijf kort waarom je langer bleef.');
      return db.voegToe('overuren', {
        id: nieuwId(), locatie: actor.locatie, medewerker_id: actor.id, datum: o.datum, start: o.start, eind: o.eind,
        pauze: Number(o.pauze) || 0, uren: r.uren, reden, status: 'wacht', aangevraagd_op: nu(), beoordeeld_door: null, beoordeeld_op: null
      });
    },

    async overurenBeoordelen(actor, { id, besluit }) {
      const o = await een('overuren', id); zelfdeLocatie(actor, o);
      const [mw] = await db.lees('medewerkers', { id: o.medewerker_id });
      if (!magBeoordelen(actor, mw)) throw new Fout('Deze aanvraag mag jij niet beoordelen.', 403);
      if (o.status !== 'wacht') throw new Fout('Deze aanvraag is al beoordeeld.');
      if (!['goed', 'afgewezen'].includes(besluit)) throw new Fout('Onbekend besluit.');
      return db.werkBij('overuren', id, { status: besluit, beoordeeld_door: actor.id, beoordeeld_op: nu() });
    },

    async ruilAanvragen(actor, r) {
      const [col] = await db.lees('medewerkers', { id: r.collega_id });
      const fout = ruilCheck(actor, col, r.datum);
      if (fout) throw new Fout(fout);
      if (!['ochtend', 'middag', 'avond'].includes(r.dienst)) throw new Fout('Kies een dienst.');
      return db.voegToe('ruilverzoeken', {
        id: nieuwId(), locatie: actor.locatie, aanvrager_id: actor.id, collega_id: col.id, datum: r.datum, dienst: r.dienst,
        reden: tekst(r.reden, 500, 'De toelichting') || null, status: 'collega', aangevraagd_op: nu(), beoordeeld_door: null, beoordeeld_op: null
      });
    },

    // De collega zegt ja of nee; bij ja gaat het verzoek naar de manager
    async ruilReageren(actor, { id, akkoord }) {
      const r = await een('ruilverzoeken', id); zelfdeLocatie(actor, r);
      if (r.collega_id !== actor.id) throw new Fout('Dit verzoek is niet aan jou gericht.', 403);
      if (r.status !== 'collega') throw new Fout('Op dit verzoek is al gereageerd.');
      return db.werkBij('ruilverzoeken', id, { status: akkoord ? 'wacht' : 'geweigerd' });
    },

    async ruilBeoordelen(actor, { id, besluit }) {
      const r = await een('ruilverzoeken', id); zelfdeLocatie(actor, r);
      const [mw] = await db.lees('medewerkers', { id: r.aanvrager_id });
      if (!magBeoordelen(actor, mw)) throw new Fout('Dit ruilverzoek mag jij niet beoordelen.', 403);
      if (r.status !== 'wacht') throw new Fout('Dit verzoek wacht niet op goedkeuring.');
      if (!['goed', 'afgewezen'].includes(besluit)) throw new Fout('Onbekend besluit.');
      return db.werkBij('ruilverzoeken', id, { status: besluit, beoordeeld_door: actor.id, beoordeeld_op: nu() });
    },

    async ruilIntrekken(actor, { id }) {
      const r = await een('ruilverzoeken', id); zelfdeLocatie(actor, r);
      if (r.aanvrager_id !== actor.id) throw new Fout('Alleen de aanvrager kan intrekken.', 403);
      if (!['collega', 'wacht'].includes(r.status)) throw new Fout('Dit verzoek is al afgehandeld.');
      return db.werkBij('ruilverzoeken', id, { status: 'ingetrokken' });
    },

    async medewerkerOpslaan(actor, m) {
      if (!isClubmanager(actor)) throw new Fout('Alleen de clubmanager beheert medewerkers.', 403);
      const naam = tekst(m.naam, 60, 'De naam');
      if (!naam) throw new Fout('Vul een naam in.');
      if (!ROLLEN[m.rol]) throw new Fout('Kies een rol.');
      if (!AFDELINGEN[m.afdeling]) throw new Fout('Kies een afdeling.');
      const email = tekst(m.email, 120, 'Het e-mailadres').toLowerCase() || null;
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Fout('Dat e-mailadres klopt niet.');
      const alle = await db.lees('medewerkers', {});
      if (email && alle.some(x => x.id !== m.id && String(x.email || '').toLowerCase() === email)) throw new Fout('Dat e-mailadres is al in gebruik.');
      const velden = { naam, email, rol: m.rol, afdeling: m.afdeling, actief: m.actief !== false };
      if (m.id) {
        const oud = await een('medewerkers', m.id); zelfdeLocatie(actor, oud);
        if (oud.id === actor.id && (velden.rol !== 'clubmanager' || !velden.actief)) throw new Fout('Je eigen rol en status pas je niet zelf aan. Vraag een andere clubmanager.');
        return zonderGeheim(await db.werkBij('medewerkers', m.id, velden));
      }
      return zonderGeheim(await db.voegToe('medewerkers', { id: nieuwId(), locatie: actor.locatie, pin_hash: null, ...velden }));
    },

    async pinZetten(actor, { medewerker_id, pin }) {
      const doel = medewerker_id || actor.id;
      const m = await een('medewerkers', doel); zelfdeLocatie(actor, m);
      if (doel !== actor.id && !isClubmanager(actor)) throw new Fout('Alleen de clubmanager kan de PIN van een ander instellen.', 403);
      if (actor.via_tablet && doel === actor.id) throw new Fout('Je eigen PIN wijzig je op je eigen telefoon, niet op de balie-tablet.', 403);
      if (!/^\d{4}$/.test(String(pin))) throw new Fout('Een PIN is precies 4 cijfers.');
      if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) throw new Fout('Kies een minder voor de hand liggende PIN.');
      await db.werkBij('medewerkers', doel, { pin_hash: await pinHash(doel, pin) });
      return { ok: true };
    },

    async apparaatOpslaan(actor, a) {
      if (!isClubmanager(actor) && !isTD(actor)) throw new Fout('Alleen de clubmanager of TD beheert apparaten.', 403);
      const code = tekst(a.code, 20, 'De code').toUpperCase();
      if (!/^[A-Z0-9-]{2,20}$/.test(code)) throw new Fout('Een code bestaat uit letters, cijfers en streepjes, bijv. ALM-F04.');
      const naam = tekst(a.naam, 60, 'De naam');
      if (!naam) throw new Fout('Vul een naam in.');
      const alle = await db.lees('apparaten', {});
      if (alle.some(x => x.id !== a.id && x.code === code)) throw new Fout('Die code bestaat al.');
      if (a.id) { const oud = await een('apparaten', a.id); zelfdeLocatie(actor, oud); return db.werkBij('apparaten', a.id, { code, naam, actief: a.actief !== false }); }
      return db.voegToe('apparaten', { id: nieuwId(), code, naam, locatie: actor.locatie, actief: true });
    }
  };

  return { profielVoorEmail, medewerkerVoorSessie, tabletNamen, tabletInloggen, tabletVerleng, tabletUitloggen, acties, LOCATIES };
}
