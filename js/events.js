// ── Event handlers ───────────────────────────────────────────
// Field editing, drag-drop reorder, template switching, import/export.

import {
  state, save, normalizeCards, buildExport, cleanCard, getSelected,
  activateTemplate, stripUid,
} from './state.js';
import { buildBundle, workingDefaults } from './schema.js';
import { render, renderDeckList, renderPreview, renderIconGrid, cardArticleHtml } from './render.js';
import { showToast, debounce, download, copyText, escHtml } from './utils.js';
import { openTemplatePanel, bindTemplatePanel } from './template-editor.js';
import { putAsset, listAssets, getAsset, deleteAsset } from './assets.js';

// ── Card set operations ──────────────────────────────────────
function selectCard(uid) {
  state.selectedId = uid;
  save(state);
  render(state);
}

function addCard() {
  const defaults = state.template ? workingDefaults(state.template) : {};
  const card = { ...defaults, name: 'New Card', _uid: ++state._uid };
  state.cards.unshift(card);
  state.selectedId = card._uid;
  save(state);
  render(state);
  showToast('Card added');
}

function duplicateCard(uid) {
  const idx = state.cards.findIndex((c) => c._uid === uid);
  if (idx < 0) return;
  const copy = { ...state.cards[idx], name: `${state.cards[idx].name} (copy)`, _uid: ++state._uid };
  state.cards.splice(idx + 1, 0, copy);
  state.selectedId = copy._uid;
  save(state);
  render(state);
  showToast('Card duplicated');
}

function deleteCard(uid) {
  const idx = state.cards.findIndex((c) => c._uid === uid);
  if (idx < 0) return;
  state.cards.splice(idx, 1);
  if (state.selectedId === uid) {
    state.selectedId = state.cards[Math.min(idx, state.cards.length - 1)]?._uid ?? null;
  }
  save(state);
  render(state);
  showToast('Card deleted');
}

// ── Field editing (live) ─────────────────────────────────────
const persist = debounce(() => save(state), 300);

function fieldDef(key) {
  return state.template?.fields.find((f) => f.key === key) || null;
}

function onFieldInput(e) {
  const el = e.target.closest('[data-field]');
  if (!el) return;
  const card = getSelected(state);
  if (!card) return;
  const key = el.dataset.field;
  const f = fieldDef(key);
  let val;
  if (f?.kind === 'toggle') {
    val = el.checked;
  } else if (f?.kind === 'number') {
    val = el.value === '' ? 0 : (f.float ? Number(el.value) || 0 : Math.trunc(Number(el.value)) || 0);
  } else {
    val = el.value;
  }
  card[key] = val;

  // Type change reshapes the form; re-render everything.
  if (key === state.template?.typeField) {
    render(state);
    save(state);
    return;
  }
  renderPreview(state);
  renderDeckList(state);
  persist();
}

function onGlyphPick(e) {
  const btn = e.target.closest('[data-pick]');
  if (!btn || btn.closest('#templatePanel')) return;
  const card = getSelected(state);
  if (!card) return;
  const key = btn.dataset.pickField;
  card[key] = btn.dataset.pick;
  const input = document.querySelector(`#editorForm [data-field="${CSS.escape(key)}"]`);
  if (input) input.value = card[key];
  renderPreview(state);
  renderDeckList(state);
  save(state);
}

function onIconBrowse(e) {
  const btn = e.target.closest('[data-icon-browse]');
  if (!btn) return;
  const key = btn.dataset.iconBrowse;
  const panel = document.getElementById(`iconBrowser-${key}`);
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) renderIconGrid(key, '');
}

function onIconSearch(e) {
  const el = e.target.closest('[data-icon-search]');
  if (!el) return;
  renderIconGrid(el.dataset.iconSearch, el.value);
}

function onImageUpload(e) {
  const input = e.target.closest('[data-img-for]');
  if (!input) return;
  const file = input.files?.[0];
  if (!file) return;
  const card = getSelected(state);
  if (!card) return;
  if (file.size > 400 * 1024) {
    showToast('Image too large — keep uploads under 400 KB (use a URL instead)');
    input.value = '';
    return;
  }
  const key = input.dataset.imgFor;
  const reader = new FileReader();
  reader.onload = () => {
    card[key] = String(reader.result);
    save(state);
    render(state);
    showToast('Image embedded as data URI');
  };
  reader.readAsDataURL(file);
  input.value = '';
}

// ── Local asset library (images, shared across templates) ───
async function renderLibPicker(key) {
  const host = document.getElementById(`libPicker-${key}`);
  if (!host) return;
  const items = await listAssets('image');
  host.innerHTML = items.length
    ? items.map((a) => `<span class="lib-item" data-lib-pick="${escHtml(a.name)}" data-lib-key="${key}" title="${escHtml(a.name)}">
        <img src="${escHtml(a.data)}" alt="">
        <span class="lib-item__name">${escHtml(a.name)}</span>
        <button type="button" class="lib-item__del" data-lib-del="${escHtml(a.name)}" data-lib-key="${key}" title="Remove from library">✕</button>
      </span>`).join('')
    : '<span class="lib-empty">Library is empty — save an image with the ⭳ button, it becomes reusable in every template.</span>';
}

async function onLibraryClick(e) {
  const card = getSelected(state);
  const del = e.target.closest('[data-lib-del]');
  if (del) {
    e.stopPropagation();
    await deleteAsset(del.dataset.libDel);
    renderLibPicker(del.dataset.libKey);
    showToast('Removed from library');
    return true;
  }
  const pick = e.target.closest('[data-lib-pick]');
  if (pick && card) {
    const asset = await getAsset(pick.dataset.libPick);
    if (asset) {
      card[pick.dataset.libKey] = asset.data;
      save(state);
      render(state);
      showToast(`Using "${asset.name}"`);
    }
    return true;
  }
  const open = e.target.closest('[data-lib-open]');
  if (open) {
    const host = document.getElementById(`libPicker-${open.dataset.libOpen}`);
    if (host) {
      host.hidden = !host.hidden;
      if (!host.hidden) renderLibPicker(open.dataset.libOpen);
    }
    return true;
  }
  const saveBtn = e.target.closest('[data-lib-save]');
  if (saveBtn && card) {
    const key = saveBtn.dataset.libSave;
    const v = String(card[key] || '').trim();
    if (!/^data:image\//i.test(v)) {
      showToast('Upload an image first — only embedded images can join the library');
      return true;
    }
    const base = (card.name || 'image').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'image';
    await putAsset(`${base}-${String(Date.now()).slice(-4)}`, 'image', v);
    showToast('Saved to your local library — reusable in every template');
    return true;
  }
  return false;
}

// ── Print sheet (physical-size cards for cutting) ────────────
function printSheet() {
  const t = state.template;
  const sheet = document.getElementById('printSheet');
  if (!t || !sheet || !state.cards.length) return;
  const hasQty = t.fields.some((f) => f.key === 'quantity');
  const cells = [];
  for (const c of state.cards) {
    const copies = hasQty && Number(c.quantity) > 1 ? Math.min(Number(c.quantity), 12) : 1;
    for (let i = 0; i < copies; i++) {
      cells.push(`<div class="print-cell">${cardArticleHtml(t, c, state.previewFont)}</div>`);
    }
  }
  sheet.innerHTML = cells.join('');
  showToast(`Printing ${cells.length} cards at 63.5×88.9 mm`);
  window.print();
  setTimeout(() => { sheet.innerHTML = ''; }, 1000);
}

// ── Drag & drop reorder (deck list) ──────────────────────────
let dragUid = null;

function onDragStart(e) {
  const row = e.target.closest('.deck-row');
  if (!row) return;
  dragUid = Number(row.dataset.uid);
  row.classList.add('is-dragging');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(dragUid)); } catch { /* noop */ }
}

function onDragEnd(e) {
  const row = e.target.closest('.deck-row');
  if (row) row.classList.remove('is-dragging');
  document.querySelectorAll('.deck-row.is-over').forEach((r) => r.classList.remove('is-over'));
  dragUid = null;
}

function onDragOver(e) {
  const row = e.target.closest('.deck-row');
  if (!row || dragUid === null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.deck-row.is-over').forEach((r) => r.classList.remove('is-over'));
  row.classList.add('is-over');
}

function onDrop(e) {
  const row = e.target.closest('.deck-row');
  if (!row || dragUid === null) return;
  e.preventDefault();
  const targetUid = Number(row.dataset.uid);
  if (targetUid === dragUid) return;
  const from = state.cards.findIndex((c) => c._uid === dragUid);
  const to = state.cards.findIndex((c) => c._uid === targetUid);
  if (from < 0 || to < 0) return;
  const [moved] = state.cards.splice(from, 1);
  state.cards.splice(to, 0, moved);
  save(state);
  renderDeckList(state);
}

// ── Template switching + bootstrap ───────────────────────────
export async function bootstrapDeckIfEmpty(s) {
  const t = s.template;
  if (!t || s.cards.length) return;
  if (Array.isArray(t.sampleCards) && t.sampleCards.length) {
    s.cards = normalizeCards(s, t.sampleCards);
  } else if (t.sampleUrl) {
    try {
      const res = await fetch(t.sampleUrl, { cache: 'no-cache' });
      const data = await res.json();
      if (data._meta) s.meta = data._meta;
      s.cards = normalizeCards(s, Array.isArray(data) ? data : data.cards);
    } catch { showToast('Could not load the sample deck'); }
  }
  s.selectedId = s.cards[0]?._uid ?? null;
}

async function onTemplateChange(e) {
  const id = e.target.value;
  if (id === state.template?.id) return;
  const empty = activateTemplate(state, id);
  if (empty) await bootstrapDeckIfEmpty(state);
  save(state);
  render(state);
  showToast(`Template: ${state.template?.name || id}`);
}

// ── Import / export ──────────────────────────────────────────
function parseDeck(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    if (!window.jsyaml) throw new Error('YAML needs js-yaml (offline?)');
    data = window.jsyaml.load(raw); // YAML input — same shapes accepted
  }
  if (Array.isArray(data)) return { cards: data, meta: null, template: null };
  if (data && Array.isArray(data.cards)) {
    return { cards: data.cards, meta: data._meta || null, template: data.template || null };
  }
  throw new Error('Unrecognized shape');
}

function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const { cards, meta, template } = parseDeck(String(reader.result));
      if (template) {
        // A bundle: install/replace its template, then load the cards into it.
        import('./template-editor.js').then((m) => m.installTemplate(template, cards, meta));
        return;
      }
      if (meta) state.meta = meta;
      state.cards = normalizeCards(state, cards);
      state.selectedId = state.cards[0]?._uid ?? null;
      save(state);
      render(state);
      showToast(`Imported ${cards.length} cards`);
    } catch {
      showToast('Import failed — not a valid cards/bundle JSON or YAML');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function exportDeck() {
  const payload = JSON.stringify(buildExport(state.cards), null, 2);
  download('cards.json', payload);
  showToast(`Exported ${state.cards.length} cards`);
}

function exportBundle() {
  const t = state.template;
  if (!t) return;
  const payload = JSON.stringify(buildBundle(t, state.cards.map(stripUid), state.meta || {}), null, 2);
  download(`${t.id}-bundle.json`, payload);
  showToast('Bundle exported — template + cards, self-describing');
}

async function copyDeck() {
  const payload = JSON.stringify(buildExport(state.cards), null, 2);
  const ok = await copyText(payload);
  showToast(ok ? 'Deck JSON copied' : 'Copy failed');
}

async function copyCard() {
  const card = getSelected(state);
  if (!card) return;
  const ok = await copyText(JSON.stringify(cleanCard(card), null, 2));
  showToast(ok ? 'Card JSON copied' : 'Copy failed');
}

async function resetToSample() {
  state.cards = [];
  state.selectedId = null;
  await bootstrapDeckIfEmpty(state);
  save(state);
  render(state);
  showToast('Reset to sample deck');
}

// ── Font selector ────────────────────────────────────────────
function onFontChange(e) {
  state.previewFont = e.target.value;
  save(state);
  renderPreview(state);
}

// ── Delegated click routing ──────────────────────────────────
function onDeckClick(e) {
  const actBtn = e.target.closest('[data-act]');
  if (actBtn) {
    e.stopPropagation();
    const uid = Number(actBtn.dataset.uid);
    if (actBtn.dataset.act === 'dup') duplicateCard(uid);
    else if (actBtn.dataset.act === 'del') deleteCard(uid);
    return;
  }
  const row = e.target.closest('.deck-row');
  if (row) selectCard(Number(row.dataset.uid));
}

function onDeckKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest('.deck-row');
  if (!row) return;
  e.preventDefault();
  selectCard(Number(row.dataset.uid));
}

function onEditorClick(e) {
  const card = getSelected(state);
  if (e.target.closest('#copyCardBtn')) copyCard();
  else if (e.target.closest('#dupCardBtn') && card) duplicateCard(card._uid);
  else if (e.target.closest('#delCardBtn') && card) deleteCard(card._uid);
}

// ── Bind everything ──────────────────────────────────────────
export function bindEvents(_state) {
  // Toolbar.
  document.getElementById('newCardBtn')?.addEventListener('click', addCard);
  document.getElementById('exportBtn')?.addEventListener('click', exportDeck);
  document.getElementById('exportBundleBtn')?.addEventListener('click', exportBundle);
  document.getElementById('copyDeckBtn')?.addEventListener('click', copyDeck);
  document.getElementById('resetBtn')?.addEventListener('click', resetToSample);
  document.getElementById('importInput')?.addEventListener('change', onImportFile);
  document.getElementById('fontSelect')?.addEventListener('change', onFontChange);
  document.getElementById('templateSelect')?.addEventListener('change', onTemplateChange);
  document.getElementById('editTemplateBtn')?.addEventListener('click', () => openTemplatePanel(state));
  document.getElementById('printBtn')?.addEventListener('click', printSheet);

  // Deck list (delegated).
  const deck = document.getElementById('deckList');
  if (deck) {
    deck.addEventListener('click', onDeckClick);
    deck.addEventListener('keydown', onDeckKeydown);
    deck.addEventListener('dragstart', onDragStart);
    deck.addEventListener('dragend', onDragEnd);
    deck.addEventListener('dragover', onDragOver);
    deck.addEventListener('drop', onDrop);
  }

  // Editor (delegated).
  const editor = document.getElementById('editorForm');
  if (editor) {
    editor.addEventListener('input', (e) => {
      onIconSearch(e);
      if (!e.target.closest('[data-icon-search]')) onFieldInput(e);
    });
    editor.addEventListener('change', (e) => {
      onImageUpload(e);
      if (!e.target.closest('[data-img-for]') && !e.target.closest('[data-icon-search]')) onFieldInput(e);
    });
    editor.addEventListener('click', async (e) => {
      if (await onLibraryClick(e)) return;
      onGlyphPick(e);
      onIconBrowse(e);
      onEditorClick(e);
    });
  }

  bindTemplatePanel(state);
}
