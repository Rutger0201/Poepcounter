// Jarvis voor DeMIX: vaste gegevens en regels (gedeeld door browser en server)
export const ROLLEN = {
  medewerker: 'Medewerker',
  teamleider: 'Teamleider',
  clubmanager: 'Clubmanager',
  td: 'Technische dienst'
};
export const AFDELINGEN = {
  receptie: 'Receptie',
  fitness: 'Fitness',
  groepsles: 'Groepslessen',
  td: 'Technische dienst',
  management: 'Management'
};
export const LOCATIES = ['Almere', 'Nieuwegein'];

export function functieLabel(m) {
  if (!m) return '';
  if (m.rol === 'medewerker') return `Medewerker ${(AFDELINGEN[m.afdeling] || m.afdeling || '').toLowerCase()}`.trim();
  if (m.rol === 'teamleider') return `Teamleider ${(AFDELINGEN[m.afdeling] || '').toLowerCase()}`.trim();
  return ROLLEN[m.rol] || 'Medewerker';
}
export const isManager = m => !!m && (m.rol === 'teamleider' || m.rol === 'clubmanager');
export const isClubmanager = m => !!m && m.rol === 'clubmanager';
export const isTD = m => !!m && (m.rol === 'td' || m.rol === 'clubmanager');

// Mag `wie` iets van `mw` goedkeuren of aftekenen?
export function magBeoordelen(wie, mw) {
  if (!wie || !mw || wie.id === mw.id || wie.locatie !== mw.locatie) return false;
  if (wie.rol === 'clubmanager') return true;
  if (wie.rol === 'teamleider') return mw.rol !== 'clubmanager' && mw.rol !== 'teamleider' && mw.afdeling === wie.afdeling;
  return false;
}

// Controle voor een dienstruil. Geeft een foutmelding of null.
export function ruilCheck(aanvrager, collega, datum, vandaag = new Date()) {
  if (!aanvrager || !collega) return 'Kies een collega.';
  if (aanvrager.id === collega.id) return 'Je kunt niet met jezelf ruilen.';
  if (!collega.actief) return `${collega.naam} is niet meer actief.`;
  if (collega.locatie !== aanvrager.locatie) return 'Ruilen kan alleen binnen je eigen vestiging.';
  if (collega.afdeling !== aanvrager.afdeling) return `${collega.naam} werkt op een andere afdeling. Ruil met iemand van ${AFDELINGEN[aanvrager.afdeling] || 'je afdeling'}.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datum || ''))) return 'Kies een datum.';
  const v = new Date(vandaag); v.setHours(0, 0, 0, 0);
  const [y, m, d] = datum.split('-').map(Number);
  if (new Date(y, m - 1, d) < v) return 'Een dienst in het verleden kun je niet meer ruilen.';
  return null;
}

// Uren tussen start en eind (HH:MM), min pauze in minuten. Over middernacht telt door.
export function berekenOveruren(start, eind, pauze = 0) {
  const min = s => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  let a = min(start), b = min(eind);
  if (isNaN(a) || isNaN(b)) return { uren: 0, fout: 'Vul een begin- en eindtijd in.' };
  if (b <= a) b += 24 * 60;
  const netto = b - a - (Number(pauze) || 0);
  if (netto <= 0) return { uren: 0, fout: 'De pauze is langer dan de gewerkte tijd.' };
  if (netto > 12 * 60) return { uren: 0, fout: 'Meer dan 12 uur achter elkaar? Check de tijden even.' };
  return { uren: Math.round(netto / 15) / 4, fout: null };
}

// Dienstchecklist. 'sluit' is alleen nodig bij avonddiensten en in het weekend.
export const TAKEN = [
  { id: 'ronde', groep: 'Start van de dienst', label: 'Rondje door de club gelopen', sub: 'Vloer, kleedkamers, toiletten en nooduitgangen vrij' },
  { id: 'overdracht', groep: 'Start van de dienst', label: 'Overdracht gelezen', sub: 'Bijzonderheden van de vorige dienst en open TD-tickets' },
  { id: 'aed', groep: 'Start van de dienst', label: 'AED en EHBO-koffer gecontroleerd', sub: 'Lampje AED groen, koffer compleet' },
  { id: 'schoon', groep: 'Tijdens de dienst', label: 'Apparaten en vloer schoon', sub: 'Ontsmetten, gewichten terug in de rekken' },
  { id: 'leden', groep: 'Tijdens de dienst', label: 'Leden actief benaderd', sub: 'Doel: minimaal 3 goede gesprekken per dienst' },
  { id: 'kassa', groep: 'Tijdens de dienst', label: 'Receptie en bar op orde', sub: 'Voorraad, handdoeken, kassa klopt' },
  { id: 'sluit', groep: 'Afsluiten', label: 'Club afgesloten volgens sluitprotocol', sub: 'Iedereen eruit, lichten uit, alarm erop, deuren dicht' },
  { id: 'notitie', groep: 'Afsluiten', label: 'Overdracht voor de volgende dienst geschreven' }
];

// Inschatting van de prioriteit uit een omschrijving
const PRIO1 = /(kabel|gebroken|breekt|knapt|los(se)?\b|valt|vallen|rook|brand|vonk|stroom|elektr|kortsluit|scherp|glas|bloed|gewond|letsel|onveilig|gevaar|lekt? .*stroom|klem|vast ?gezeten|nooduitgang|aed)/i;
const PRIO3 = /(piept|kraakt|kras|vies|sticker|bekleding|scheur(tje)? in|lampje|display flikkert|klein|cosmetisch|schroefje|wiebelt een beetje)/i;
export function triage(tekst) {
  const t = String(tekst || '');
  if (PRIO1.test(t)) return 1;
  if (PRIO3.test(t)) return 3;
  return 2;
}

// Vaste lijst voor de demo (zonder echte accounts)
export const DEMO_MEDEWERKERS = [
  { id: 'mw-sanne', naam: 'Sanne', email: 'sanne@demix.example', locatie: 'Almere', rol: 'clubmanager', afdeling: 'management', actief: true },
  { id: 'mw-joost', naam: 'Joost', email: 'joost@demix.example', locatie: 'Almere', rol: 'teamleider', afdeling: 'fitness', actief: true },
  { id: 'mw-lisa', naam: 'Lisa', email: 'lisa@demix.example', locatie: 'Almere', rol: 'medewerker', afdeling: 'fitness', actief: true },
  { id: 'mw-mo', naam: 'Mo', email: 'mo@demix.example', locatie: 'Almere', rol: 'medewerker', afdeling: 'fitness', actief: true },
  { id: 'mw-eva', naam: 'Eva', email: 'eva@demix.example', locatie: 'Almere', rol: 'medewerker', afdeling: 'receptie', actief: true },
  { id: 'mw-kees', naam: 'Kees', email: 'kees@demix.example', locatie: 'Almere', rol: 'td', afdeling: 'td', actief: true },
  { id: 'mw-fleur', naam: 'Fleur', email: 'fleur@demix.example', locatie: 'Nieuwegein', rol: 'clubmanager', afdeling: 'management', actief: true },
  { id: 'mw-daan', naam: 'Daan', email: 'daan@demix.example', locatie: 'Nieuwegein', rol: 'teamleider', afdeling: 'receptie', actief: true },
  { id: 'mw-noor', naam: 'Noor', email: 'noor@demix.example', locatie: 'Nieuwegein', rol: 'medewerker', afdeling: 'receptie', actief: true },
  { id: 'mw-ravi', naam: 'Ravi', email: 'ravi@demix.example', locatie: 'Nieuwegein', rol: 'medewerker', afdeling: 'groepsles', actief: true },
  { id: 'mw-bram', naam: 'Bram', email: 'bram@demix.example', locatie: 'Nieuwegein', rol: 'td', afdeling: 'td', actief: true }
];
export const DEMO_APPARATEN = [
  ['ALM-F01', 'Loopband 1'], ['ALM-F02', 'Loopband 2'], ['ALM-F03', 'Crosstrainer'], ['ALM-K01', 'Leg press'], ['ALM-K02', 'Kabelstation'], ['ALM-K03', 'Smith machine'], ['ALM-KK1', 'Kleedkamer dames'], ['ALM-KK2', 'Kleedkamer heren'],
  ['NWG-F01', 'Loopband 1'], ['NWG-F02', 'Roeimachine'], ['NWG-K01', 'Chest press'], ['NWG-K02', 'Lat pulldown'], ['NWG-GL1', 'Groepsleszaal'], ['NWG-SP1', 'Spinningzaal']
].map(([code, naam]) => ({ id: 'ap-' + code, code, naam, locatie: code.startsWith('ALM') ? 'Almere' : 'Nieuwegein', actief: true }));
