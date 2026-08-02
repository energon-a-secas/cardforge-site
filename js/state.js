// ── State management ─────────────────────────────────────────
// Working set: active template + its cards, custom templates, and the
// per-template decks of inactive templates. Persists to localStorage.

import { normalizeTemplate, workingDefaults, cleanCard as schemaCleanCard, buildExport as schemaBuildExport } from './schema.js';

const STORAGE_KEY = 'cardforge-v2';
const LEGACY_KEY = 'cardforge-deck'; // pre-template single-deck format

export const BUILTIN_TEMPLATE_URLS = [
  'data/templates/rush-q.json',
  'data/templates/clash-minimal.json',
  'data/templates/brick-tales.json',
];

export const state = {
  template: null,       // active (normalized) template
  builtins: [],         // built-in templates fetched from data/templates/
  customTemplates: [],  // user templates; same-id entries shadow built-ins
  decks: {},            // templateId → raw card arrays (inactive templates)
  cards: [],            // working cards of the active template (with _uid)
  selectedId: null,     // uid of the card being edited
  previewFont: "'Space Grotesk', sans-serif",
  _uid: 0,
};

// ── Templates ────────────────────────────────────────────────
export async function loadBuiltinTemplates(s) {
  const loaded = await Promise.all(BUILTIN_TEMPLATE_URLS.map(async (url) => {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      return normalizeTemplate(await res.json());
    } catch { return null; }
  }));
  s.builtins = loaded.filter(Boolean);
}

/** All selectable templates; custom entries shadow built-ins by id. */
export function allTemplates(s) {
  const byId = new Map();
  for (const t of s.builtins) byId.set(t.id, t);
  for (const t of s.customTemplates) byId.set(t.id, t);
  return [...byId.values()];
}

export function findTemplate(s, id) {
  return s.customTemplates.find((t) => t.id === id)
    || s.builtins.find((t) => t.id === id) || null;
}

export function isBuiltinId(s, id) { return s.builtins.some((t) => t.id === id); }
export function isOverridden(s, id) { return s.customTemplates.some((t) => t.id === id); }

/**
 * Make the active template safe to mutate: if it's a pristine built-in,
 * fork it into customTemplates under the same id (shadowing the built-in,
 * restorable via removeOverride). Returns the editable template.
 */
export function ensureEditable(s) {
  const t = s.template;
  if (!t) return null;
  if (s.customTemplates.includes(t)) return t;
  const copy = normalizeTemplate(JSON.parse(JSON.stringify(t)));
  s.customTemplates.push(copy);
  s.template = copy;
  return copy;
}

/** Drop a custom override, restoring the built-in of the same id. */
export function removeOverride(s, id) {
  s.customTemplates = s.customTemplates.filter((t) => t.id !== id);
  if (s.template?.id === id) s.template = findTemplate(s, id);
}

// ── Cards ────────────────────────────────────────────────────
/** Give every card the template defaults + a stable working uid. */
export function normalizeCards(s, rawCards) {
  const defaults = s.template ? workingDefaults(s.template) : {};
  return (rawCards || []).map((c) => {
    const card = { ...defaults, ...c };
    card._uid = ++state._uid;
    return card;
  });
}

export function stripUid(card) {
  const { _uid, ...rest } = card;
  return rest;
}

export function getSelected(s) {
  return s.cards.find((c) => c._uid === s.selectedId) || null;
}

/** Lossless template-driven coercion (see schema.cleanCard). */
export function cleanCard(card) {
  return state.template ? schemaCleanCard(state.template, stripUid(card)) : stripUid(card);
}

export function buildExport(cards) {
  return schemaBuildExport(state.template, cards.map(stripUid), state.meta || {});
}

/**
 * Activate a template: stash the current deck, swap in the target's.
 * Returns true if the target deck is empty (caller may bootstrap samples).
 */
export function activateTemplate(s, id) {
  if (s.template) s.decks[s.template.id] = s.cards.map(stripUid);
  s.template = findTemplate(s, id) || allTemplates(s)[0] || null;
  s.cards = normalizeCards(s, s.template ? s.decks[s.template.id] : []);
  s.selectedId = s.cards[0]?._uid ?? null;
  return !s.cards.length;
}

// ── Persistence ──────────────────────────────────────────────
/**
 * Load saved working set. Returns the saved active template id (or null).
 * Falls back to migrating the legacy single-deck key into the rush-q slot.
 */
export function loadSaved(s) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      s.customTemplates = (parsed.customTemplates || []).map(normalizeTemplate);
      s.decks = parsed.decks && typeof parsed.decks === 'object' ? parsed.decks : {};
      if (parsed.previewFont) s.previewFont = parsed.previewFont;
      if (parsed.meta) s.meta = parsed.meta;
      return parsed.activeTemplateId || null;
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed && Array.isArray(parsed.cards)) {
        s.decks['rush-q'] = parsed.cards;
        if (parsed.previewFont) s.previewFont = parsed.previewFont;
        return 'rush-q';
      }
    }
  } catch { /* corrupt storage — start fresh */ }
  return null;
}

/** Persist working set. Cards are stored RAW — no coercion, no field loss. */
export function save(s) {
  try {
    const decks = { ...s.decks };
    if (s.template) decks[s.template.id] = s.cards.map(stripUid);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeTemplateId: s.template?.id ?? null,
      customTemplates: s.customTemplates,
      decks,
      previewFont: s.previewFont,
      meta: s.meta || undefined,
    }));
  } catch { /* quota exceeded or private mode */ }
}
