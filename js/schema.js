// ── Template model ───────────────────────────────────────────
// A template ("pattern matrix") is a JSON document describing a card
// family: its types, enums, editable fields, preview layout, and custom
// SVG assets. Everything the editor, preview, and export do is driven by
// this document, so a template + its cards is fully self-describing —
// interpretable by another tool or an LLM without reading this app.
// Pure functions only — no DOM, no app state.

export const TEMPLATE_VERSION = 1;

export const FIELD_KINDS = ['text', 'textarea', 'number', 'select', 'icon', 'image', 'color', 'toggle'];
export const BLOCK_KINDS = ['header', 'art', 'typeline', 'text', 'stats', 'badges', 'callout', 'flavor', 'footer', 'divider'];

// Physical card shapes — CSS aspect-ratio values ('auto' = content height).
export const ASPECTS = {
  auto: null,
  poker: '63.5 / 88.9',      // standard TCG / poker card
  tarot: '70 / 120',
  square: '1 / 1',
  landscape: '88.9 / 63.5',
};
export const FRAMES = ['classic', 'full-art', 'minimal'];
export const TITLE_STYLES = ['plate', 'bar', 'underline'];
export const TEXTURES = ['linen', 'hatch', 'dots', 'grid', 'rays', 'none'];
export const GLYPH_ALIGNS = ['left', 'center'];

const DEFAULT_STYLE = {
  accentFrom: 'type',
  maxWidth: 320,
  aspect: 'auto',        // key of ASPECTS
  frame: 'classic',      // card frame construction
  titleStyle: 'plate',
  texture: 'linen',
  glyphAlign: 'left',    // seal position in the title plate
  borderWidth: 10,       // outer ink border (px)
  cornerRadius: 14,
  artRatio: 0.38,        // art window share of card height (fixed aspects)
};
const DEFAULT_ACCENT = '#8896b3';

/** Fill structural defaults so the rest of the app can trust the shape. */
export function normalizeTemplate(raw) {
  const t = { templateVersion: TEMPLATE_VERSION, ...(raw || {}) };
  t.id = String(t.id || 'untitled');
  t.name = t.name || t.id;
  t.description = t.description || '';
  t.typeField = t.typeField || 'type';
  t.types = Array.isArray(t.types) ? t.types : [];
  t.enums = t.enums && typeof t.enums === 'object' ? t.enums : {};
  t.fields = Array.isArray(t.fields) ? t.fields : [];
  t.layout = Array.isArray(t.layout) ? t.layout : [];
  t.assets = t.assets && typeof t.assets === 'object' ? t.assets : {};
  t.assets.svg = t.assets.svg && typeof t.assets.svg === 'object' ? t.assets.svg : {};
  t.list = { title: 'name', glyph: '', badge: t.typeField, ...(t.list || {}) };
  t.style = { ...DEFAULT_STYLE, ...(t.style || {}) };
  return t;
}

/** Light validation — returns an array of human-readable problems. */
export function validateTemplate(t) {
  const errs = [];
  if (!t.id) errs.push('Template has no id.');
  if (!t.fields.length) errs.push('Template has no fields.');
  const seen = new Set();
  for (const f of t.fields) {
    if (!f.key) { errs.push('A field is missing its key.'); continue; }
    if (seen.has(f.key)) errs.push(`Duplicate field key "${f.key}".`);
    seen.add(f.key);
    if (f.kind && !FIELD_KINDS.includes(f.kind)) errs.push(`Field "${f.key}" has unknown kind "${f.kind}".`);
    if (f.kind === 'select' && f.enum && !t.enums[f.enum]) errs.push(`Field "${f.key}" references missing enum "${f.enum}".`);
  }
  for (const b of t.layout) {
    if (!BLOCK_KINDS.includes(b.block)) errs.push(`Layout block has unknown kind "${b.block}".`);
    for (const key of blockFieldRefs(b)) {
      if (key && !seen.has(key)) errs.push(`Layout ${b.block} references missing field "${key}".`);
    }
  }
  return errs;
}

/** Every field key a layout block reads from. */
export function blockFieldRefs(b) {
  const refs = [];
  if (b.block === 'header') refs.push(b.title, b.subtitle, b.tag, b.glyph, b.badge, b.cost);
  else if (['art', 'text', 'flavor', 'callout'].includes(b.block)) refs.push(b.field);
  else if (['badges', 'footer', 'typeline'].includes(b.block)) refs.push(...(b.fields || []));
  else if (b.block === 'stats') refs.push(...(b.pips || []).map((p) => p.field));
  return refs.filter(Boolean);
}

// ── Types ────────────────────────────────────────────────────
export function typeMeta(t, typeId) {
  return t.types.find((ty) => ty.id === typeId) || null;
}

export function typeColor(t, typeId) {
  return typeMeta(t, typeId)?.color || DEFAULT_ACCENT;
}

export function accentFor(t, card) {
  const from = t.style.accentFrom;
  if (!from || from === 'none') return DEFAULT_ACCENT;
  return typeColor(t, card?.[from]);
}

// ── Fields ───────────────────────────────────────────────────
export function fieldDefault(f) {
  if (f.default !== undefined) return f.default;
  if (f.kind === 'number') return 0;
  if (f.kind === 'toggle') return false;
  return '';
}

export function fieldDefaults(t) {
  const out = {};
  for (const f of t.fields) out[f.key] = fieldDefault(f);
  return out;
}

/**
 * Defaults for the WORKING copy of a card: optional fields are excluded,
 * so their keys only ever exist when the source data carried them (or the
 * user edits them) — normalizing must not invent keys that export later.
 */
export function workingDefaults(t) {
  const out = {};
  for (const f of t.fields) {
    if (!f.optional) out[f.key] = fieldDefault(f);
  }
  return out;
}

/** Options for a select field: inline list or a named enum. */
export function selectOptions(t, f) {
  if (Array.isArray(f.options)) return f.options;
  if (f.enum && Array.isArray(t.enums[f.enum])) return t.enums[f.enum];
  return [];
}

/** showIf conditions: { typeIn: [...] } and/or { truthy: 'fieldKey' }. */
export function cardMatchesShowIf(t, card, cond) {
  if (!cond) return true;
  if (Array.isArray(cond.typeIn) && !cond.typeIn.includes(card?.[t.typeField])) return false;
  if (cond.truthy && !card?.[cond.truthy]) return false;
  return true;
}

// ── Cards ────────────────────────────────────────────────────
/**
 * Coerce a card for export against a template — LOSSLESSLY.
 * Template fields are emitted with type coercion; every unknown key on
 * the card passes through unchanged (only the working `_uid` is dropped).
 * Fields marked `optional: true` are omitted when the value equals the
 * field default AND the source card never carried the key — so exporting
 * never invents keys the game data didn't have.
 */
export function cleanCard(t, card) {
  const out = {};
  for (const f of t.fields) {
    const had = Object.prototype.hasOwnProperty.call(card, f.key);
    let v = had ? card[f.key] : fieldDefault(f);
    if (f.kind === 'number') {
      v = Number.isFinite(+v) ? (f.float ? +v : Math.trunc(+v)) : 0;
    }
    if (f.optional && !had && v === fieldDefault(f)) continue;
    out[f.key] = v;
  }
  for (const k of Object.keys(card)) {
    if (k === '_uid' || Object.prototype.hasOwnProperty.call(out, k)) continue;
    out[k] = card[k];
  }
  return out;
}

/** cards.json-compatible export (no template embedded). */
export function buildExport(t, cards, meta = {}) {
  return {
    _meta: {
      ...meta,
      version: meta.version || '2.1.0',
      cardCount: cards.length,
      generatedAt: new Date().toISOString(),
      source: 'CardForge',
      template: t.id,
    },
    cards: cards.map((c) => cleanCard(t, c)),
  };
}

/** Self-describing bundle: template + cards in one document. */
export function buildBundle(t, cards, meta = {}) {
  const { _meta, cards: cleaned } = buildExport(t, cards, meta);
  const template = JSON.parse(JSON.stringify(t));
  delete template.sampleCards;
  return { _meta, template, cards: cleaned };
}

// ── Assets ───────────────────────────────────────────────────
/** Strip scripting vectors from pasted/uploaded SVG. Returns '' if not an SVG. */
export function sanitizeSvg(src) {
  let s = String(src || '').trim();
  s = s.replace(/<\?xml[\s\S]*?\?>/gi, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').trim();
  if (!/^<svg[\s>]/i.test(s)) return '';
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/(href|xlink:href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
  return s;
}

// ── Template scaffolding ─────────────────────────────────────
export function makeBlankTemplate(id = 'my-game') {
  return normalizeTemplate({
    id,
    name: 'My Game',
    description: 'A fresh card pattern. Add types, fields, and layout blocks.',
    types: [{ id: 'Basic', label: 'Basic', color: '#38bdf8' }],
    fields: [
      { key: 'name', label: 'Name', kind: 'text', group: 'Identity', required: true },
      { key: 'type', label: 'Type', kind: 'select', group: 'Identity', fromTypes: true, default: 'Basic' },
      { key: 'text', label: 'Rules text', kind: 'textarea', group: 'Text' },
      { key: 'glyph', label: 'Glyph', kind: 'icon', group: 'Visuals' },
    ],
    layout: [
      { block: 'header', title: 'name', tag: 'type', glyph: 'glyph' },
      { block: 'text', field: 'text' },
      { block: 'footer', fields: ['type'] },
    ],
  });
}
