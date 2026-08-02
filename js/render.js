// ── DOM rendering ────────────────────────────────────────────
// Everything is generated from the active template: deck list (left),
// editor form (center), live preview (right).

import { state, getSelected, allTemplates } from './state.js';
import {
  typeColor, accentFor, selectOptions, cardMatchesShowIf, validateTemplate,
} from './schema.js';
import { escHtml } from './utils.js';
import { icon, iconForEmoji, hasIcon, ICON_NAMES } from './icons.js';

// ── Glyph resolution ─────────────────────────────────────────
// A glyph value can be: a custom SVG asset name → template asset,
// a lucide icon name → registry, an emoji → mapped icon, else fallback.
export function glyphHtml(t, value, opts = {}) {
  const v = String(value ?? '').trim();
  if (!v) return icon('square-asterisk', opts);
  if (t?.assets?.svg?.[v]) {
    return `<span class="cf-svg${opts.cls ? ' ' + opts.cls : ''}" aria-hidden="true">${t.assets.svg[v]}</span>`;
  }
  if (hasIcon(v)) return icon(v, opts);
  return iconForEmoji(v, opts);
}

// ── Deck list ────────────────────────────────────────────────
export function renderDeckList(s) {
  const list = document.getElementById('deckList');
  if (!list) return;
  const t = s.template;
  if (!t || !s.cards.length) {
    list.innerHTML = '<p class="deck-empty">No cards yet. Add one or import a deck.</p>';
    renderTally(s);
    return;
  }
  const { title, glyph, badge } = t.list;
  list.innerHTML = s.cards.map((c) => {
    const active = c._uid === s.selectedId ? ' is-active' : '';
    const badgeVal = badge ? c[badge] : '';
    const badgeColor = typeColor(t, c[t.typeField]);
    const zero = c.quantity === 0 && t.fields.some((f) => f.key === 'quantity')
      ? '<span class="deck-row__zero" title="quantity 0 — not in the live deck">0×</span>' : '';
    return `<li class="deck-row${active}" draggable="true" data-uid="${c._uid}" tabindex="0">
      <span class="deck-row__grip" aria-hidden="true">⋮⋮</span>
      <span class="deck-row__glyph">${glyph ? glyphHtml(t, c[glyph]) : glyphHtml(t, '')}</span>
      <span class="deck-row__name" title="${escHtml(c[title])}">${escHtml(c[title] || '(untitled)')}</span>
      ${zero}
      ${badgeVal ? `<span class="deck-row__badge" style="--badge:${badgeColor}">${escHtml(badgeVal)}</span>` : ''}
      <span class="deck-row__actions">
        <button type="button" class="deck-row__btn" data-act="dup" data-uid="${c._uid}" title="Duplicate" aria-label="Duplicate card">⧉</button>
        <button type="button" class="deck-row__btn deck-row__btn--del" data-act="del" data-uid="${c._uid}" title="Delete" aria-label="Delete card">✕</button>
      </span>
    </li>`;
  }).join('');
  renderTally(s);
}

function renderTally(s) {
  const el = document.getElementById('deckTally');
  if (!el) return;
  const t = s.template;
  const total = s.cards.length;
  const byType = {};
  for (const c of s.cards) {
    const ty = c[t?.typeField] || '—';
    byType[ty] = (byType[ty] || 0) + 1;
  }
  const chips = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([ty, n]) => `<span class="tally-chip" style="--badge:${typeColor(t, ty)}">${escHtml(ty)} ${n}</span>`)
    .join('');
  el.innerHTML = `<div class="tally-count">${total} card${total === 1 ? '' : 's'}</div><div class="tally-chips">${chips}</div>`;
}

// ── Form field widgets ───────────────────────────────────────
function textField(label, key, val, opts = {}) {
  const type = opts.number ? 'number' : 'text';
  const ph = opts.placeholder ? ` placeholder="${escHtml(opts.placeholder)}"` : '';
  return `<label class="fld">
    <span class="fld__label">${escHtml(label)}</span>
    <input class="fld__input" type="${type}" data-field="${key}" value="${escHtml(val)}"${ph}>
  </label>`;
}

function areaField(label, key, val, ph = '') {
  return `<label class="fld fld--wide">
    <span class="fld__label">${escHtml(label)}</span>
    <textarea class="fld__input fld__area" data-field="${key}" rows="3" placeholder="${escHtml(ph)}">${escHtml(val)}</textarea>
  </label>`;
}

function selectField(label, key, val, options) {
  const opts = options.map((o) =>
    `<option value="${escHtml(o)}"${o === val ? ' selected' : ''}>${escHtml(o || '(none)')}</option>`).join('');
  return `<label class="fld">
    <span class="fld__label">${escHtml(label)}</span>
    <select class="fld__input" data-field="${key}">${opts}</select>
  </label>`;
}

function datalistField(label, key, val, listId, ph = '') {
  return `<label class="fld">
    <span class="fld__label">${escHtml(label)}</span>
    <input class="fld__input" type="text" data-field="${key}" value="${escHtml(val)}" list="${listId}"${ph ? ` placeholder="${escHtml(ph)}"` : ''}>
  </label>`;
}

function pickerField(label, key, val, picks) {
  const btns = (picks || []).map((p) =>
    `<button type="button" class="emoji-pick" data-pick-field="${key}" data-pick="${escHtml(p)}" title="${escHtml(p)}">${escHtml(p)}</button>`).join('');
  return `<div class="fld">
    <span class="fld__label">${escHtml(label)}</span>
    <div class="emoji-row">
      <input class="fld__input fld__input--emoji" type="text" data-field="${key}" value="${escHtml(val)}" maxlength="24">
      <div class="emoji-picks">${btns}</div>
    </div>
  </div>`;
}

function iconField(t, label, key, val, picks) {
  const quick = (picks && picks.length ? picks : ['sprout', 'zap', 'shield', 'flame', 'star', 'users', 'target', 'rocket'])
    .concat(Object.keys(t.assets.svg));
  const btns = quick.map((p) =>
    `<button type="button" class="emoji-pick emoji-pick--icon" data-pick-field="${key}" data-pick="${escHtml(p)}" title="${escHtml(p)}">${glyphHtml(t, p)}</button>`).join('');
  return `<div class="fld">
    <span class="fld__label">${escHtml(label)}</span>
    <div class="emoji-row">
      <div class="icon-input-row">
        <input class="fld__input" type="text" data-field="${key}" value="${escHtml(val)}" placeholder="icon name, asset, or emoji">
        <button type="button" class="btn btn--ghost btn--sm" data-icon-browse="${key}" title="Browse all icons">${icon('search')}</button>
      </div>
      <div class="emoji-picks">${btns}</div>
      <div class="icon-browser" id="iconBrowser-${key}" hidden>
        <input class="fld__input" type="search" data-icon-search="${key}" placeholder="Search ${ICON_NAMES.length} icons…">
        <div class="icon-grid" id="iconGrid-${key}"></div>
      </div>
    </div>
  </div>`;
}

/** Fill an icon browser grid, filtered by query. Called from events.js. */
export function renderIconGrid(key, query) {
  const grid = document.getElementById(`iconGrid-${key}`);
  if (!grid) return;
  const q = (query || '').toLowerCase();
  const names = ICON_NAMES.filter((n) => !q || n.includes(q)).slice(0, 72);
  grid.innerHTML = names.map((n) =>
    `<button type="button" class="emoji-pick emoji-pick--icon" data-pick-field="${key}" data-pick="${n}" title="${n}">${icon(n)}</button>`).join('')
    || '<span class="fld-note">No matches.</span>';
}

function imageField(label, key, val) {
  return `<div class="fld fld--wide">
    <span class="fld__label">${escHtml(label)}</span>
    <div class="icon-input-row">
      <input class="fld__input" type="text" data-field="${key}" value="${escHtml(val)}" placeholder="https://…, data URI, or asset id">
      <label class="btn btn--ghost btn--sm cf-file" title="Upload an image (stored inline as a data URI)">
        ${icon('image')}<input type="file" data-img-for="${key}" accept="image/*" hidden>
      </label>
    </div>
  </div>`;
}

function colorField(label, key, val) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(String(val)) ? val : '#888888';
  return `<label class="fld">
    <span class="fld__label">${escHtml(label)}</span>
    <input class="fld__input fld__input--color" type="color" data-field="${key}" value="${safe}">
  </label>`;
}

function toggleField(label, key, val) {
  return `<label class="fld fld--toggle">
    <input type="checkbox" data-field="${key}" data-kind="toggle"${val ? ' checked' : ''}>
    <span class="fld__label">${escHtml(label)}</span>
  </label>`;
}

function widgetFor(t, f, card) {
  const label = f.label || f.key;
  const val = card[f.key] ?? '';
  switch (f.kind) {
    case 'textarea': return areaField(label, f.key, val, f.placeholder || '');
    case 'number': return textField(label, f.key, val, { number: true });
    case 'select': {
      const options = f.fromTypes ? t.types.map((ty) => ty.id) : selectOptions(t, f);
      if (f.allowCustom) {
        return datalistField(label, f.key, val, `dl-${f.key}`, f.placeholder || '');
      }
      return selectField(label, f.key, val, options);
    }
    case 'icon': return iconField(t, label, f.key, val, f.picks);
    case 'image': return imageField(label, f.key, val);
    case 'color': return colorField(label, f.key, val);
    case 'toggle': return toggleField(label, f.key, !!val);
    default: return f.picks ? pickerField(label, f.key, val, f.picks) : textField(label, f.key, val, { placeholder: f.placeholder || '' });
  }
}

// ── Editor form ──────────────────────────────────────────────
export function renderEditor(s) {
  const wrap = document.getElementById('editorForm');
  if (!wrap) return;
  const t = s.template;
  const card = getSelected(s);
  if (!t || !card) {
    wrap.innerHTML = '<p class="editor-empty">Select a card on the left, or add a new one to begin editing.</p>';
    renderDatalists(s);
    return;
  }

  // Group fields in declaration order, honoring showIf.
  const groups = new Map();
  for (const f of t.fields) {
    if (!cardMatchesShowIf(t, card, f.showIf)) continue;
    const g = f.group || 'General';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(f);
  }

  let warns = '';
  for (const f of t.fields) {
    if (f.required && !String(card[f.key] ?? '').trim()) {
      warns += `<p class="fld-warn">${escHtml(f.label || f.key)} is empty.</p>`;
    }
  }
  if (t.types.length && card[t.typeField] && !t.types.some((ty) => ty.id === card[t.typeField])) {
    warns += `<p class="fld-warn">Type "${escHtml(card[t.typeField])}" is not in this template's types.</p>`;
  }
  const tErrs = validateTemplate(t);
  const tWarn = tErrs.length
    ? `<p class="fld-warn" title="${escHtml(tErrs.join('\n'))}">Template has ${tErrs.length} schema issue${tErrs.length === 1 ? '' : 's'} — open the Template panel.</p>` : '';

  let html = `<div class="editor-actions">
      <button type="button" class="btn btn--secondary btn--sm" id="copyCardBtn">Copy card JSON</button>
      <button type="button" class="btn btn--ghost btn--sm" id="dupCardBtn">Duplicate</button>
      <button type="button" class="btn btn--danger btn--sm" id="delCardBtn">Delete</button>
    </div>${tWarn}`;

  for (const [name, fields] of groups) {
    const wide = fields.filter((f) => f.kind === 'textarea' || f.kind === 'image');
    const narrow = fields.filter((f) => !wide.includes(f));
    html += `<fieldset class="fgroup">
      <legend>${escHtml(name)}</legend>
      ${narrow.length ? `<div class="fgrid">${narrow.map((f) => widgetFor(t, f, card)).join('')}</div>` : ''}
      ${wide.length ? `<div class="fgrid fgrid--1">${wide.map((f) => widgetFor(t, f, card)).join('')}</div>` : ''}
    </fieldset>`;
  }
  wrap.innerHTML = html + warns;
  renderDatalists(s);
}

/** Regenerate <datalist> elements for allowCustom selects. */
function renderDatalists(s) {
  const host = document.getElementById('dynamicDatalists');
  if (!host || !s.template) return;
  const t = s.template;
  host.innerHTML = t.fields
    .filter((f) => f.kind === 'select' && f.allowCustom)
    .map((f) => {
      const options = f.fromTypes ? t.types.map((ty) => ty.id) : selectOptions(t, f);
      return `<datalist id="dl-${f.key}">${options.map((o) => `<option value="${escHtml(o)}"></option>`).join('')}</datalist>`;
    }).join('');
}

// ── Live preview ─────────────────────────────────────────────
function statPip(t, p, val) {
  return `<span class="pv-pip" title="${escHtml(p.label || p.field)}"><span class="pv-pip__ico">${glyphHtml(t, p.icon)}</span>${escHtml(val)}</span>`;
}

function isRenderableImage(v) {
  return /^(https?:\/\/|data:image\/)/i.test(String(v || '').trim());
}

function renderBlock(t, card, b) {
  if (!cardMatchesShowIf(t, card, b.showIf)) return '';
  switch (b.block) {
    case 'header': {
      const badge = b.badge && card[b.badge] ? `<span class="pv-cc">${escHtml(card[b.badge])}</span>` : '';
      const sub = b.subtitle && card[b.subtitle] ? `<div class="pv-sub">${escHtml(card[b.subtitle])}</div>` : '';
      return `<header class="pv-head">
        <span class="pv-glyph">${b.glyph ? glyphHtml(t, card[b.glyph]) : glyphHtml(t, '')}</span>
        <div class="pv-headtext">
          <h3 class="pv-name">${escHtml(card[b.title] || '(untitled)')}</h3>
          ${sub}
          ${b.tag ? `<span class="pv-type">${escHtml(card[b.tag] ?? '')}${badge}</span>` : ''}
        </div>
      </header>`;
    }
    case 'art': {
      const v = String(card[b.field] || '').trim();
      return isRenderableImage(v)
        ? `<img class="pv-img" src="${escHtml(v)}" alt="" onerror="this.classList.add('pv-img--err')">` : '';
    }
    case 'text': {
      const v = card[b.field];
      return `<p class="pv-skill">${escHtml(v) || '<em class="pv-dim">No text yet.</em>'}</p>`;
    }
    case 'badges': {
      const vals = (b.fields || []).map((k) => card[k]).filter(Boolean);
      return vals.length ? `<div class="pv-meta">${escHtml(vals.join(' · '))}</div>` : '';
    }
    case 'callout': {
      const v = String(card[b.field] || '').trim();
      if (!v) return '';
      return `<div class="pv-callout${b.tone === 'accent' ? ' pv-callout--accent' : ''}">
        ${b.icon ? `<span class="pv-callout__ico">${glyphHtml(t, b.icon)}</span>` : ''}
        <div>${b.label ? `<span class="pv-callout__label">${escHtml(b.label)}</span>` : ''}<p>${escHtml(v)}</p></div>
      </div>`;
    }
    case 'flavor': {
      const v = card[b.field];
      return v ? `<p class="pv-flavor">${escHtml(v)}</p>` : '';
    }
    case 'stats': {
      const pips = (b.pips || [])
        .filter((p) => !(p.hideIfZero && !card[p.field]))
        .map((p) => statPip(t, p, card[p.field] ?? 0)).join('');
      return pips ? `<div class="pv-stats"><div class="pv-pips">${pips}</div></div>` : '';
    }
    case 'footer': {
      const vals = (b.fields || []).map((k) => card[k]).filter((v) => v !== '' && v !== undefined && v !== null);
      return `<footer class="pv-foot"><span class="pv-deck">${escHtml(vals.join(' · '))}</span></footer>`;
    }
    case 'divider': return '<hr class="pv-div">';
    default: return '';
  }
}

export function renderPreview(s) {
  const wrap = document.getElementById('previewCard');
  if (!wrap) return;
  const t = s.template;
  const card = getSelected(s);
  if (!t || !card) { wrap.innerHTML = '<p class="editor-empty">No card selected.</p>'; return; }

  const color = accentFor(t, card);
  // Body blocks (text/badges/callout/flavor) share padding; structural
  // blocks (header/art/stats/footer) sit edge-to-edge.
  const bodyKinds = new Set(['text', 'badges', 'callout', 'flavor', 'divider']);
  let html = '';
  let bodyBuf = '';
  for (const b of t.layout) {
    const chunk = renderBlock(t, card, b);
    if (!chunk) continue;
    if (bodyKinds.has(b.block)) { bodyBuf += chunk; continue; }
    if (bodyBuf) { html += `<div class="pv-body">${bodyBuf}</div>`; bodyBuf = ''; }
    html += chunk;
  }
  if (bodyBuf) html += `<div class="pv-body">${bodyBuf}</div>`;

  const maxW = Number(t.style.maxWidth) || 320;
  wrap.innerHTML = `<article class="pv" style="--accent:${color}; --pv-max-width:${maxW}px; font-family:${s.previewFont};">${html}</article>`;
}

// ── Template selector (toolbar) ──────────────────────────────
export function renderTemplateBar(s) {
  const sel = document.getElementById('templateSelect');
  if (!sel) return;
  sel.innerHTML = allTemplates(s).map((t) => {
    const mark = s.customTemplates.some((c) => c.id === t.id) ? ' •' : '';
    return `<option value="${escHtml(t.id)}"${t.id === s.template?.id ? ' selected' : ''}>${escHtml(t.name)}${mark}</option>`;
  }).join('');
}

// ── Master render ────────────────────────────────────────────
export function render(s) {
  renderTemplateBar(s);
  renderDeckList(s);
  renderEditor(s);
  renderPreview(s);
  syncFont(s);
}

function syncFont(s) {
  const sel = document.getElementById('fontSelect');
  if (sel && sel.value !== s.previewFont) sel.value = s.previewFont;
}
