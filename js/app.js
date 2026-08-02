// ── Entry point ──────────────────────────────────────────────
// Wires modules together and boots the app.

import { state, loadBuiltinTemplates, loadSaved, activateTemplate } from './state.js';
import { render } from './render.js';
import { bindEvents, bootstrapDeckIfEmpty } from './events.js';

async function init() {
  await loadBuiltinTemplates(state);
  const savedId = loadSaved(state);
  activateTemplate(state, savedId || 'rush-q');
  await bootstrapDeckIfEmpty(state);
  render(state);
  bindEvents(state);
}

init();
