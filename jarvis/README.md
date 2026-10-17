# Jarvis voor DeMIX

De collega-app van DeMIX (Almere en Nieuwegein): dienstchecklist, TD-meldingen, overuren, dienst ruilen,
trainingsschema's en Jarvis, de assistent die vragen uit het personeelshandboek beantwoordt.

## Snel proberen (demo)

```bash
cd jarvis
npm install
npm start          # http://localhost:3000
```

Zonder Supabase-gegevens draait Jarvis als demo: je kiest een collega en alles blijft in je browser.
Op de balie-tablet is de demo-PIN voor iedereen `2580`. De AI staat in de demo uit; de rest werkt.

## Wat zit erin

| Onderdeel | Wat het doet |
|---|---|
| **Jarvis** | Chat. Beantwoordt vragen uit `handboek.md`, laat zien wat er openstaat, maakt TD-tickets van meldingen. |
| **Checklist** | Dienstchecklist met ledencontact-teller (doel 3), defecten worden direct tickets. Leidinggevenden tekenen af. |
| **TD** | Defect melden met automatische prio-inschatting. Prio 1 opent het veiligheidsscherm. TD en managers pakken op en melden af. |
| **Uren** | Overuren schrijven en dienst ruilen (collega zegt ja, leidinggevende keurt goed). |
| **Schema** | Trainingsschema voor een lid; met AI aan schrijft Claude het, anders een vaste opbouw. |
| **Overzicht** | Cijfers van de week, ledencontact per dag, overdrachten en (managers) een weekanalyse door Jarvis. |
| **Beheer** | Clubmanager beheert medewerkers en PIN's, clubmanager of TD beheert apparaten. |
| **Balie-tablet** | Gedeelde tablet: collega kiest zijn naam, tikt een PIN van 4 cijfers en wordt na 3 minuten stilte afgemeld. |
| **NFC** | Sticker met `https://<jouw-domein>/t/ALM-F01` op een apparaat: scannen opent direct een melding voor dat apparaat. |

Rechten: medewerkers zien hun eigen checklists en aanvragen; een teamleider beoordeelt medewerkers van zijn eigen
afdeling; de clubmanager alles in zijn vestiging. Niemand ziet gegevens van de andere vestiging.

## Live zetten

1. **Supabase**: maak een project, open de SQL Editor en voer `schema.sql` uit. Pas daarin eerst de e-mailadressen
   van de twee clubmanagers en de tablets aan.
2. **Accounts**: maak in Supabase onder *Authentication > Users* een gebruiker voor elke clubmanager (alleen e-mail)
   en voor elke balie-tablet (e-mail plus wachtwoord). Collega's die de clubmanager later in de app toevoegt
   krijgen automatisch een account.
3. **Inlogmail**: zet onder *Authentication > Email Templates > Magic Link* de code in de mail met `{{ .Token }}`,
   want Jarvis werkt met een code in plaats van een link.
4. **Handboek**: zet het personeelshandboek als tekst in `handboek.md` naast `server.js`.
5. **Server** (Node 20 of nieuwer), met deze omgevingsvariabelen:

   | Variabele | Waarde |
   |---|---|
   | `SUPABASE_URL` | Project URL uit Supabase |
   | `SUPABASE_ANON_KEY` | anon/public key (mag in de browser) |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role key (geheim, alleen op de server) |
   | `ANTHROPIC_API_KEY` | API-sleutel voor Claude; leeg = AI uit |
   | `JARVIS_MODEL` | optioneel, standaard `claude-opus-5-5` |
   | `PORT` | optioneel, standaard 3000 |

   Zet de server achter HTTPS (bijvoorbeeld op Render, Railway of Fly.io). De service worker en het
   installeren als app werken alleen via HTTPS.
6. **Balie-tablet**: open Jarvis, tik op *Dit is de balie-tablet* en log in met het tablet-account. Collega's
   stellen hun PIN in via hun eigen telefoon (profiel) of de clubmanager doet het via Beheer.

Over de AI: Jarvis gebruikt Claude met het handboek als context en kan zelf TD-tickets maken. Als het model
een vraag weigert, schakelt de API automatisch over op een passend ander model (`fallbacks: "default"`).

## Ontwikkelen

```bash
npm test     # regels, server (tegen een nagemaakte Supabase) en de AI-lus (tegen een nagemaakte API)
```

| Bestand | Inhoud |
|---|---|
| `server.js` | Webserver, inloggen controleren, API-routes, Supabase via REST |
| `ai.js` | Claude: chat met ticket-tool, trainingsschema, weekanalyse |
| `public/kern.js` | Alle regels en rechten; draait op de server én in de demo |
| `public/data.js` | Rollen, afdelingen, checklist-taken, prio-inschatting, demogegevens |
| `public/app.js` | De app in de browser |
| `public/store-*.js` | Opslag: `store-demo.js` (localStorage) en `store-supabase.js` (live) |
