// Test de AI-lus tegen een nagemaakte Claude API: tool_use -> ticket -> antwoord.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let mock, verzoeken = [];
before(async () => {
  mock = http.createServer((req, res) => {
    let body = ''; req.on('data', d => { body += d; });
    req.on('end', () => {
      const v = JSON.parse(body); verzoeken.push({ pad: req.url, headers: req.headers, body: v });
      const laatste = v.messages[v.messages.length - 1];
      const eerste = !Array.isArray(laatste.content);
      const content = v.tools && eerste
        ? [{ type: 'text', text: 'Ik meld het.' }, { type: 'tool_use', id: 'tu1', name: 'ticket_maken', input: { apparaat_code: 'ALM-F02', omschrijving: 'Band schokt', prio: 2 } }]
        : [{ type: 'text', text: v.tools ? 'TD-0009 staat bij de TD.' : '**Schema**' }];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: v.model, content, stop_reason: content.some(c => c.type === 'tool_use') ? 'tool_use' : 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  await new Promise(r => mock.listen(0, r));
  process.env.ANTHROPIC_API_KEY = 'test'; process.env.ANTHROPIC_BASE_URL = `http://localhost:${mock.address().port}`;
});
after(() => mock.close());

test('chat maakt via de tool een ticket en geeft het antwoord terug', async () => {
  const { maakAi } = await import('../ai.js');
  const ai = maakAi({ handboek: 'Ziekmelden: voor 7:00 bellen.' });
  const gemaakt = [];
  const r = await ai.chat({
    medewerker: { naam: 'Lisa', rol: 'medewerker', afdeling: 'fitness', locatie: 'Almere' },
    berichten: [{ role: 'assistant', content: 'genegeerd want eerst' }, { role: 'user', content: 'Loopband 2 schokt' }],
    overzicht: { vestiging: 'Almere' },
    ticketMaken: async a => { gemaakt.push(a); return { nummer: 'TD-0009', prio: a.prio, apparaat_code: a.apparaat_code, apparaat_naam: 'Loopband 2' }; }
  });
  assert.equal(r.antwoord, 'TD-0009 staat bij de TD.');
  assert.equal(gemaakt.length, 1); assert.equal(r.tickets[0].nummer, 'TD-0009');
  const v1 = verzoeken[0];
  assert.equal(v1.body.model, 'claude-opus-5-5');
  assert.equal(v1.body.fallbacks, 'default'); assert.match(v1.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(v1.body.messages[0].role, 'user', 'begint met de gebruiker');
  assert.equal(v1.body.messages.at(-1).role, 'system', 'actuele stand als systeembericht');
  assert.match(v1.body.system[0].text, /voor 7:00 bellen/);
  const v2 = verzoeken[1].body.messages;
  assert.equal(v2.at(-1).content[0].type, 'tool_result'); assert.equal(v2.at(-2).role, 'assistant');
});

test('schema geeft tekst terug', async () => {
  const { maakAi } = await import('../ai.js');
  const r = await maakAi({ handboek: '' }).schema({ doel: 'kracht', niveau: 'start', dagen: '2', duur: '45' });
  assert.equal(r.tekst, '**Schema**');
});
