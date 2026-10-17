// Jarvis voor DeMIX: het AI-deel (Claude). Alleen op de server; de API-sleutel komt nooit in de browser.
import Anthropic from '@anthropic-ai/sdk';
import { Fout } from './public/kern.js';
import { functieLabel } from './public/data.js';

const MODEL = process.env.JARVIS_MODEL || 'claude-opus-5-5';
// Bij een geweigerd verzoek schakelt de API zelf over op een passend ander model
const VEILIG = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

const BASIS = `Je bent Jarvis, de digitale collega van DeMIX, een sportclub met vestigingen in Almere en Nieuwegein. Motto: "Add life to years".
Je helpt medewerkers (receptie, fitness, groepslessen, technische dienst en managers) tijdens hun dienst.

Zo werk je:
- Antwoord in het Nederlands, kort en praktisch, in een vriendelijke, informele toon (je/jij). Gebruik korte alinea's of een lijstje.
- Vragen over regels, procedures, verlof, ziekmelden, veiligheid en dergelijke beantwoord je alleen vanuit het personeelshandboek hieronder. Staat het er niet in, zeg dat eerlijk en verwijs naar de leidinggevende of PZ. Verzin geen regels, bedragen of telefoonnummers.
- Meldt iemand een defect of onveilige situatie, maak dan met de tool ticket_maken een TD-ticket aan. Prio 1 = direct gevaar of letsel (losse kabels, scherpe delen, rook, stroom, nooduitgang geblokkeerd). Prio 2 = storing, apparaat buiten gebruik. Prio 3 = klein of cosmetisch. Maak geen ticket voor een vraag of als het defect al open staat in de actuele stand; noem dan het bestaande ticketnummer.
- Bij prio 1 of letsel: zeg eerst dat de plek afgezet moet worden, de receptie gewaarschuwd en bij letsel of brand 112 gebeld.
- Je geeft geen medisch advies aan leden; verwijs naar huisarts of fysiotherapeut.
- De actuele stand van de vestiging krijg je per vraag als systeembericht. Gebruik die voor vragen als "wat staat er open".`;

const TOOLS = [{
  name: 'ticket_maken',
  description: 'Maakt een ticket aan voor de technische dienst (TD) van de vestiging van deze medewerker. Gebruik dit alleen als de medewerker een concreet defect of onveilige situatie meldt.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['apparaat_code', 'omschrijving', 'prio'],
    properties: {
      apparaat_code: { type: 'string', description: 'Code van het apparaat (bijv. ALM-F02) als die genoemd of af te leiden is uit de apparatenlijst, anders een lege string.' },
      omschrijving: { type: 'string', description: 'Korte, duidelijke omschrijving van het defect voor de TD.' },
      prio: { type: 'integer', enum: [1, 2, 3], description: '1 = veiligheid, 2 = storing, 3 = klein' }
    }
  }
}];

const tekstVan = r => r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
function controleerWeigering(r) {
  if (r.stop_reason === 'refusal') throw new Fout('Daar kan Jarvis je niet mee helpen. Vraag het je leidinggevende.', 422);
}
function geldigeBerichten(berichten) {
  if (!Array.isArray(berichten) || !berichten.length) throw new Fout('Geen vraag ontvangen.');
  const lijst = berichten.slice(-20).map(b => ({ role: b && b.role === 'assistant' ? 'assistant' : 'user', content: String((b && b.content) || '').slice(0, 4000) })).filter(b => b.content.trim());
  while (lijst.length && lijst[0].role !== 'user') lijst.shift();
  // Rollen moeten om en om; voeg opeenvolgende berichten van dezelfde rol samen
  const uit = [];
  for (const b of lijst) { const vorige = uit[uit.length - 1]; if (vorige && vorige.role === b.role) vorige.content += '\n\n' + b.content; else uit.push({ ...b }); }
  if (!uit.length || uit[uit.length - 1].role !== 'user') throw new Fout('Geen vraag ontvangen.');
  return uit;
}

export function maakAi({ handboek }) {
  const client = new Anthropic();
  const system = [{ type: 'text', text: `${BASIS}\n\n<personeelshandboek>\n${handboek || '(Het handboek is nog niet geladen. Zeg bij vragen over regels dat je het handboek nog niet hebt en verwijs naar de leidinggevende.)'}\n</personeelshandboek>`, cache_control: { type: 'ephemeral' } }];

  async function chat({ medewerker, berichten, overzicht, ticketMaken }) {
    const messages = geldigeBerichten(berichten);
    const stand = JSON.stringify(overzicht && typeof overzicht === 'object' ? overzicht : {}).slice(0, 4000);
    messages.push({ role: 'system', content: `Je praat met ${medewerker.naam} (${functieLabel(medewerker)}, DeMIX ${medewerker.locatie}). Datum: ${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' })}. Actuele stand: ${stand}` });
    const tickets = [];
    for (let ronde = 0; ronde < 4; ronde++) {
      const r = await client.beta.messages.create({ model: MODEL, max_tokens: 16000, system, tools: TOOLS, messages, output_config: { effort: 'low' }, ...VEILIG });
      controleerWeigering(r);
      if (r.stop_reason !== 'tool_use') return { antwoord: tekstVan(r) || 'Hmm, daar heb ik even geen antwoord op.', tickets };
      messages.push({ role: 'assistant', content: r.content });
      const resultaten = [];
      for (const b of r.content.filter(x => x.type === 'tool_use')) {
        if (b.name !== 'ticket_maken') { resultaten.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: 'Onbekende tool.' }); continue; }
        try {
          const inp = b.input || {};
          if (typeof inp.omschrijving !== 'string' || ![1, 2, 3].includes(inp.prio)) throw new Fout('Ongeldige invoer voor ticket_maken.');
          const t = await ticketMaken({ apparaat_code: String(inp.apparaat_code || ''), omschrijving: inp.omschrijving, prio: inp.prio });
          tickets.push(t);
          resultaten.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify({ nummer: t.nummer, prio: t.prio, apparaat: t.apparaat_code, apparaat_naam: t.apparaat_naam }) });
        } catch (e) { resultaten.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: e.message || 'Ticket maken mislukt.' }); }
      }
      messages.push({ role: 'user', content: resultaten });
    }
    return { antwoord: tickets.length ? `Ik heb ${tickets.map(t => t.nummer).join(', ')} aangemaakt bij de TD.` : 'Dat lukte even niet. Probeer het nog eens.', tickets };
  }

  async function schema(inv) {
    const s = v => String(v || '').slice(0, 500);
    const vraag = `Schrijf een trainingsschema voor een lid van DeMIX${inv.naam ? ` (voornaam: ${s(inv.naam).slice(0, 40)})` : ''}.
Doel: ${s(inv.doel)}. Niveau: ${s(inv.niveau)}. ${s(inv.dagen)} keer per week, ${s(inv.duur)} minuten per keer.
Blessures of beperkingen: ${s(inv.beperk) || 'geen opgegeven'}.
Gebruik gangbare apparaten in een sportschool (loopband, crosstrainer, roeimachine, leg press, chest press, lat pulldown, kabelstation, dumbbells).
Opbouw: een titel in vet, per training een kopje (### Training A, B, ...) met warming-up, oefeningen met sets x herhalingen en rust, cardio en cooling-down. Sluit af met 3 korte tips.
Bij beperkingen: pas het schema aan en zeg dat het lid bij twijfel overlegt met huisarts of fysiotherapeut. Geen inleiding of afsluitende vragen, alleen het schema.`;
    const r = await client.beta.messages.create({ model: MODEL, max_tokens: 16000, system: 'Je bent een ervaren fitnesstrainer bij DeMIX. Je schrijft veilige, haalbare schema’s in het Nederlands.', messages: [{ role: 'user', content: vraag }], output_config: { effort: 'medium' }, ...VEILIG });
    controleerWeigering(r);
    return { tekst: tekstVan(r) };
  }

  async function week(medewerker, invoer) {
    const r = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000,
      system: 'Je bent Jarvis en maakt een korte weekanalyse voor een manager van DeMIX. Nederlands, zakelijk maar vriendelijk. Opbouw: 3 tot 5 opvallende punten, dan precies 3 concrete actiepunten. Noem collega’s alleen bij naam als het om een compliment gaat of om iets dat de manager moet weten. Baseer je alleen op de gegevens.',
      messages: [{ role: 'user', content: `Gegevens van de afgelopen 7 dagen voor DeMIX ${medewerker.locatie}:\n${JSON.stringify(invoer).slice(0, 60000)}` }],
      output_config: { effort: 'medium' }, ...VEILIG
    });
    controleerWeigering(r);
    return { tekst: tekstVan(r) };
  }

  return { chat, schema, week };
}
