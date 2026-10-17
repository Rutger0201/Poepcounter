// Jarvis voor DeMIX: kleine hulpfuncties voor de browser
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// h('div', { class: 'x', onclick: fn }, 'tekst', kind, ...)
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privémodus */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* privémodus */ } }
};

let toastT = null;
export function toast(tekst) {
  const t = $('#toast'); if (!t) return;
  t.textContent = tekst; t.hidden = false; t.classList.add('aan');
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.classList.remove('aan'); setTimeout(() => { t.hidden = true; }, 250); }, 3800);
}
export function showErr(sel, tekst) { const e = $(sel); if (!e) return; e.textContent = tekst || ''; e.hidden = !tekst; }

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Heel kleine markdown: **vet**, *schuin*, `code`, lijstjes, kopjes en alinea's. Eerst escapen, dan opmaken.
export function md(tekst) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const uit = []; let lijst = null;
  const sluit = () => { if (lijst) { uit.push(`</${lijst}>`); lijst = null; } };
  for (const r of String(tekst || '').split('\n')) {
    const ul = r.match(/^\s*[-*•]\s+(.*)/), ol = r.match(/^\s*\d+[.)]\s+(.*)/), kop = r.match(/^#{1,4}\s+(.*)/);
    if (ul || ol) {
      const soort = ul ? 'ul' : 'ol';
      if (lijst !== soort) { sluit(); uit.push(`<${soort}>`); lijst = soort; }
      uit.push(`<li>${inline((ul || ol)[1])}</li>`);
    } else if (kop) { sluit(); uit.push(`<p class="md-kop">${inline(kop[1])}</p>`); }
    else if (!r.trim()) sluit();
    else { sluit(); uit.push(`<p>${inline(r)}</p>`); }
  }
  sluit();
  return uit.join('');
}

export const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
export const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const MAANDEN_L = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
export const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
export const fmtDate = s => { const d = parseISO(s); return `${DAGEN[d.getDay()].slice(0, 2)} ${d.getDate()} ${MAANDEN[d.getMonth()]}`; };
export const nl = (n, dec = 1) => Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: dec });
export const tijd = s => { const d = new Date(s); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function isoWeek(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - dag);
  const jan1 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - jan1) / 86400000 + 1) / 7);
}
export function ago(s) {
  const sec = Math.round((Date.now() - new Date(s).getTime()) / 1000);
  if (sec < 60) return 'net';
  if (sec < 3600) return `${Math.floor(sec / 60)} min geleden`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} uur geleden`;
  const d = Math.floor(sec / 86400);
  return d === 1 ? 'gisteren' : d < 7 ? `${d} dagen geleden` : fmtDate(iso(new Date(s)));
}
