<div align="center">

# CardForge

**Define card game patterns as templates, edit decks against them, and export self-describing JSON**

![Static Site](https://img.shields.io/badge/static-site-7c3aed) ![No Build](https://img.shields.io/badge/build-none-success) ![ES Modules](https://img.shields.io/badge/js-ES%20modules-blue)

</div>

## Overview

CardForge is a **card pattern matrix**: a template JSON document defines how a card family is structured — its types, enums, editable fields, preview layout blocks, and custom SVG assets — and the editor form, live preview, and exports are all generated from it. Ship-with templates cover three very different games (Rush Q corporate strategy, a minimal TCG, a kids' brick-adventure pattern), and the template panel lets you fork, remix, or build new patterns from scratch. The exported bundle (`template + cards`) is self-describing: any tool — or an LLM — can read the template and generate conforming cards.

**Live:** [cardforge.neorgon.com](https://cardforge.neorgon.com/)

## Built-in templates

| Template | What it demonstrates |
|---|---|
| **Rush Q** | Full-fidelity schema for the game's `data/cards.json` (all 28 fields + optional `minQuarter` / `status` / `source` pipeline keys). Boots with one exemplar per base type; import the game's full `cards.json` to edit everything. Lossless round-trip: import → edit → export never drops or invents keys. |
| **Mythic Clash** | Minimal TCG pattern (Marvel Champions / Yu-Gi-Oh spirit): poker frame, corner cost badge, typeline, attack/health corner badges, and a custom SVG glyph asset. |
| **Brick Tales** | Kids' brick-adventure pattern in tarot proportions: bilingual names, pseudo-rule callouts (limits, limitations, doesn't-work-with), and a highlighted **Friendship Rule** — the kid-friendly override block. |

## Features

- **Real card anatomy** — physical aspect ratios (poker 63.5×88.9 mm, tarot, square, landscape), layered frames (ink border → plate → inset windows), title plate with corner cost badge, art window with a deliberate placeholder, typeline, auto-fitting rules text, TCG-style corner stat badges. All tunable per template (shape, frame, title style, texture, border, radius, art ratio).
- **Print sheet** — one click renders every card (respecting `quantity`) at true 63.5×88.9 mm for printing and cutting.
- **Local asset library** — save uploaded images to a browser-local IndexedDB library, reusable across every template; pick, reuse, and delete from the image field.
- **YAML or JSON in** — import decks or bundles as `.json` or `.yaml`/`.yml` (same shapes).
- **Template panel** — edit types (with colors), enums, fields (kind, group, defaults, per-type visibility), layout blocks (drag to reorder), and custom SVGs (pasted markup is sanitized). Editing a built-in forks a restorable copy.
- **Schema-driven editor** — the form is generated from the template; fields appear only for the card types they apply to.
- **Live preview** — layout blocks render in order: header (with optional bilingual subtitle), art, text, badges, callouts, stat pips, flavor, footer. Accent color comes from the card's type.
- **SVG icon system** — 122 vendored Lucide icons with a searchable picker; legacy emoji values map to icons automatically; custom template SVGs are usable anywhere an icon is.
- **Lossless data handling** — unknown keys on imported cards pass through storage and export untouched; `optional` template fields are omitted for cards that never had them.
- **Exports** — `Export bundle` (template + cards, self-describing, LLM-interpretable), `Export cards.json` (game-compatible shape), copy deck / card / template JSON.
- Import any `cards.json`, a bare card array, or a full bundle (installs its template).
- Per-template decks persist to `localStorage` (`cardforge-v2`); the legacy single-deck key migrates automatically.

## Running locally

ES modules require a server (not `file://`):

```bash
make serve            # python3 -m http.server 8851
```

Then open <http://localhost:8851/>.

## Template document format

```jsonc
{
  "templateVersion": 1,
  "id": "my-game", "name": "My Game", "description": "…",
  "typeField": "type",                       // which field drives type/accent
  "types":  [{ "id": "Hero", "label": "Hero", "color": "#f59e0b" }],
  "enums":  { "keywords": ["Guard", "Rush"] },
  "fields": [                                 // drives the editor + export
    { "key": "name", "kind": "text", "group": "Identity", "required": true },
    { "key": "attack", "kind": "number", "showIf": { "typeIn": ["Hero"] } },
    { "key": "glyph", "kind": "icon", "picks": ["swords", "shield"] },
    { "key": "status", "kind": "select", "enum": "status", "optional": true }
  ],
  "layout": [                                 // drives the preview, in order
    { "block": "header", "title": "name", "tag": "type", "glyph": "glyph" },
    { "block": "text", "field": "rulesText" },
    { "block": "callout", "field": "note", "label": "Note", "icon": "info", "tone": "accent" },
    { "block": "stats", "pips": [{ "field": "attack", "icon": "swords", "hideIfZero": true }] },
    { "block": "footer", "fields": ["type"] }
  ],
  "assets": { "svg": { "my-sigil": "<svg …>…</svg>" } },
  "style":  { "accentFrom": "type", "maxWidth": 320,
              "aspect": "poker",              // poker | tarot | square | landscape | auto
              "frame": "classic",             // classic | full-art | minimal
              "titleStyle": "plate",          // plate | bar | underline
              "texture": "linen",             // linen | none
              "borderWidth": 10, "cornerRadius": 14,
              "artRatio": 0.38 },             // art window share of card height
  "sampleCards": []                           // optional bootstrap deck
}
```

Field kinds: `text · textarea · number · select · icon · image · color · toggle`.
Block kinds: `header · art · text · stats · badges · callout · flavor · footer · divider`.
`showIf` supports `{ "typeIn": […] }` and `{ "truthy": "fieldKey" }`. Fields marked `optional` are omitted from exports when a card never carried the key.

## Architecture

```
cardforge-site/
├── index.html          # App shell — header, toolbar, 3-pane workspace, template panel
├── css/
│   ├── style.css       # Design system (tokens, buttons, cards)
│   └── cardforge.css   # 3-pane layout, editor, preview blocks, template panel
├── js/
│   ├── app.js          # Entry point — load templates, restore state, render, bind
│   ├── schema.js       # Template model: validate, cleanCard (lossless), exports, sanitizeSvg
│   ├── state.js        # Multi-template state + per-template decks + localStorage
│   ├── render.js       # Deck list, schema-driven editor form, layout-driven preview
│   ├── events.js       # Field editing, drag-drop, template switching, import/export
│   ├── template-editor.js  # Template panel: types, enums, fields, layout, assets
│   ├── icons.js        # GENERATED — 122 Lucide icons + emoji→icon map
│   └── utils.js        # escHtml, download, copyText, debounce
├── data/
│   └── templates/      # Built-in templates (rush-q, clash-minimal, brick-tales), samples embedded
└── scripts/
    ├── generate-icons.mjs   # Rebuild js/icons.js from lucide-static
    └── verify-roundtrip.mjs # Fidelity gate: cards.json → cleanCard → zero diffs
```

`Export cards.json` matches the game's shape exactly: `{ "_meta": { version, cardCount, generatedAt, source, template }, "cards": [...] }`. Run `node scripts/verify-roundtrip.mjs` to prove the round-trip is lossless against the live game data.

<div align="center">

Part of [Neorgon](https://neorgon.com/)

</div>
