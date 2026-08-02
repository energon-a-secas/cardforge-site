// ── Template panel ───────────────────────────────────────────
// Structured editor for the active template: meta, types, enums, fields,
// layout blocks, and custom SVG assets. Editing a built-in template forks
// it into a same-id custom copy (restorable via Reset).

import {
  state, save, normalizeCards, stripUid,
  ensureEditable, removeOverride, isBuiltinId, isOverridden, activateTemplate,
} from './state.js';
import {
  normalizeTemplate, makeBlankTemplate, sanitizeSvg, validateTemplate,
  FIELD_KINDS, BLOCK_KINDS,
} from './schema.js';
import { render } from './render.js';
import { escHtml, showToast, download, copyText } from './utils.js';
import { icon } from './icons.js';

// ── Panel shell ──────────────────────────────────────────────
export function openTemplatePanel(s) {
  const panel = document.getElementById('templatePanel');
  if (!panel) return;
  panel.hidden = false;
  renderPanel(s);
}

function closePanel() {
  const panel = document.getElementById('templatePanel');
  if (panel) panel.hidden = true;
}

// ── Rendering ────────────────────────────────────────────────
function opt(v, cur, label) {
  return `<option value="${escHtml(v)}"${v === cur ? ' selected' : ''}>${escHtml(label ?? (v || '(none)'))}</option>`;
}

function fieldKeySelect(t, prop, cur, extra = '') {
  const opts = ['', ...t.fields.map((f) => f.key)].map((k) => opt(k, cur || ''));
  return `<select class="fld__input tp-mini" ${extra} data-prop="${prop}">${opts.join('')}</select>`;
}

function renderTypes(t) {
  const rows = t.types.map((ty, i) => `<div class="tp-row" data-idx="${i}">
    <input type="color" class="tp-color" data-tsec="type" data-idx="${i}" data-prop="color" value="${/^#[0-9a-fA-F]{6}$/.test(ty.color || '') ? ty.color : '#8896b3'}" title="Accent color">
    <input class="fld__input tp-mini" data-tsec="type" data-idx="${i}" data-prop="id" value="${escHtml(ty.id)}" placeholder="id">
    <input class="fld__input tp-mini" data-tsec="type" data-idx="${i}" data-prop="label" value="${escHtml(ty.label || '')}" placeholder="label">
    <button type="button" class="deck-row__btn deck-row__btn--del" data-act="del-type" data-idx="${i}" title="Remove type">✕</button>
  </div>`).join('');
  return `${rows}<button type="button" class="btn btn--ghost btn--sm" data-act="add-type">${icon('plus')} Add type</button>`;
}

function renderEnums(t) {
  const blocks = Object.entries(t.enums).map(([name, values]) => `<div class="tp-enum">
    <div class="tp-row">
      <strong class="tp-enum__name">${escHtml(name)}</strong>
      <button type="button" class="deck-row__btn deck-row__btn--del" data-act="del-enum" data-enum="${escHtml(name)}" title="Remove enum">✕</button>
    </div>
    <textarea class="fld__input fld__area" rows="3" data-tsec="enumlist" data-enum="${escHtml(name)}" placeholder="One value per line">${escHtml((values || []).join('\n'))}</textarea>
  </div>`).join('');
  return `${blocks}<div class="tp-row">
    <input class="fld__input tp-mini" id="newEnumName" placeholder="new enum name">
    <button type="button" class="btn btn--ghost btn--sm" data-act="add-enum">${icon('plus')} Add enum</button>
  </div>`;
}

function renderFieldRow(t, f, i) {
  const kinds = FIELD_KINDS.map((k) => opt(k, f.kind || 'text', k)).join('');
  const enumOpts = ['', ...Object.keys(t.enums)].map((k) => opt(k, f.enum || '')).join('');
  const typeIn = (f.showIf?.typeIn || []).join(', ');
  return `<div class="tp-row tp-row--field" draggable="true" data-ridx="${i}">
    <span class="deck-row__grip" aria-hidden="true">⋮⋮</span>
    <input class="fld__input tp-mini" data-tsec="field" data-idx="${i}" data-prop="key" value="${escHtml(f.key)}" placeholder="key" title="Field key (renames propagate to layout + cards)">
    <select class="fld__input tp-mini tp-kind" data-tsec="field" data-idx="${i}" data-prop="kind">${kinds}</select>
    <input class="fld__input tp-mini" data-tsec="field" data-idx="${i}" data-prop="group" value="${escHtml(f.group || '')}" placeholder="group">
    <button type="button" class="deck-row__btn" data-act="toggle-field" data-idx="${i}" title="Details">${icon('chevron-down')}</button>
    <button type="button" class="deck-row__btn deck-row__btn--del" data-act="del-field" data-idx="${i}" title="Remove field">✕</button>
    <div class="tp-details" data-details="${i}" hidden>
      <input class="fld__input tp-mini" data-tsec="field" data-idx="${i}" data-prop="label" value="${escHtml(f.label || '')}" placeholder="label">
      <input class="fld__input tp-mini" data-tsec="field" data-idx="${i}" data-prop="default" value="${escHtml(f.default ?? '')}" placeholder="default">
      <input class="fld__input tp-mini" data-tsec="field" data-idx="${i}" data-prop="placeholder" value="${escHtml(f.placeholder || '')}" placeholder="placeholder">
      ${f.kind === 'select' ? `<select class="fld__input tp-mini" data-tsec="field" data-idx="${i}" data-prop="enum" title="Enum source">${enumOpts}</select>
      <label class="tp-check"><input type="checkbox" data-tsec="field" data-idx="${i}" data-prop="fromTypes"${f.fromTypes ? ' checked' : ''}> from types</label>
      <label class="tp-check"><input type="checkbox" data-tsec="field" data-idx="${i}" data-prop="allowCustom"${f.allowCustom ? ' checked' : ''}> free text</label>` : ''}
      ${f.kind === 'icon' || f.kind === 'text' ? `<input class="fld__input tp-mini" data-tsec="field" data-idx="${i}" data-prop="picks" value="${escHtml((f.picks || []).join(', '))}" placeholder="quick picks (comma)">` : ''}
      <input class="fld__input tp-mini" data-tsec="field" data-idx="${i}" data-prop="typeIn" value="${escHtml(typeIn)}" placeholder="show only for types (comma)">
      <label class="tp-check"><input type="checkbox" data-tsec="field" data-idx="${i}" data-prop="required"${f.required ? ' checked' : ''}> required</label>
      <label class="tp-check" title="Omit from export when at default and absent from the source card"><input type="checkbox" data-tsec="field" data-idx="${i}" data-prop="optional"${f.optional ? ' checked' : ''}> optional key</label>
    </div>
  </div>`;
}

function renderLayoutRow(t, b, i) {
  const kinds = BLOCK_KINDS.map((k) => opt(k, b.block, k)).join('');
  let cfg = '';
  if (b.block === 'header') {
    cfg = `title ${fieldKeySelect(t, 'title', b.title, `data-tsec="layout" data-idx="${i}"`)}
      sub ${fieldKeySelect(t, 'subtitle', b.subtitle, `data-tsec="layout" data-idx="${i}"`)}
      tag ${fieldKeySelect(t, 'tag', b.tag, `data-tsec="layout" data-idx="${i}"`)}
      glyph ${fieldKeySelect(t, 'glyph', b.glyph, `data-tsec="layout" data-idx="${i}"`)}
      badge ${fieldKeySelect(t, 'badge', b.badge, `data-tsec="layout" data-idx="${i}"`)}`;
  } else if (['art', 'text', 'flavor', 'callout'].includes(b.block)) {
    cfg = `field ${fieldKeySelect(t, 'field', b.field, `data-tsec="layout" data-idx="${i}"`)}`;
    if (b.block === 'callout') {
      cfg += `<input class="fld__input tp-mini" data-tsec="layout" data-idx="${i}" data-prop="label" value="${escHtml(b.label || '')}" placeholder="label">
        <input class="fld__input tp-mini" data-tsec="layout" data-idx="${i}" data-prop="icon" value="${escHtml(b.icon || '')}" placeholder="icon">
        <label class="tp-check"><input type="checkbox" data-tsec="layout" data-idx="${i}" data-prop="accentTone"${b.tone === 'accent' ? ' checked' : ''}> accent</label>`;
    }
  } else if (b.block === 'badges' || b.block === 'footer') {
    cfg = `<input class="fld__input tp-mini tp-wide" data-tsec="layout" data-idx="${i}" data-prop="fieldsList" value="${escHtml((b.fields || []).join(', '))}" placeholder="field keys (comma)">`;
  } else if (b.block === 'stats') {
    const pips = (b.pips || []).map((p, pi) => `<div class="tp-row tp-row--pip">
      ${fieldKeySelect(t, 'field', p.field, `data-tsec="pip" data-bidx="${i}" data-idx="${pi}"`)}
      <input class="fld__input tp-mini" data-tsec="pip" data-bidx="${i}" data-idx="${pi}" data-prop="icon" value="${escHtml(p.icon || '')}" placeholder="icon">
      <input class="fld__input tp-mini" data-tsec="pip" data-bidx="${i}" data-idx="${pi}" data-prop="label" value="${escHtml(p.label || '')}" placeholder="label">
      <label class="tp-check"><input type="checkbox" data-tsec="pip" data-bidx="${i}" data-idx="${pi}" data-prop="hideIfZero"${p.hideIfZero ? ' checked' : ''}> hide 0</label>
      <button type="button" class="deck-row__btn deck-row__btn--del" data-act="del-pip" data-bidx="${i}" data-idx="${pi}">✕</button>
    </div>`).join('');
    cfg = `${pips}<button type="button" class="btn btn--ghost btn--sm" data-act="add-pip" data-idx="${i}">${icon('plus')} Add stat</button>`;
  }
  const typeIn = (b.showIf?.typeIn || []).join(', ');
  return `<div class="tp-row tp-row--layout" draggable="true" data-ridx="${i}">
    <span class="deck-row__grip" aria-hidden="true">⋮⋮</span>
    <select class="fld__input tp-mini tp-kind" data-tsec="layout" data-idx="${i}" data-prop="block">${kinds}</select>
    <div class="tp-blockcfg">${cfg}
      <input class="fld__input tp-mini" data-tsec="layout" data-idx="${i}" data-prop="typeIn" value="${escHtml(typeIn)}" placeholder="only for types (comma)">
    </div>
    <button type="button" class="deck-row__btn deck-row__btn--del" data-act="del-block" data-idx="${i}" title="Remove block">✕</button>
  </div>`;
}

function renderAssets(t) {
  const thumbs = Object.entries(t.assets.svg).map(([name, svg]) => `<div class="tp-asset">
    <span class="cf-svg tp-asset__thumb">${svg}</span>
    <span class="tp-asset__name">${escHtml(name)}</span>
    <button type="button" class="deck-row__btn deck-row__btn--del" data-act="del-asset" data-name="${escHtml(name)}" title="Remove SVG">✕</button>
  </div>`).join('');
  return `<div class="tp-assets">${thumbs || '<span class="fld-note">No custom SVGs yet. Paste markup or upload a .svg — use its name in any icon field or layout block.</span>'}</div>
  <div class="tp-row"><input class="fld__input tp-mini" id="newAssetName" placeholder="asset name"></div>
  <textarea class="fld__input fld__area" id="newAssetSvg" rows="3" placeholder="&lt;svg …&gt;…&lt;/svg&gt; (scripts are stripped)"></textarea>
  <div class="tp-row">
    <button type="button" class="btn btn--secondary btn--sm" data-act="add-asset">${icon('plus')} Add SVG</button>
    <label class="btn btn--ghost btn--sm cf-file">${icon('image')} Upload .svg<input type="file" id="assetFileInput" accept="image/svg+xml,.svg" hidden></label>
  </div>`;
}

export function renderPanel(s) {
  const panel = document.getElementById('templatePanel');
  if (!panel || panel.hidden) return;
  const t = s.template;
  if (!t) { panel.innerHTML = ''; return; }
  const errs = validateTemplate(t);
  const builtin = isBuiltinId(s, t.id);
  const overridden = isOverridden(s, t.id);
  panel.innerHTML = `<div class="tp-head">
    <h2>${icon('layout-template')} Template — ${escHtml(t.name)}</h2>
    <button type="button" class="deck-row__btn" data-act="close" title="Close">✕</button>
  </div>
  <div class="tp-actions">
    <button type="button" class="btn btn--ghost btn--sm" data-act="dup-template">${icon('copy')} Duplicate</button>
    <button type="button" class="btn btn--ghost btn--sm" data-act="new-template">${icon('plus')} New blank</button>
    <button type="button" class="btn btn--ghost btn--sm" data-act="export-template">${icon('download')} Export</button>
    <button type="button" class="btn btn--ghost btn--sm" data-act="copy-template">${icon('file-json')} Copy JSON</button>
    <label class="btn btn--ghost btn--sm cf-file">Import<input type="file" id="templateFileInput" accept="application/json,.json" hidden></label>
    ${builtin && overridden ? `<button type="button" class="btn btn--ghost btn--sm" data-act="reset-template">${icon('refresh-ccw')} Reset to built-in</button>` : ''}
    ${!builtin ? `<button type="button" class="btn btn--danger btn--sm" data-act="del-template">${icon('trash-2')} Delete</button>` : ''}
  </div>
  ${builtin && !overridden ? '<p class="fld-note">This is a built-in template — your first edit forks a same-name copy you can reset later.</p>' : ''}
  ${errs.length ? `<p class="fld-warn">${errs.map(escHtml).join('<br>')}</p>` : ''}
  <details open><summary>Meta</summary>
    <div class="tp-body">
      <input class="fld__input" data-tmeta="name" value="${escHtml(t.name)}" placeholder="Template name">
      <textarea class="fld__input fld__area" rows="2" data-tmeta="description" placeholder="What game / card family is this?">${escHtml(t.description)}</textarea>
      <span class="fld-note">id: <code>${escHtml(t.id)}</code> · accent from <code>${escHtml(t.style.accentFrom)}</code> · card width <input class="fld__input tp-mini tp-num" type="number" data-tsec="style" data-prop="maxWidth" value="${t.style.maxWidth}">px</span>
    </div>
  </details>
  <details open><summary>Types (${t.types.length})</summary><div class="tp-body">${renderTypes(t)}</div></details>
  <details><summary>Enums (${Object.keys(t.enums).length})</summary><div class="tp-body">${renderEnums(t)}</div></details>
  <details open><summary>Fields (${t.fields.length})</summary>
    <div class="tp-body" data-reorder="fields">${t.fields.map((f, i) => renderFieldRow(t, f, i)).join('')}</div>
    <div class="tp-body"><button type="button" class="btn btn--ghost btn--sm" data-act="add-field">${icon('plus')} Add field</button></div>
  </details>
  <details open><summary>Layout (${t.layout.length} blocks)</summary>
    <div class="tp-body" data-reorder="layout">${t.layout.map((b, i) => renderLayoutRow(t, b, i)).join('')}</div>
    <div class="tp-body"><button type="button" class="btn btn--ghost btn--sm" data-act="add-block">${icon('plus')} Add block</button></div>
  </details>
  <details><summary>Custom SVGs (${Object.keys(t.assets.svg).length})</summary><div class="tp-body">${renderAssets(t)}</div></details>`;
}

// ── Mutation helpers ─────────────────────────────────────────
function edit(s) {
  return ensureEditable(s);
}

function commit(s, { panel = false } = {}) {
  save(s);
  render(s);
  if (panel) renderPanel(s);
}

function renameFieldKey(s, t, oldKey, newKey) {
  if (!newKey || oldKey === newKey) return;
  for (const b of t.layout) {
    for (const p of ['title', 'subtitle', 'tag', 'glyph', 'badge', 'field']) {
      if (b[p] === oldKey) b[p] = newKey;
    }
    if (Array.isArray(b.fields)) b.fields = b.fields.map((k) => (k === oldKey ? newKey : k));
    if (Array.isArray(b.pips)) for (const p of b.pips) if (p.field === oldKey) p.field = newKey;
  }
  for (const p of ['title', 'glyph', 'badge']) if (t.list[p] === oldKey) t.list[p] = newKey;
  if (t.typeField === oldKey) t.typeField = newKey;
  if (t.style.accentFrom === oldKey) t.style.accentFrom = newKey;
  for (const c of s.cards) {
    if (Object.prototype.hasOwnProperty.call(c, oldKey)) {
      c[newKey] = c[oldKey];
      delete c[oldKey];
    }
  }
}

function parseList(v) {
  return String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
}

// ── Change routing ───────────────────────────────────────────
function onPanelChange(e, s) {
  const el = e.target;
  if (el.id === 'newEnumName' || el.id === 'newAssetName' || el.id === 'newAssetSvg') return;
  if (el.id === 'templateFileInput' || el.id === 'assetFileInput') return;
  const t = edit(s);
  if (!t) return;

  if (el.dataset.tmeta) {
    t[el.dataset.tmeta] = el.value;
    commit(s);
    return;
  }
  const { tsec, prop } = el.dataset;
  if (!tsec || !prop) return;
  const idx = Number(el.dataset.idx);

  if (tsec === 'style') {
    t.style[prop] = prop === 'maxWidth' ? Math.max(200, Number(el.value) || 320) : el.value;
    commit(s);
  } else if (tsec === 'type') {
    const ty = t.types[idx];
    if (!ty) return;
    ty[prop] = el.value;
    if (prop === 'id' && !ty.label) ty.label = el.value;
    commit(s, { panel: true });
  } else if (tsec === 'enumlist') {
    t.enums[el.dataset.enum] = el.value.split('\n').map((x) => x.trim()).filter(Boolean);
    commit(s);
  } else if (tsec === 'field') {
    const f = t.fields[idx];
    if (!f) return;
    if (prop === 'key') {
      renameFieldKey(s, t, f.key, el.value.trim());
      f.key = el.value.trim() || f.key;
      commit(s, { panel: true });
    } else if (prop === 'typeIn') {
      const list = parseList(el.value);
      if (list.length) f.showIf = { ...(f.showIf || {}), typeIn: list };
      else if (f.showIf) { delete f.showIf.typeIn; if (!Object.keys(f.showIf).length) delete f.showIf; }
      commit(s);
    } else if (prop === 'picks') {
      const list = parseList(el.value);
      if (list.length) f.picks = list; else delete f.picks;
      commit(s);
    } else if (['required', 'optional', 'allowCustom', 'fromTypes'].includes(prop)) {
      if (el.checked) f[prop] = true; else delete f[prop];
      commit(s, { panel: prop === 'allowCustom' || prop === 'fromTypes' });
    } else if (prop === 'kind') {
      f.kind = el.value;
      commit(s, { panel: true });
    } else {
      if (el.value === '') delete f[prop]; else f[prop] = el.value;
      commit(s);
    }
  } else if (tsec === 'layout') {
    const b = t.layout[idx];
    if (!b) return;
    if (prop === 'block') {
      t.layout[idx] = { block: el.value };
      commit(s, { panel: true });
    } else if (prop === 'fieldsList') {
      b.fields = parseList(el.value);
      commit(s);
    } else if (prop === 'typeIn') {
      const list = parseList(el.value);
      if (list.length) b.showIf = { typeIn: list }; else delete b.showIf;
      commit(s);
    } else if (prop === 'accentTone') {
      if (el.checked) b.tone = 'accent'; else delete b.tone;
      commit(s);
    } else {
      if (el.value === '') delete b[prop]; else b[prop] = el.value;
      commit(s);
    }
  } else if (tsec === 'pip') {
    const b = t.layout[Number(el.dataset.bidx)];
    const p = b?.pips?.[idx];
    if (!p) return;
    if (prop === 'hideIfZero') {
      if (el.checked) p.hideIfZero = true; else delete p.hideIfZero;
    } else if (el.value === '') delete p[prop];
    else p[prop] = el.value;
    commit(s);
  }
}

// ── Click routing ────────────────────────────────────────────
function onPanelClick(e, s) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'close') { closePanel(); return; }

  // Template-level actions that must not fork first.
  if (act === 'export-template') {
    download(`${s.template.id}.template.json`, JSON.stringify(s.template, null, 2));
    showToast('Template exported');
    return;
  }
  if (act === 'copy-template') {
    copyText(JSON.stringify(s.template, null, 2)).then((ok) =>
      showToast(ok ? 'Template JSON copied — feed it to any tool or LLM' : 'Copy failed'));
    return;
  }
  if (act === 'dup-template') {
    const copy = normalizeTemplate(JSON.parse(JSON.stringify(s.template)));
    copy.id = `${copy.id}-copy`;
    copy.name = `${copy.name} (copy)`;
    s.customTemplates.push(copy);
    switchTo(s, copy.id);
    return;
  }
  if (act === 'new-template') {
    let id = 'my-game';
    let n = 2;
    while (s.builtins.some((t) => t.id === id) || s.customTemplates.some((t) => t.id === id)) id = `my-game-${n++}`;
    s.customTemplates.push(makeBlankTemplate(id));
    switchTo(s, id);
    return;
  }
  if (act === 'reset-template') {
    const id = s.template.id;
    s.decks[id] = s.cards.map(stripUid); // keep the deck across the reset
    removeOverride(s, id);               // s.template becomes the built-in again
    s.cards = normalizeCards(s, s.decks[id]);
    s.selectedId = s.cards[0]?._uid ?? null;
    commit(s, { panel: true });
    showToast('Restored the built-in template');
    return;
  }
  if (act === 'del-template') {
    const id = s.template.id;
    s.customTemplates = s.customTemplates.filter((t) => t.id !== id);
    s.template = null; // drop without stashing the deleted template's deck
    delete s.decks[id];
    switchTo(s, s.builtins[0]?.id || s.customTemplates[0]?.id);
    showToast('Template deleted');
    return;
  }

  const t = edit(s);
  if (!t) return;
  const idx = Number(btn.dataset.idx);

  if (act === 'add-type') {
    t.types.push({ id: `Type${t.types.length + 1}`, label: `Type${t.types.length + 1}`, color: '#38bdf8' });
  } else if (act === 'del-type') {
    t.types.splice(idx, 1);
  } else if (act === 'add-enum') {
    const name = document.getElementById('newEnumName')?.value.trim();
    if (!name) { showToast('Give the enum a name first'); return; }
    t.enums[name] = t.enums[name] || [];
  } else if (act === 'del-enum') {
    delete t.enums[btn.dataset.enum];
  } else if (act === 'add-field') {
    let key = 'newField';
    let n = 2;
    while (t.fields.some((f) => f.key === key)) key = `newField${n++}`;
    t.fields.push({ key, label: key, kind: 'text', group: 'General' });
  } else if (act === 'del-field') {
    t.fields.splice(idx, 1);
  } else if (act === 'toggle-field') {
    const d = document.querySelector(`#templatePanel [data-details="${idx}"]`);
    if (d) d.hidden = !d.hidden;
    return;
  } else if (act === 'add-block') {
    t.layout.push({ block: 'text', field: t.fields[0]?.key || '' });
  } else if (act === 'del-block') {
    t.layout.splice(idx, 1);
  } else if (act === 'add-pip') {
    const b = t.layout[idx];
    if (!b) return;
    b.pips = b.pips || [];
    b.pips.push({ field: t.fields.find((f) => f.kind === 'number')?.key || t.fields[0]?.key || '', icon: 'hash' });
  } else if (act === 'del-pip') {
    const b = t.layout[Number(btn.dataset.bidx)];
    b?.pips?.splice(idx, 1);
  } else if (act === 'add-asset') {
    const name = document.getElementById('newAssetName')?.value.trim();
    const svg = sanitizeSvg(document.getElementById('newAssetSvg')?.value);
    if (!name) { showToast('Give the SVG a name first'); return; }
    if (!svg) { showToast('That is not valid SVG markup'); return; }
    t.assets.svg[name] = svg;
    showToast(`SVG "${name}" added — use it in icon fields and layout blocks`);
  } else if (act === 'del-asset') {
    delete t.assets.svg[btn.dataset.name];
  } else {
    return;
  }
  commit(s, { panel: true });
}

function switchTo(s, id) {
  if (!id) return;
  activateTemplate(s, id);
  save(s);
  render(s);
  renderPanel(s);
}

// ── File imports ─────────────────────────────────────────────
function onPanelFile(e, s) {
  const input = e.target;
  if (input.id === 'templateFileInput') {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const raw = data.template || data; // accept bundle or bare template
        if (!raw.fields && !raw.layout) throw new Error('not a template');
        installTemplate(raw, Array.isArray(data.cards) ? data.cards : null, data._meta || null);
      } catch {
        showToast('Import failed — not a valid template JSON');
      }
    };
    reader.readAsText(file);
    input.value = '';
  } else if (input.id === 'assetFileInput') {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const svg = sanitizeSvg(String(reader.result));
      if (!svg) { showToast('That file is not valid SVG'); return; }
      const t = edit(s);
      const name = file.name.replace(/\.svg$/i, '').replace(/[^\w-]+/g, '-');
      t.assets.svg[name] = svg;
      commit(s, { panel: true });
      showToast(`SVG "${name}" added`);
    };
    reader.readAsText(file);
    input.value = '';
  }
}

/** Install (or replace) a template; optionally load cards into it. */
export function installTemplate(rawTemplate, cards = null, meta = null) {
  const t = normalizeTemplate(rawTemplate);
  state.customTemplates = state.customTemplates.filter((x) => x.id !== t.id);
  state.customTemplates.push(t);
  if (state.template) state.decks[state.template.id] = state.cards.map(stripUid);
  state.template = t;
  state.cards = cards ? [] : normalizeCards(state, state.decks[t.id] || []);
  if (cards) {
    state.cards = normalizeCards(state, cards);
    if (meta) state.meta = meta;
  }
  state.selectedId = state.cards[0]?._uid ?? null;
  save(state);
  render(state);
  renderPanel(state);
  showToast(`Template "${t.name}" installed`);
}

// ── Drag reorder (fields / layout rows) ──────────────────────
let dragInfo = null;

function onPanelDrag(e, s) {
  const type = e.type;
  const row = e.target.closest?.('[data-ridx]');
  const zone = e.target.closest?.('[data-reorder]');
  if (type === 'dragstart') {
    if (!row || !zone) return;
    dragInfo = { list: zone.dataset.reorder, from: Number(row.dataset.ridx) };
    row.classList.add('is-dragging');
  } else if (type === 'dragover') {
    if (!row || !zone || !dragInfo || zone.dataset.reorder !== dragInfo.list) return;
    e.preventDefault();
    zone.querySelectorAll('.is-over').forEach((r) => r.classList.remove('is-over'));
    row.classList.add('is-over');
  } else if (type === 'drop') {
    if (!row || !zone || !dragInfo || zone.dataset.reorder !== dragInfo.list) return;
    e.preventDefault();
    const to = Number(row.dataset.ridx);
    const t = edit(s);
    const arr = dragInfo.list === 'fields' ? t.fields : t.layout;
    if (dragInfo.from !== to && arr[dragInfo.from]) {
      const [moved] = arr.splice(dragInfo.from, 1);
      arr.splice(to, 0, moved);
      commit(s, { panel: true });
    }
    dragInfo = null;
  } else if (type === 'dragend') {
    document.querySelectorAll('#templatePanel .is-dragging, #templatePanel .is-over')
      .forEach((r) => r.classList.remove('is-dragging', 'is-over'));
    dragInfo = null;
  }
}

// ── Bind ─────────────────────────────────────────────────────
export function bindTemplatePanel(s) {
  const panel = document.getElementById('templatePanel');
  if (!panel) return;
  panel.addEventListener('click', (e) => onPanelClick(e, s));
  panel.addEventListener('change', (e) => { onPanelFile(e, s); onPanelChange(e, s); });
  panel.addEventListener('dragstart', (e) => onPanelDrag(e, s));
  panel.addEventListener('dragover', (e) => onPanelDrag(e, s));
  panel.addEventListener('drop', (e) => onPanelDrag(e, s));
  panel.addEventListener('dragend', (e) => onPanelDrag(e, s));
}
