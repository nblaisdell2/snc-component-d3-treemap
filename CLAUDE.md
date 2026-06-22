# CLAUDE.md — D3 Treemap UI component

Context for Claude Code (or any agent) continuing work on this project.

## What this is

A ServiceNow **Next Experience / UI Builder** custom component that renders a configurable
**treemap** with D3 v7. A treemap encodes value as the AREA of nested rectangles (no axes). It is
a sibling of the **D3 Line / Column** chart components and mirrors their architecture and
conventions — but NOT their data contract (a treemap needs a single tree, not a `series` array).

- Component tag: `x-1295779-treemap-chart-uic`  ·  Scope: `x_1295779_tree_0` (scopeName must be ≤ 18 chars)
- Vendor prefix `x_1295779` is shared with the line/column charts (same publisher).
- CSS class prefix: `tc` (e.g. `.tc-root`, `.tc-svg`, `.tc-tooltip`, `.tc-tile`).

## Architecture (important conventions)

- **Seismic + D3 split.** The snabbdom `view` renders only a single stable `<div class="tc-root">`.
  D3 owns the SVG imperatively. `drawChart(container, props, dispatch)` in
  `src/x-1295779-treemap-chart-uic/chart.js` fully re-renders on every property change. Never mix
  snabbdom virtual DOM with D3 mutation on the same nodes.
- **Lifecycle** (`index.js`): redraw on `COMPONENT_RENDERED` and `COMPONENT_PROPERTY_CHANGED`;
  a `ResizeObserver` (wired in `COMPONENT_DOM_READY`) redraws on width changes only, and skips
  re-animating so the tile fade-in isn't snapped to its end state.
- **D3 imports must be NAMED submodule imports** (`import { select } from 'd3-selection'`,
  `import { hierarchy, treemap, treemapSquarify, ... } from 'd3-hierarchy'`), not `import * as d3`.
  The ServiceNow prod build tree-shakes a passed-around namespace object and would strip methods.
  Only the `d3` meta-package is a dependency; submodules resolve through it.
- **No `d3-transition`.** The tile-in animation animates each tile group's transform (scale from
  center) + opacity via `requestAnimationFrame`. Don't introduce `d3-transition` — it gets
  tree-shaken out of the prod bundle.
- **Auto-contrast labels.** When `labelColor` is blank, each tile label is black or white based on
  the tile fill's relative luminance (`luminance()` / `autoTextColor()` in chart.js).
- **Indentation is TABS** in JS (see `.editorconfig`); ESLint uses `@tectonic/tectonic/servicenow`.
- **Server files are ES5** (`server/*.js`) — scoped/global ServiceNow compatibility (no `let`/
  arrow funcs/template literals there).

## Files

- `src/x-1295779-treemap-chart-uic/index.js` — `createCustomElement`: property defaults + lifecycle.
- `src/x-1295779-treemap-chart-uic/chart.js` — the D3 renderer (the bulk of the logic).
- `src/x-1295779-treemap-chart-uic/sampleData.js` — `SAMPLE_HIERARCHY` (default) + `SAMPLE_DATA`.
- `src/x-1295779-treemap-chart-uic/styles.scss` — host/container/tooltip styles.
- `now-ui.json` — UI Builder manifest: every property (section-prefixed labels) + the
  `CHART_CLICKED` / `TILE_CLICKED` / `TILE_HOVERED` actions. **Keep this in sync with the
  `properties` block in `index.js` and the prop reads in `chart.js`** (the three-places rule).
- `scripts/verify_chart.mjs` — headless render harness (40+ scenarios, no instance needed).
- `server/` — platform-side sources (Script Include `D3HierarchyData.js` + Data Transform scripts
  + properties JSON + sanity-test background script). NOT shipped by `snc ui-component deploy`;
  created as platform records on the instance. See `server/README.md`.

## Data contract

`data` is a SINGLE tree, auto-detected as either:

- **Hierarchy** (object with `children`): `{ name, children: [ { name, children: [ { name, value,
  color? } ] } ] }`. Leaves carry `value`; internal nodes are summed for area.
- **Flat** (array): `[ { label, value, group?, color? } ]`. With a `group` field -> a 2-level
  tree (group -> leaf); without it -> a single level of tiles.

This is DIFFERENT from the line/column `series` array (N series of `{ label, value }` over a
shared category axis). A treemap has no axes — area encodes value. `normalizeData()` in chart.js
converts both inputs into one internal hierarchy object before `d3.hierarchy(...).sum(...)`.

`server/D3HierarchyData.js` produces both shapes: `fromAggregate()`/`fromRows()` -> flat
`[{label,value,group?}]`; `fromHierarchy()` -> nested `{name,children:[...]}`. Reuses the same
helper surface (`_str`, `_blank`, `_parseColors`, `_colorFor`, `_sortCategories`,
`_topCategories`, `_readField`) as the line/column `D3ChartData` Script Include.

## Key chart.js internals

- `normalizeData(data)` — array vs object detection -> internal hierarchy.
- `hierarchy(tree).sum(leaf => value)` then optional `.sort()` (sortTiles).
- `treemap().tile(method).size().paddingInner(tilePadding).paddingTop(headerSpace)` — `headerSpace`
  is reserved only when `showGroupHeaders` and the tree is >1 level deep.
- `maxDepth` flattening via `isRenderLeaf(n)` (a node at depth === maxDepth renders as a leaf).
- Color resolution: `resolveColor(n)` honors node color first, then `colorMode`
  (byGroup/byValue/byDepth/custom); byGroup varies sibling lightness.
- Events: `dispatch('TILE_CLICKED', { name, value, path, group, depth, color })` with
  `event.stopPropagation()`; `CHART_CLICKED` on the background rect; `TILE_HOVERED` on enter.

## Build / dev / deploy

```bash
npm install
snc ui-component develop --open          # local hot-reload harness (example/element.js)
snc ui-component generate-update-set --offline
snc ui-component deploy                   # push to the connected instance
```
Requires the `snc` CLI (`npm i -g @servicenow/cli`) + a configured profile
(`snc configure profile set`). The CLI needs a real instance connection.

## How to verify changes without an instance

```bash
node scripts/verify_chart.mjs --chart src/x-1295779-treemap-chart-uic/chart.js
```
Bundles chart.js with real d3 and runs `drawChart` in jsdom across the scenario matrix (both data
shapes, all tiling methods/color modes, group headers, label modes, maxDepth, sort, empty/single/
all-zero/deep/animate-off). Extend the `SCENARIOS` array for new properties. Also validate JSON
(`node -e "JSON.parse(...)"`) and the JSX entry (esbuild `transform` with `loader: 'jsx'`).

## Likely next tasks / ideas

- Click-to-zoom drill-down (replace root with the clicked node, animate the re-layout).
- Add unit tests under `__tests__/` (currently a stub) using the jsdom approach above.
- Optional: breadcrumb trail, leaf label wrapping, min-tile aggregation into an "Other" tile.
- If adding a property: update `now-ui.json` (manifest), `index.js` (default), and read it in
  `chart.js` — all three.

## Gotcha note (this repo)

The destination is under OneDrive, which can truncate large files written through atomic
rename. If a file looks cut off after an edit, rewrite it via the Linux mount
(`mcp__workspace__bash` heredoc) rather than the Windows Write tool, then re-run the verify and
JSON checks.
