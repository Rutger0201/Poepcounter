// Beck on the Rocks: interactie
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ================= Gegevens (hier pas je de inhoud aan) ================= */

  // glas: 'tumbler' | 'coupe' | 'highball' | 'martini'
  const COCKTAILS = [
    { naam: 'Smoked Old Fashioned', cat: 'signature', glas: 'tumbler', c1: '#c77a2a', c2: '#2b1a0b',
      tekst: 'Bourbon, demerara en bitters, gerookt onder een stolp met eikenhout. Mijn visitekaartje.',
      ing: ['Bourbon', 'Demerara', 'Angostura', 'Eikenrook'] },
    { naam: 'Rocks & Roses', cat: 'signature', glas: 'coupe', c1: '#d0708c', c2: '#2a1020',
      tekst: 'Gin, rozensiroop, lychee en limoen, afgemaakt met een zijdezachte foam en rozenblaadje.',
      ing: ['Gin', 'Lychee', 'Roos', 'Limoen'] },
    { naam: 'Golden Hour', cat: 'signature', glas: 'highball', c1: '#f0b54a', c2: '#3a2408',
      tekst: 'Aged rum, passievrucht, vanille en ginger beer. Zonsondergang in een glas.',
      ing: ['Aged rum', 'Passievrucht', 'Vanille', 'Ginger beer'] },
    { naam: 'Espresso Martini', cat: 'klassiek', glas: 'martini', c1: '#6b4126', c2: '#140c07',
      tekst: 'Vodka, vers gezette espresso en koffielikeur. Wakker en feestklaar.',
      ing: ['Vodka', 'Espresso', 'Koffielikeur'] },
    { naam: 'Negroni', cat: 'klassiek', glas: 'tumbler', c1: '#c4362e', c2: '#2a0b08',
      tekst: 'Gin, Campari en zoete vermout in perfecte balans, met een sinaasappelzeste.',
      ing: ['Gin', 'Campari', 'Vermout'] },
    { naam: 'Whiskey Sour', cat: 'klassiek', glas: 'coupe', c1: '#e3b25c', c2: '#2e200b',
      tekst: 'Bourbon, citroen en suiker met een romige schuimkraag. Tijdloos.',
      ing: ['Bourbon', 'Citroen', 'Eiwit of aquafaba'] },
    { naam: 'Basil Smash', cat: 'fris', glas: 'tumbler', c1: '#8cc06b', c2: '#14261f',
      tekst: 'Gin, verse basilicum, citroen en suiker. Groen, fris en verslavend.',
      ing: ['Gin', 'Basilicum', 'Citroen'] },
    { naam: 'Pornstar Martini', cat: 'fris', glas: 'coupe', c1: '#f2a33a', c2: '#3a1f08',
      tekst: 'Vanillevodka en passievrucht met een shot bubbels ernaast. Altijd een hit.',
      ing: ['Vanillevodka', 'Passievrucht', 'Prosecco'] },
    { naam: 'Paloma', cat: 'fris', glas: 'highball', c1: '#f08a7a', c2: '#2e1310',
      tekst: 'Tequila, roze grapefruit, limoen en een zoutrandje. Mexicaanse zomer.',
      ing: ['Tequila', 'Grapefruit', 'Limoen', 'Zout'] },
    { naam: 'Virgin Garden', cat: 'mocktail', glas: 'highball', c1: '#9ccf8a', c2: '#132519',
      tekst: 'Komkommer, munt, vlierbloesem en tonic. Alcoholvrij en allesbehalve saai.',
      ing: ['Komkommer', 'Vlierbloesem', 'Munt', 'Tonic'] },
    { naam: 'Berry Nojito', cat: 'mocktail', glas: 'highball', c1: '#b04a6a', c2: '#25101a',
      tekst: 'Bosvruchten, limoen, munt en soda. De mojito voor iedereen.',
      ing: ['Bosvruchten', 'Limoen', 'Munt', 'Soda'] },
    { naam: 'Spiced Apple Sour', cat: 'mocktail', glas: 'coupe', c1: '#d8a35a', c2: '#2a1a08',
      tekst: 'Appel, kaneel, citroen en een fluweelzachte foam. Herfst in een coupe.',
      ing: ['Appel', 'Kaneel', 'Citroen'] }
  ];

  const LABELS = { signature: 'Signature', klassiek: 'Klassieker', fris: 'Fris & fruitig', mocktail: 'Alcoholvrij' };

  // Tarieven (zelfde bedragen als op de prijzenpagina in index.html)
  const TARIEF = {
    uur: 45,            // per uur achter de bar
    voorbereiding: 1,   // altijd 1 uur voorbereiding
    menu: 75,           // cocktailmenu & gebruik materialen
    spoed: 0.25,        // toeslag bij boeken binnen 1 maand
    annuleren: 0.20     // bij annuleren binnen 14 dagen
  };

  /* ================= SVG-glazen ================= */
  function glasSvg(type) {
    const stroke = 'stroke="#fff" stroke-opacity=".55" stroke-width="2.5" fill="none"';
    const drink = 'fill="#fff" fill-opacity=".28"';
    switch (type) {
      case 'coupe': return `<svg viewBox="0 0 100 120"><path d="M14 22 Q14 62 50 62 Q86 62 86 22 Z" ${drink}/><path d="M10 18 Q10 66 50 66 Q90 66 90 18" ${stroke}/><path d="M50 66 V108 M30 110 H70" ${stroke}/></svg>`;
      case 'martini': return `<svg viewBox="0 0 100 120"><path d="M18 24 L82 24 L50 60 Z" ${drink}/><path d="M8 14 L92 14 L50 62 Z" ${stroke}/><path d="M50 62 V108 M30 110 H70" ${stroke}/><circle cx="64" cy="26" r="4" fill="#3a2414"/><circle cx="56" cy="30" r="4" fill="#3a2414"/></svg>`;
      case 'highball': return `<svg viewBox="0 0 100 120"><rect x="30" y="38" width="40" height="72" rx="3" ${drink}/><path d="M28 10 V108 Q28 112 32 112 H68 Q72 112 72 108 V10" ${stroke}/><path d="M60 2 L54 60" stroke="#fff" stroke-opacity=".7" stroke-width="3"/><rect x="36" y="50" width="14" height="14" rx="2" fill="#fff" fill-opacity=".3"/><rect x="48" y="70" width="14" height="14" rx="2" fill="#fff" fill-opacity=".25"/></svg>`;
      default: return `<svg viewBox="0 0 100 120"><path d="M16 56 H84 L80 104 Q80 110 74 110 H26 Q20 110 20 104 Z" ${drink}/><path d="M12 30 H88 L82 106 Q81 112 75 112 H25 Q19 112 18 106 Z" ${stroke}/><rect x="32" y="50" width="26" height="26" rx="4" fill="#fff" fill-opacity=".3" transform="rotate(-10 45 63)"/></svg>`;
    }
  }

  /* ================= Cocktailkaart ================= */
  const grid = $('#cocktail-grid');
  grid.innerHTML = COCKTAILS.map(c => `
    <article class="card reveal" data-cat="${c.cat}">
      <div class="card__visual" style="--c1:${c.c1};--c2:${c.c2}">
        <span class="card__tag">${LABELS[c.cat]}</span>
        ${glasSvg(c.glas)}
      </div>
      <div class="card__body">
        <h3>${c.naam}</h3>
        <p>${c.tekst}</p>
        <div class="card__ing">${c.ing.map(i => `<span>${i}</span>`).join('')}</div>
      </div>
    </article>`).join('');

  $$('.filter').forEach(btn => btn.addEventListener('click', () => {
    $$('.filter').forEach(b => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-selected', b === btn); });
    const f = btn.dataset.filter;
    $$('.card', grid).forEach(card => card.classList.toggle('is-hidden', f !== 'alle' && card.dataset.cat !== f));
  }));

  /* ================= Navigatie: één pagina tegelijk ================= */
  const nav = $('.nav'), toggle = $('.nav__toggle'), menu = $('#menu'), fab = $('.fab');
  const pages = $$('.page');
  let huidige = null;

  function route() {
    const id = decodeURIComponent(location.hash.slice(1)) || 'home';
    const doel = document.getElementById(id);
    const page = (doel && doel.closest('.page')) || $('#home');
    if (page !== huidige) {
      pages.forEach(p => { p.hidden = p !== page; });
      page.classList.remove('page--in'); void page.offsetWidth; page.classList.add('page--in');
      huidige = page;
      document.title = page.id === 'home' ? 'Beck on the Rocks · Freelance bartender'
        : `${$(`#menu a[href="#${page.id}"]`)?.textContent || ''} · Beck on the Rocks`;
    }
    $$('#menu a').forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + page.id));
    nav.classList.toggle('is-solid', page.id !== 'home');
    fab.classList.toggle('is-hidden', page.id === 'boeken');
    if (doel && doel !== page) doel.scrollIntoView();
    else scrollTo(0, 0);
  }
  addEventListener('hashchange', route);
  route();

  addEventListener('scroll', () => nav.classList.toggle('is-scrolled', scrollY > 40), { passive: true });

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
    menu.classList.toggle('is-open', open);
  });
  $$('a', menu).forEach(a => a.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
  }));

  /* ================= Scroll-animaties & tellers ================= */
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-visible');
    io.unobserve(e.target);
  }), { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 80}ms`; io.observe(el); });

  const tel = el => {
    const doel = +el.dataset.count, start = performance.now(), duur = 1600;
    const stap = t => {
      const p = Math.min(1, (t - start) / duur);
      el.textContent = Math.round(doel * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(stap);
    };
    requestAnimationFrame(stap);
  };
  const io2 = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { tel(e.target); io2.unobserve(e.target); }
  }));
  $$('[data-count]').forEach(el => io2.observe(el));

  /* ================= Prijscalculator ================= */
  const euro = n => '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const isSpoed = datum => {
    if (!datum) return false;
    const grens = new Date(); grens.setHours(0, 0, 0, 0); grens.setMonth(grens.getMonth() + 1);
    return new Date(datum + 'T00:00') < grens;
  };
  const vandaag = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const cU = $('#c-uren'), cD = $('#c-datum');
  cD.min = vandaag;
  $('#boek-form [name=datum]').min = vandaag;

  function bereken() {
    const uren = +cU.value, spoed = isSpoed(cD.value);
    $('#c-uren-out').textContent = uren;
    const regels = [
      [`${uren} uur bartender × ${euro(TARIEF.uur)}`, uren * TARIEF.uur],
      [`Voorbereiding (${TARIEF.voorbereiding} uur)`, TARIEF.voorbereiding * TARIEF.uur],
      ['Cocktailmenu & materialen', TARIEF.menu]
    ];
    const basis = regels.reduce((t, r) => t + r[1], 0);
    if (spoed) regels.push([`Spoedtoeslag (+${TARIEF.spoed * 100}%)`, basis * TARIEF.spoed]);
    const totaal = regels.reduce((t, r) => t + r[1], 0);
    $('#c-lines').innerHTML = regels.map(([l, b]) => `<li${l.startsWith('Spoed') ? ' class="is-spoed"' : ''}><span>${l}</span><b>${euro(b)}</b></li>`).join('');
    $('#c-totaal').textContent = euro(totaal);
    $('#c-detail').textContent = spoed
      ? 'Spoedboeking: je feest is binnen een maand.'
      : cD.value ? 'Normaal tarief: meer dan een maand vooruit geboekt.' : 'Vul een datum in om te zien of er spoedtoeslag geldt.';
  }
  [cU, cD].forEach(el => el.addEventListener('input', bereken));
  bereken();

  $('#c-cta').addEventListener('click', () => {
    const f = $('#boek-form');
    f.elements.uren.value = cU.value;
    if (cD.value) f.elements.datum.value = cD.value;
    f.elements.datum.dispatchEvent(new Event('input'));
  });

  /* ================= Reviews-slider ================= */
  const track = $('#reviews-track'), dots = $('#rev-dots');
  const n = track.children.length;
  let idx = 0, timer;
  dots.innerHTML = Array.from({ length: n }, (_, i) => `<button type="button" aria-label="Review ${i + 1}"></button>`).join('');
  const toon = i => {
    idx = (i + n) % n;
    track.style.transform = `translateX(-${idx * 100}%)`;
    $$('button', dots).forEach((d, j) => d.classList.toggle('is-active', j === idx));
  };
  const auto = () => { clearInterval(timer); timer = setInterval(() => toon(idx + 1), 7000); };
  $('#rev-prev').addEventListener('click', () => { toon(idx - 1); auto(); });
  $('#rev-next').addEventListener('click', () => { toon(idx + 1); auto(); });
  $$('button', dots).forEach((d, i) => d.addEventListener('click', () => { toon(i); auto(); }));
  let x0 = null;
  track.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) { toon(idx + (dx < 0 ? 1 : -1)); auto(); }
    x0 = null;
  });
  toon(0); auto();

  /* ================= Quiz ================= */
  const UITSLAG = {
    'zoet-ja': 'Pornstar Martini', 'zuur-ja': 'Basil Smash', 'bitter-ja': 'Negroni',
    'zoet-nee': 'Berry Nojito', 'zuur-nee': 'Virgin Garden', 'bitter-nee': 'Spiced Apple Sour'
  };
  const SFEER = {
    strand: 'Met je tenen in het zand,', lounge: 'Lekker weggezakt bij de jazz,', feest: 'Tussen twee dansjes door,'
  };
  $('#quiz-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    let naam = UITSLAG[`${f.get('q1')}-${f.get('q3')}`];
    if (f.get('q2') === 'lounge' && f.get('q3') === 'ja' && f.get('q1') !== 'zuur') naam = 'Smoked Old Fashioned';
    if (f.get('q2') === 'strand' && f.get('q3') === 'ja' && f.get('q1') === 'zoet') naam = 'Golden Hour';
    const c = COCKTAILS.find(x => x.naam === naam);
    const res = $('#quiz-result');
    res.innerHTML = `<p class="eyebrow">Jouw match</p><h3>${c.naam}</h3><p>${SFEER[f.get('q2')]} ${c.tekst.charAt(0).toLowerCase() + c.tekst.slice(1)}</p>`;
    res.hidden = false;
  });

  /* ================= Boekingsformulier ================= */
  // Opent een kant-en-klare mail. Later te vervangen door bijv. Formspree of Netlify Forms.
  const MAIL = 'info@beckontherocks.nl';
  const fDatum = $('#boek-form [name=datum]');
  fDatum.addEventListener('input', () => { $('#form-spoed').hidden = !isSpoed(fDatum.value); });
  $('#boek-form').addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    let ok = true;
    $$('[required]', form).forEach(el => {
      const geldig = el.checkValidity() && el.value.trim() !== '';
      el.classList.toggle('is-invalid', !geldig);
      if (!geldig) ok = false;
    });
    const note = $('#form-note');
    if (!ok) { note.textContent = 'Vul je naam, een geldig e-mailadres en de datum in.'; return; }
    const d = Object.fromEntries(new FormData(form));
    const body = [
      `Naam: ${d.naam}`, `E-mail: ${d.email}`, `Datum: ${d.datum}`, `Aantal uur: ${d.uren || '-'}`,
      `Gasten: ${d.gasten || '-'}`, `Soort feest: ${d.soort}`, isSpoed(d.datum) ? 'Spoedboeking (binnen 1 maand)' : '', '', d.bericht || ''
    ].join('\n');
    location.href = `mailto:${MAIL}?subject=${encodeURIComponent('Aanvraag ' + d.soort + ' op ' + d.datum)}&body=${encodeURIComponent(body)}`;
    note.textContent = 'Dank je! Je mailprogramma opent nu met je aanvraag.';
  });

  $('#jaar').textContent = new Date().getFullYear();
})();
