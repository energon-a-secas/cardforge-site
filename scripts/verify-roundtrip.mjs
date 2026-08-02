#!/usr/bin/env node
// Round-trip fidelity gate: pushes the game's live cards.json through the
// Rush Q template's cleanCard() and proves NOTHING is lost or changed.
// Added default keys (the template densifying sparse cards) are allowed
// and reported; a lost key or a changed value fails the run.
// Run: node scripts/verify-roundtrip.mjs [path/to/cards.json]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTemplate, cleanCard, workingDefaults } from '../js/schema.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cardsPath = process.argv[2] || join(ROOT, '../rush-q-cards-site/data/cards.json');
const templatePath = join(ROOT, 'data/templates/rush-q.json');

const template = normalizeTemplate(JSON.parse(readFileSync(templatePath, 'utf8')));
const data = JSON.parse(readFileSync(cardsPath, 'utf8'));
const cards = Array.isArray(data) ? data : data.cards;

let lost = 0;
let changed = 0;
const added = new Map(); // key → count of cards where a default key was added

cards.forEach((card, i) => {
  const out = cleanCard(template, card);
  for (const key of Object.keys(card)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) {
      lost++;
      console.error(`LOST   card[${i}] "${card.name}": key "${key}" (was ${JSON.stringify(card[key])})`);
    } else if (JSON.stringify(out[key]) !== JSON.stringify(card[key])) {
      changed++;
      console.error(`CHANGED card[${i}] "${card.name}": "${key}" ${JSON.stringify(card[key])} → ${JSON.stringify(out[key])}`);
    }
  }
  for (const key of Object.keys(out)) {
    if (!Object.prototype.hasOwnProperty.call(card, key)) {
      added.set(key, (added.get(key) || 0) + 1);
    }
  }
});

console.log(`\nChecked ${cards.length} cards from ${cardsPath}`);
if (added.size) {
  console.log('Default keys added by the template (allowed):');
  for (const [key, n] of [...added.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  + ${key} on ${n} cards`);
  }
}
if (data._meta && data._meta.cardCount !== cards.length) {
  console.error(`\nWARNING: _meta.cardCount is ${data._meta.cardCount} but the file has ${cards.length} cards.`);
}
// Second pass: simulate the app path (normalize with working defaults,
// then clean) and assert optional keys are never invented along the way.
const defaults = workingDefaults(template);
const optionalKeys = template.fields.filter((f) => f.optional).map((f) => f.key);
let invented = 0;
cards.forEach((card, i) => {
  const working = { ...defaults, ...card };
  const out = cleanCard(template, working);
  for (const key of optionalKeys) {
    if (!Object.prototype.hasOwnProperty.call(card, key)
      && Object.prototype.hasOwnProperty.call(out, key)) {
      invented++;
      console.error(`INVENTED card[${i}] "${card.name}": optional key "${key}" appeared via normalize→clean`);
    }
  }
  for (const key of Object.keys(card)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) {
      lost++;
      console.error(`LOST (app path) card[${i}] "${card.name}": key "${key}"`);
    }
  }
});

if (lost || changed || invented) {
  console.error(`\nFAIL — ${lost} lost, ${changed} changed, ${invented} invented.`);
  process.exit(1);
}
console.log('PASS — app path (normalize → clean) invents no optional keys.');
console.log('\nPASS — round-trip is lossless: no keys lost, no values changed.');
