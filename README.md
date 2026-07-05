# D3 Treemap — UI Builder custom component

A configurable **treemap** for ServiceNow UI Builder, rendered with [D3.js](https://d3js.org/).
A treemap encodes a value as the **AREA** of a rectangle, with rectangles nested inside their
parent group — great for showing how a total breaks down across categories (and sub-categories).
The entire look-and-feel is driven by component properties, so page builders can restyle it from
the property panel without touching code. It supports hierarchical OR flat data, four tiling
methods, color-by-group/value/depth, nested-group headers, auto-contrast labels, and emits events
you can hook (click the chart, click/hover a tile to drill in).

- **Component tag:** `x-2114311-treemap-chart-uic`
- **Scope:** `x_2114311_tree_0`
- **Renderer:** Seismic (`@servicenow/ui-renderer-snabbdom`) + D3 v7

> **Sibling of the D3 Line / Column charts.** This component shares their vendor prefix
> (`x_2114311`). It does **not** share their `series` data contract — see
> [Data shape](#data-shape--how-it-differs-from-the-l/column-chart) below for why a treemap
> needs a single `data` tree instead.

---

## Project layout

```
src/x-2114311-treemap-chart-uic/
├── index.js        # createCustomElement: properties, view (stable container), lifecycle handlers
├── chart.js        # drawChart(container, props, dispatch) — the D3 rendering
├── sampleData.js   # SAMPLE_HIERARCHY / SAMPLE_DATA fallback so it renders on drop
├── styles.scss     # host + container sizing, tooltip, hover/focus affordances
└── __tests__/
now-ui.json         # UI Builder manifest: properties + actions exposed to authors
now-cli.json        # CLI build config
package.json        # deps incl. d3
scripts/            # verify_chart.mjs — headless render harness (no instance needed)
server/             # platform-side Script Include + Data Transform sources (see below)
```

D3 owns the SVG imperatively. The Seismic view renders only a single `.tc-root` div; the chart
is (re)drawn from the `COMPONENT_RENDERED` / `COMPONENT_DOM_READY` lifecycle actions, and a
`ResizeObserver` redraws it when the UI Builder slot resizes. This keeps snabbdom's virtual DOM
and D3's direct DOM mutation on separate elements.

---

## Develop & deploy

> Requires the `snc` CLI with the `ui-component` extension and a configured connection profile.

```powershell
# One-time: install the CLI and point it at your instance
npm install -g @servicenow/cli
snc configure profile set            # enter instance URL + credentials

# Install JS deps for this project
npm install

# Local dev harness (hot-reloading), opens example/element.js
snc ui-component develop --open

# Build the deployable update set XML without contacting the instance
snc ui-component generate-update-set --offline

# Build and push the component to the connected instance
snc ui-component deploy
```

After deploying, open **UI Builder -> add component -> "D3 Treemap"** (category _Primitives_).
Bind `data` to a data resource (or leave it empty to show sample data), tune the look-and-feel in
the property panel, and wire the events under the component's **Events** section.

---

## Data shape — how it differs from the line/column chart

This is the important difference. The **line and column charts** take a `series` array:

```jsonc
// line / column chart — N series of points over a shared category (x/value) axis
[
  {
    "name": "Submitted",
    "color": "#2E93fA",
    "data": [
      { "label": "Jan", "value": 44 },
      { "label": "Feb", "value": 55 },
    ],
  },
  {
    "name": "Resolved",
    "color": "#66DA26",
    "data": [
      { "label": "Jan", "value": 35 },
      { "label": "Feb", "value": 41 },
    ],
  },
]
```

That model is built around **axes**: each series is a line/column over the union of category
labels. A treemap has **no axes** — it encodes value as area in a single nested layout. So the
treemap takes ONE `data` property that is **either** of these two auto-detected shapes:

### 1. Hierarchy (nested object)

```jsonc
{
  "name": "root",
  "children": [
    {
      "name": "Hardware",
      "children": [
        { "name": "Laptops", "value": 40 },
        { "name": "Monitors", "value": 22 },
      ],
    },
    { "name": "Software", "value": 30 },
  ],
}
```

Leaves carry `value`; internal nodes **sum their descendants** (you don't supply parent totals).
Leaves may carry an optional `color`. Nest as deep as you like.

### 2. Flat (array)

```jsonc
[
  { "label": "Laptops", "value": 40, "group": "Hardware", "color": "#2E93fA" },
  { "label": "Monitors", "value": 22, "group": "Hardware" },
  { "label": "SaaS", "value": 48, "group": "Software" },
]
```

When a `group` field is present, the component builds a **2-level tree** (group -> leaf);
without it, it's a **single level** of tiles.

**Auto-detection:** an **array** is treated as flat (group optional); an **object with
`children`** is treated as a hierarchy.

|             | Line / Column chart        | Treemap                               |
| ----------- | -------------------------- | ------------------------------------- |
| Property    | `series` (array of series) | `data` (single tree)                  |
| Encodes     | length/position on axes    | **area** of nested rectangles         |
| Axes        | x (category) + y (value)   | none                                  |
| Multi-level | no (flat categories)       | yes (nested hierarchy or group->leaf) |
| Point shape | `{ label, value }`         | leaf `{ name/label, value, color? }`  |

The `server/D3HierarchyData` Script Include produces **both** treemap shapes
(`fromAggregate`/`fromRows` -> flat, `fromHierarchy` -> nested). Leave `data` empty/unbound to
render built-in sample data.

---

## Feeding data from the platform (Data Transform)

You rarely want to hand-write `data`. The recommended pattern turns real table data into the
treemap JSON **on the server** and binds it straight to _Data · Treemap data_. All transform
logic lives in a reusable **Script Include** (`server/D3HierarchyData.js`); a **Transform data
resource** calls it and exposes its output to UI Builder.

```
Table ──GlideAggregate──▶ D3HierarchyData (Script Include) ──data JSON──▶ Transform data resource
                                                                               │ @data.<name>.output
                                                                               ▼
                                                                      Data · Treemap data
```

| File                                          | What it is                                                          |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `server/D3HierarchyData.js`                   | Script Include — `fromAggregate()`, `fromHierarchy()`, `fromRows()` |
| `server/d3-treemap-data.transform.js`         | FLAT data resource script                                           |
| `server/d3-treemap-data.properties.json`      | FLAT data resource inputs                                           |
| `server/d3-treemap-data-tree.transform.js`    | HIERARCHY data resource script                                      |
| `server/d3-treemap-data-tree.properties.json` | HIERARCHY data resource inputs                                      |
| `server/sanity-test.background.js`            | Verify the produced JSON in Scripts - Background                    |

See [`server/README.md`](server/README.md) for the full setup, including the required
**execute ACL** (the data resource silently won't run without it).

---

## Configure properties

Panel labels are **prefixed by section** (`Tiles · …`, `Colors · …`, etc.) to mimic the native
Data Visualization layout. Each entry lists the panel label, the property `name`, the default,
and how to use it.

> **D3 format specifiers** — value labels accept a
> [d3-format](https://github.com/d3/d3-format#locale_format) number string (`.0f`, `,.0f`,
> `$,.0f`, `.0%`, `.2s`).

### Data

| Property     | `name` | Default         | Description                                                                                                                                                                            |
| ------------ | ------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Treemap data | `data` | built-in sample | A hierarchy `{ name, children: [...] }` (leaves carry `value`) OR a flat `[ { label, value, group?, color? } ]`. Auto-detected. Bind to a data resource or leave empty for the sample. |

### Header & border

| Property         | `name`             | Default             |
| ---------------- | ------------------ | ------------------- |
| Title            | `chartTitle`       | `Spend by Category` |
| Title font size  | `titleFontSize`    | `18`                |
| Title color      | `titleColor`       | `#374151`           |
| Width            | `componentWidth`   | `50%`               |
| Padding          | `componentPadding` | `12px`              |
| Background color | `backgroundColor`  | `transparent`       |
| Border color     | `borderColor`      | blank               |
| Border width     | `borderWidth`      | `0`                 |
| Border radius    | `borderRadius`     | `0`                 |

### Display

| Property                | `name`                       | Default                  | Description                                                                            |
| ----------------------- | ---------------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| Chart height (px)       | `chartHeight`                | `360`                    | Height of the chart in pixels.                                                         |
| Animate                 | `animate`                    | `true`                   | Tiles fade + scale in from their center on first render / data change.                 |
| Animation duration (ms) | `animationDuration`          | `800`                    |                                                                                        |
| Animation easing        | `animationEasing`            | `Cubic out`              | Linear, Cubic out, Cubic in-out, Quad out, Exp out, Back out, Bounce out, Elastic out. |
| Base font family        | `fontFamily`                 | blank                    | Inherit from the page when blank.                                                      |
| Drop shadow             | `dropShadow`                 | `false`                  | Soft drop shadow on the tiles.                                                         |
| Shadow color / blur     | `shadowColor` / `shadowBlur` | `rgba(0,0,0,0.25)` / `4` | When drop shadow on.                                                                   |
| Hover highlight         | `hoverHighlight`             | `true`                   | Brighten + outline the hovered tile.                                                   |
| Dim others on hover     | `hoverDimOthers`             | `false`                  | Fade the other tiles while hovering one.                                               |

### Tiles

| Property               | `name`             | Default            | Description                                                                                                                                                                                                         |
| ---------------------- | ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tiling method          | `tileMethod`       | `Squarify`         | How each rectangle is subdivided: **Squarify** (square-ish, best general choice), **Binary** (balanced tree), **Slice & dice** (alternating splits, good for ordered data), **Resquarify** (stable across redraws). |
| Inner padding (px)     | `tilePadding`      | `2`                | Gap between sibling tiles.                                                                                                                                                                                          |
| Group header room (px) | `tilePaddingTop`   | `18`               | Top padding reserved in each parent group for its header (nested data only).                                                                                                                                        |
| Corner radius (px)     | `tileCornerRadius` | `2`                | Rounded tile corners.                                                                                                                                                                                               |
| Stroke color           | `tileStroke`       | `#ffffff`          | Border around each tile; blank = none.                                                                                                                                                                              |
| Stroke width (px)      | `tileStrokeWidth`  | `1`                | Border thickness; `0` = none.                                                                                                                                                                                       |
| Sort                   | `sortTiles`        | `Value descending` | Order siblings before tiling: None / Value descending / Value ascending.                                                                                                                                            |
| Max depth              | `maxDepth`         | `0`                | Flatten beyond this depth (descendants merge into the ancestor at this level). `0` = all levels.                                                                                                                    |

### Colors

| Property                     | `name`             | Default     | Description                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Color mode                   | `colorMode`        | `By group`  | **By group** (top-level groups get categorical colors; leaves inherit a slight per-sibling lightness variation), **By value** (sequential scale over leaf value), **By depth** (categorical by nesting depth), **Custom** (each node's own `color`, falling back to By group). |
| Categorical scheme           | `colorScheme`      | `Custom`    | A built-in D3 categorical scheme (Category10, Tableau10, Set2, Set3, Paired, Dark2, Pastel1, Accent) or Custom — drives By group / By depth.                                                                                                                                   |
| Color palette                | `colorPalette`     | 8-color set | JSON array used when scheme is Custom.                                                                                                                                                                                                                                         |
| Sequential scheme (By value) | `valueColorScheme` | `Blues`     | Sequential interpolator for By value: Blues, Greens, Oranges, Purples, Reds, Greys, Viridis, Magma, Inferno, Plasma, Cividis, Turbo, Warm, Cool, YlGnBu, YlOrRd.                                                                                                               |
| Use node colors              | `useSeriesColors`  | `true`      | Use a leaf/node's own `color` (overrides the color mode for that node).                                                                                                                                                                                                        |

### Labels

| Property                  | `name`                | Default        | Description                                                                            |
| ------------------------- | --------------------- | -------------- | -------------------------------------------------------------------------------------- |
| Show group headers        | `showGroupHeaders`    | `true`         | Draw parent group names in the reserved top padding (nested data only).                |
| Group header font size    | `groupHeaderFontSize` | `12`           |                                                                                        |
| Group header color        | `groupHeaderColor`    | `#374151`      |                                                                                        |
| Tile label mode           | `labelMode`           | `Name + value` | None / Name / Name + value / Value.                                                    |
| Value format              | `labelFormat`         | blank          | D3 number format for tile/header values.                                               |
| Tile font size            | `labelFontSize`       | `12`           |                                                                                        |
| Tile text color           | `labelColor`          | blank          | **Blank = auto-pick black or white per tile** for best contrast against the tile fill. |
| Hide below tile size (px) | `labelMinTileSize`    | `34`           | Hide labels on tiles smaller than this (px) to avoid clutter.                          |

### Legend

| Property    | `name`           | Default                         |
| ----------- | ---------------- | ------------------------------- |
| Show legend | `showLegend`     | `true` (top-level groups)       |
| Position    | `legendPosition` | `Bottom` (Top / Right / Bottom) |
| Font size   | `legendFontSize` | `12`                            |

### Tooltip

| Property                | `name`                                   | Default                           | Description                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show tooltip            | `showTooltip`                            | `true`                            |                                                                                                                                                                                                                                               |
| Template                | `tooltipTemplate`                        | `<strong>{name}</strong>…`        | Tokens: `{name}`, `{value}`, `{formattedValue}`, `{group}`, `{path}` (ancestors joined by `/`), `{depth}`, `{percent}` (of total), `{swatch}`, `{color}`, plus any custom node key. Interpolated values are HTML-escaped (except `{swatch}`). |
| Follow cursor           | `tooltipFollowCursor`                    | `true`                            |                                                                                                                                                                                                                                               |
| Background / Text color | `tooltipBackground` / `tooltipTextColor` | `rgba(17,24,39,0.92)` / `#ffffff` |                                                                                                                                                                                                                                               |
| Font size               | `tooltipFontSize`                        | `12`                              |                                                                                                                                                                                                                                               |

---

## colorMode & tileMethod behaviors

- **colorMode = byGroup** — each top-level group is assigned a categorical color (from the
  scheme/palette). Leaves within a group share that base color with a small per-sibling lightness
  variation so adjacent leaves stay distinguishable. A node's own `color` still wins when _Use
  node colors_ is on.
- **colorMode = byValue** — a sequential scale (`valueColorScheme`) maps the smallest leaf value
  to the lightest color and the largest to the darkest. Best for emphasizing magnitude.
- **colorMode = byDepth** — color by nesting depth (categorical), useful to read structure.
- **colorMode = custom** — use each node's own `color`; nodes without one fall back to byGroup.
- **tileMethod** — `squarify` (square-ish tiles, easiest to compare), `binary` (recursively
  splits to balance the subtree), `sliceDice` (alternates horizontal/vertical splits — preserves
  input order, good for ordered/time data), `resquarify` (squarify variant that keeps tiles in
  stable positions across redraws).

**Auto-contrast labels:** when _Tile text color_ (`labelColor`) is blank, each tile's label is
drawn in black or white based on the tile fill's luminance, so text stays readable on any color.

---

## Events (actions)

| Action          | When                                    | Payload                                                                      |
| --------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `CHART_CLICKED` | Click the chart background (not a tile) | `tileCount`                                                                  |
| `TILE_CLICKED`  | Click a tile (drill-in)                 | `name`, `value`, `path` (ancestors joined by `/`), `group`, `depth`, `color` |
| `TILE_HOVERED`  | Hover a tile                            | `name`, `value`, `group`                                                     |

In UI Builder, add an event handler on `TILE_CLICKED` to navigate, open a record, or set a page
parameter using the payload of the clicked tile (`event.stopPropagation()` is called so it doesn't
also fire `CHART_CLICKED`).

---

## Verify without an instance

`chart.js` imports only d3 submodules, so it can be bundled and run headless:

```bash
node scripts/verify_chart.mjs --chart src/x-2114311-treemap-chart-uic/chart.js
```

The harness bundles the renderer with real d3 and exercises it in jsdom across 40+ scenarios
(both data shapes, every tiling method, every color mode, group headers on/off, each label mode,
maxDepth caps, sort variants, empty/single/all-zero data, deep nesting, animate off). It exits
non-zero if any scenario throws.
