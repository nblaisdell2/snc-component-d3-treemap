/**
 * D3HierarchyData — Script Include (global, accessible from all application scopes,
 * Client callable = false)
 * ---------------------------------------------------------------------------
 * Reusable transform that turns platform data into the JSON shape expected by
 * the x-1295779-treemap-chart-uic component's "Data · Treemap data" property.
 *
 * The treemap accepts TWO shapes (auto-detected by the component):
 *
 *   FLAT (array):
 *     [ { label: "Laptops", value: 40, group: "Hardware" }, ... ]
 *     A `group` field (optional) makes the component build a 2-level tree.
 *
 *   HIERARCHY (object):
 *     { name: "root", children: [ { name: "Hardware",
 *         children: [ { name: "Laptops", value: 40 } ] } ] }
 *     Leaves carry `value`; internal nodes sum their descendants.
 *
 * Three entry points:
 *   - fromAggregate(cfg)  : FLAT [{label,value,group?}] via GlideAggregate
 *                           grouped by categoryField (+ optional groupField).
 *   - fromHierarchy(cfg)  : HIERARCHY {name,children:[...]} from a TWO-level
 *                           grouping groupField -> categoryField.
 *   - fromRows(rows, cfg) : reshape an array of plain objects to FLAT
 *                           [{label,value,group?}].
 *
 * Helper patterns (_str, _blank, _parseColors, _colorFor, _sortCategories,
 * _topCategories, _readField) mirror the D3ChartData Script Include used by the
 * line/column charts so the family stays consistent.
 *
 * Written in ES5 for broad scoped/global compatibility.
 */
var D3HierarchyData = Class.create();
D3HierarchyData.prototype = {
	initialize: function () {},

	/**
	 * Aggregate a table into a FLAT array of tiles.
	 * cfg: {
	 *   table, filter, categoryField, groupField?, metric (count|sum|avg|min|max),
	 *   valueField (required if metric!=count), useDisplayValue (default true),
	 *   colors, maxCategories?, sort?
	 * }
	 * Returns: [ { label, value, group?, color? }, ... ]
	 */
	fromAggregate: function (cfg) {
		cfg = cfg || {};
		var table = this._str(cfg.table);
		var categoryField = this._str(cfg.categoryField);
		if (!table || !categoryField) {
			return [];
		}
		var groupField = this._str(cfg.groupField);
		var metric = (this._str(cfg.metric) || "count").toLowerCase();
		var valueField = this._str(cfg.valueField);
		var useDisplay =
			cfg.useDisplayValue !== false && cfg.useDisplayValue !== "false";
		if (metric !== "count" && !valueField) {
			return []; // sum/avg/min/max need a numeric field
		}

		var ga = new GlideAggregate(table);
		if (this._str(cfg.filter)) {
			ga.addEncodedQuery(cfg.filter);
		}
		if (groupField) {
			ga.groupBy(groupField);
		}
		ga.groupBy(categoryField);
		if (metric === "count") {
			ga.addAggregate("COUNT");
		} else {
			ga.addAggregate(metric.toUpperCase(), valueField);
		}
		ga.orderBy(categoryField);
		ga.query();

		var rows = [];
		while (ga.next()) {
			var catLabel = useDisplay
				? ga.getDisplayValue(categoryField)
				: ga.getValue(categoryField);
			var groupLabel = "";
			if (groupField) {
				groupLabel = useDisplay
					? ga.getDisplayValue(groupField)
					: ga.getValue(groupField);
			}
			var value;
			if (metric === "count") {
				value = parseInt(ga.getAggregate("COUNT"), 10);
			} else {
				value = parseFloat(ga.getAggregate(metric.toUpperCase(), valueField));
			}
			rows.push({
				label: this._blank(catLabel),
				group: groupField ? this._blank(groupLabel) : null,
				value: isNaN(value) ? 0 : value,
			});
		}
		return this._buildFlat(rows, cfg);
	},

	/**
	 * Build a nested HIERARCHY object from a TWO-level grouping.
	 * cfg: {
	 *   table, filter, groupField (level 1), categoryField (level 2/leaf),
	 *   metric, valueField, useDisplayValue, rootName?, colors, sort?
	 * }
	 * Returns: { name, children: [ { name, children: [ { name, value, color? } ] } ] }
	 */
	fromHierarchy: function (cfg) {
		cfg = cfg || {};
		var table = this._str(cfg.table);
		var groupField = this._str(cfg.groupField);
		var categoryField = this._str(cfg.categoryField);
		var rootName = this._str(cfg.rootName) || "root";
		if (!table || !groupField || !categoryField) {
			return { name: rootName, children: [] };
		}
		// reuse the flat aggregator (grouped), then nest it.
		var flatCfg = {
			table: table,
			filter: cfg.filter,
			categoryField: categoryField,
			groupField: groupField,
			metric: cfg.metric,
			valueField: cfg.valueField,
			useDisplayValue: cfg.useDisplayValue,
			colors: cfg.colors,
			sort: cfg.sort,
		};
		var flat = this.fromAggregate(flatCfg);
		return this._nest(flat, rootName, cfg);
	},

	/**
	 * Reshape an array of plain objects into a FLAT array of tiles.
	 * cfg: { categoryField, groupField?, valueField, metric?, colors, sort?, maxCategories? }
	 * Returns: [ { label, value, group?, color? }, ... ]
	 */
	fromRows: function (rows, cfg) {
		cfg = cfg || {};
		rows = rows || [];
		var categoryField = this._str(cfg.categoryField);
		var groupField = this._str(cfg.groupField);
		var valueField = this._str(cfg.valueField);

		var collected = [];
		for (var i = 0; i < rows.length; i++) {
			var r = rows[i] || {};
			var catLabel = this._readField(r, categoryField);
			var groupLabel = groupField ? this._readField(r, groupField) : null;
			var value = parseFloat(this._readField(r, valueField));
			collected.push({
				label: this._blank(catLabel),
				group: groupField ? this._blank(groupLabel) : null,
				value: isNaN(value) ? 0 : value,
			});
		}
		return this._buildFlat(
			collected,
			cfg,
			(this._str(cfg.metric) || "sum").toLowerCase(),
		);
	},

	// ----- internals -------------------------------------------------------

	/**
	 * Combine duplicate (group,label) rows, sort, top-N, and attach colors.
	 * Returns the flat tile array.
	 */
	_buildFlat: function (rows, cfg, dupMetric) {
		var order = [];
		var seen = {};
		var cells = {};
		var counts = {};
		var groups = {};
		var i;

		for (i = 0; i < rows.length; i++) {
			var row = rows[i];
			var key = (row.group === null ? "" : row.group) + " " + row.label;
			if (!seen[key]) {
				seen[key] = true;
				order.push(key);
				cells[key] = row.value;
				counts[key] = 1;
				groups[key] = row.group;
			} else {
				var m = dupMetric || "sum";
				if (m === "min") {
					cells[key] = Math.min(cells[key], row.value);
				} else if (m === "max") {
					cells[key] = Math.max(cells[key], row.value);
				} else {
					cells[key] += row.value;
				}
				counts[key]++;
			}
		}
		if (dupMetric === "avg") {
			for (var k in cells) {
				if (cells.hasOwnProperty(k)) {
					cells[k] = cells[k] / counts[k];
				}
			}
		}

		// materialize tiles preserving discovery order
		var tiles = [];
		for (i = 0; i < order.length; i++) {
			var ok = order[i];
			var parts = ok.split(" ");
			var grp = groups[ok];
			var tile = { label: parts[1], value: cells[ok] };
			if (grp !== null && grp !== undefined && grp !== "") {
				tile.group = grp;
			}
			tiles.push(tile);
		}

		// sort by value if requested
		this._sortTiles(tiles, cfg);

		// top-N by value
		var max = parseInt(cfg.maxCategories, 10);
		if (max && tiles.length > max) {
			var ranked = tiles.slice();
			ranked.sort(function (a, b) {
				return b.value - a.value;
			});
			var keep = {};
			for (var r2 = 0; r2 < max && r2 < ranked.length; r2++) {
				keep[this._tileKey(ranked[r2])] = true;
			}
			var kept = [];
			for (var t = 0; t < tiles.length; t++) {
				if (keep[this._tileKey(tiles[t])]) {
					kept.push(tiles[t]);
				}
			}
			tiles = kept;
		}

		// attach colors (array by order, or map keyed by label/group)
		var parsedColors = this._parseColors(cfg.colors);
		if (parsedColors) {
			for (var c = 0; c < tiles.length; c++) {
				var col = this._colorFor(parsedColors, tiles[c].label, c);
				if (!col && tiles[c].group) {
					col = this._colorFor(parsedColors, tiles[c].group, c);
				}
				if (col) {
					tiles[c].color = col;
				}
			}
		}
		return tiles;
	},

	/** Nest a flat tile array into a 2-level hierarchy object. */
	_nest: function (flat, rootName, cfg) {
		var order = [];
		var byGroup = {};
		var i;
		for (i = 0; i < flat.length; i++) {
			var t = flat[i];
			var g =
				t.group === undefined || t.group === null || t.group === ""
					? "(ungrouped)"
					: t.group;
			if (!byGroup[g]) {
				byGroup[g] = [];
				order.push(g);
			}
			var leaf = { name: t.label, value: t.value };
			if (t.color) {
				leaf.color = t.color;
			}
			byGroup[g].push(leaf);
		}
		var children = [];
		for (i = 0; i < order.length; i++) {
			children.push({ name: order[i], children: byGroup[order[i]] });
		}
		return { name: rootName, children: children };
	},

	_tileKey: function (t) {
		return (
			(t.group === undefined || t.group === null ? "" : t.group) + " " + t.label
		);
	},

	_sortTiles: function (tiles, cfg) {
		var sort = (this._str(cfg.sort) || "").toLowerCase();
		if (!sort || sort === "none") {
			return;
		}
		var byValue = sort.indexOf("value") > -1;
		var desc = sort.indexOf("desc") > -1;
		if (byValue) {
			tiles.sort(function (a, b) {
				return a.value - b.value;
			});
		} else {
			tiles.sort(function (a, b) {
				return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
			});
		}
		if (desc) {
			tiles.reverse();
		}
	},

	// kept for parity with D3ChartData helper surface
	_sortCategories: function (categories, cells, seriesOrder, cfg) {
		var sort = (this._str(cfg.sort) || "").toLowerCase();
		if (!sort || sort === "none") {
			return;
		}
		var byValue = sort.indexOf("value") > -1;
		var desc = sort.indexOf("desc") > -1;
		if (byValue) {
			var total = this._totals(categories, cells, seriesOrder);
			categories.sort(function (a, b) {
				return total[a] - total[b];
			});
		} else {
			categories.sort(function (a, b) {
				return a < b ? -1 : a > b ? 1 : 0;
			});
		}
		if (desc) {
			categories.reverse();
		}
	},

	_topCategories: function (categories, cells, seriesOrder, n) {
		var total = this._totals(categories, cells, seriesOrder);
		var ranked = categories.slice();
		ranked.sort(function (a, b) {
			return total[b] - total[a];
		});
		var keep = {};
		for (var i = 0; i < n && i < ranked.length; i++) {
			keep[ranked[i]] = true;
		}
		var result = [];
		for (var j = 0; j < categories.length; j++) {
			if (keep[categories[j]]) {
				result.push(categories[j]);
			}
		}
		return result;
	},

	_totals: function (categories, cells, seriesOrder) {
		var total = {};
		for (var ci = 0; ci < categories.length; ci++) {
			var c = categories[ci];
			var t = 0;
			for (var k = 0; k < seriesOrder.length; k++) {
				var v = cells[seriesOrder[k]] ? cells[seriesOrder[k]][c] : 0;
				if (v) {
					t += v;
				}
			}
			total[c] = t;
		}
		return total;
	},

	_parseColors: function (colors) {
		if (!colors) {
			return null;
		}
		if (typeof colors === "string") {
			var s = colors.replace(/^\s+|\s+$/g, "");
			if (!s) {
				return null;
			}
			try {
				colors = JSON.parse(s);
			} catch (e) {
				colors = s.split(",");
				for (var i = 0; i < colors.length; i++) {
					colors[i] = colors[i].replace(/^\s+|\s+$/g, "");
				}
			}
		}
		if (Object.prototype.toString.call(colors) === "[object Array]") {
			return { type: "array", value: colors };
		}
		if (typeof colors === "object") {
			return { type: "map", value: colors };
		}
		return null;
	},

	_colorFor: function (parsed, label, index) {
		if (!parsed) {
			return null;
		}
		if (parsed.type === "array") {
			if (!parsed.value.length) {
				return null;
			}
			return parsed.value[index % parsed.value.length];
		}
		if (parsed.type === "map") {
			return parsed.value[label] || null;
		}
		return null;
	},

	_readField: function (obj, field) {
		if (!field) {
			return "";
		}
		var v = obj[field];
		if (v && typeof v === "object") {
			if (typeof v.getDisplayValue === "function") {
				return v.getDisplayValue();
			}
			if (v.displayValue !== undefined) {
				return v.displayValue;
			}
			if (v.value !== undefined) {
				return v.value;
			}
		}
		return v === undefined || v === null ? "" : v;
	},

	_str: function (v) {
		return v === undefined || v === null
			? ""
			: ("" + v).replace(/^\s+|\s+$/g, "");
	},

	_blank: function (v) {
		var s = v === undefined || v === null ? "" : "" + v;
		return s === "" ? "(empty)" : s;
	},

	type: "D3HierarchyData",
};
