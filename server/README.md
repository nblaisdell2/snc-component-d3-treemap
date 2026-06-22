# server/ — platform-side data binding for the D3 Treemap

These files are the version-controlled **source** for the platform records that feed real
data into the component. They are **not** shipped by `snc ui-component deploy` — create them
as records on the instance.

```
Table ──GlideAggregate──▶ D3HierarchyData (Script Include) ──data JSON──▶ Transform data resource
                                                                               │ @data.<name>.output
                                                                               ▼
                                                                      Data · Treemap data
```

## Files

| File | What it is |
|---|---|
| `D3HierarchyData.js` | Script Include — `fromAggregate()`, `fromHierarchy()`, `fromRows()` (ES5) |
| `d3-treemap-data.transform.js` | FLAT data resource script (delegates to `fromAggregate`) |
| `d3-treemap-data.properties.json` | FLAT data resource inputs (bare array) |
| `d3-treemap-data-tree.transform.js` | HIERARCHY data resource script (delegates to `fromHierarchy`) |
| `d3-treemap-data-tree.properties.json` | HIERARCHY data resource inputs (bare array) |
| `sanity-test.background.js` | Background script to log the produced JSON before wiring it in |

## The two output shapes

The component auto-detects which it received:

- **FLAT** (`fromAggregate` / `fromRows`): `[ { label, value, group?, color? } ]`. With a
  `groupField`, each tile carries a `group` and the component builds a 2-level treemap;
  without it, a single level of tiles.
- **HIERARCHY** (`fromHierarchy`): `{ name, children: [ { name, children: [ { name, value,
  color? } ] } ] }`. Leaves carry `value`; the component sums internal nodes for area.

## Setup (one time)

1. **Create the Script Include.** *System Definition -> Script Includes -> New*. Name it
   `D3HierarchyData`, set **Accessible from = All application scopes**, **Client callable =
   false**, and paste `D3HierarchyData.js`. Save.
2. **Create a Transform data resource.** In UI Builder: **Add data resource -> Transform**
   (creates a `sys_ux_data_broker_transform` record), **Mutates server data** unchecked.
   - For a flat/grouped treemap: name it e.g. `D3 Treemap Data`, paste
     `d3-treemap-data.transform.js` into **Script**, and the **bare JSON array** from
     `d3-treemap-data.properties.json` into **Properties** (must be just the `[ ... ]` array —
     wrapping it in an object or adding a `"readOnly"` entry leaves the config panel blank).
   - For a nested treemap: do the same with the `-tree` pair (e.g. name
     `D3 Treemap Data (Hierarchy)`).
3. **Create the execute ACL** (required — the resource won't run without it):
   - Get the data broker's **sys_id** (`sys_ux_data_broker_transform.list` -> open -> copy sys_id).
   - **Elevate roles:** profile menu -> **Elevate role** -> **security_admin**.
   - **System Security -> Access Control (ACL) -> New**: **Type** = `ux_data_broker`,
     **Operation** = `execute`, **Name** = paste the data broker **sys_id** (click the padlock
     to switch Name to free text), **Active** = true, and add one permissive criterion (e.g.
     Security Attribute **`UserIsAuthenticated`**). **Submit**, then reload UI Builder.
   - Each data resource needs its **own** execute ACL.

## Use it

- **Bind:** *Data · Treemap data* -> `@data.d3_treemap_data.output` (use your resource's name).
- **Flat, single level — incidents by priority:** `table` = `incident`,
  `categoryField` = `priority`, `metric` = `count`. -> one tile per priority.
- **Flat, grouped — assignment_group within priority:** add `groupField` = `priority`,
  `categoryField` = `assignment_group`. -> a 2-level treemap.
- **Nested (hierarchy) — same two levels:** use the `-tree` resource with `groupField` =
  `priority` (level 1) and `categoryField` = `assignment_group` (level 2/leaf).

`fromAggregate(cfg)` inputs: `table`, `filter`, `categoryField`, `groupField`, `metric`
(`count`/`sum`/`avg`/`min`/`max`), `valueField`, `useDisplayValue`, `colors`, `maxCategories`,
`sort`. `fromHierarchy(cfg)` inputs: `table`, `filter`, `groupField`, `categoryField`,
`metric`, `valueField`, `useDisplayValue`, `rootName`, `colors`, `sort`.

### Reshape rows you already have

```js
function transform(input) {
  return new global.D3HierarchyData().fromRows(input.rows, {
    categoryField: 'cat', groupField: 'grp', valueField: 'amount', sort: 'value-desc'
  });
}
```

## Verify

Run `sanity-test.background.js` in *Scripts - Background* (Global scope) to log the treemap
JSON (flat + grouped + nested) before wiring it into a page.

> These are **platform records** (Script Include / data resource / ACL), not part of the
> component bundle. The `server/` files are the version-controlled source.
