# Beck on the Rocks · website

Eerste versie van de website voor Beck on the Rocks, freelance bartender.
Gewone HTML, CSS en JavaScript: geen build-stap nodig. Open `index.html` in je browser
of zet de map op een host als Netlify, Vercel of GitHub Pages.

## Opbouw
Eén homescreen; de andere pagina's open je via het menu (Over mij, Cocktails, Diensten,
Prijzen, Reviews, FAQ, Boek mij). Elke pagina is een `<div class="page">` in `index.html`.

## Prijzen en voorwaarden
- €45 per uur achter de bar
- Altijd 1 uur voorbereiding (€45) en €75 voor cocktailmenu & gebruik materialen
- Boeken binnen 1 maand voor het feest: spoedtoeslag van 25% over alle kosten
- Geen aanbetaling; annuleren binnen 14 dagen: 20% van het afgesproken bedrag
- Klant regelt drank, ijs, ingrediënten en een werkplek

Bedragen aanpassen? Doe dat op de pagina Prijzen in `index.html` én in `TARIEF`
bovenaan `assets/js/main.js` (voor de calculator).

## Nog zelf invullen vóór livegang
- **Reviews**: nu voorbeeldteksten, vervang ze door echte reviews (en de score).
- **Foto's**: portret bij "Over mij" en de tegels bij "Sfeerbeelden".
- **Contactgegevens**: e-mail, telefoon, Instagram, KvK (in `index.html` en `MAIL` in `assets/js/main.js`).
- **Ervaring**: de cijfers op het homescreen en de jaartallen in de tijdlijn.
- **Cocktails**: lijst `COCKTAILS` bovenaan `assets/js/main.js`.

Kleuren en lettertypes staan als variabelen bovenaan `assets/css/style.css`.
