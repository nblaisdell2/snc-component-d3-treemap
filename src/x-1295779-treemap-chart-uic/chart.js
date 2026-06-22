/**
 * D3 treemap renderer.
 *
 * `drawChart` fully (re)renders the chart into `container` on every call. It owns
 * the SVG subtree imperatively while the Seismic/snabbdom view only provides the
 * stable host container. Re-rendering on each property change keeps the
 * look-and-feel fully driven by the UI Builder property panel.
 *
 * A treemap encodes value as AREA: each rectangle's size is proportional to its
 * value, and rectangles nest inside their parent. There are NO axes. The input
 * `data` is a single tree, accepted as either a nested hierarchy object or a
 * flat (optionally grouped) array — see normalizeData below.
 *
 * We import the specific d3 functions we use as NAMED imports (rather than
 * `import * as d3`): the ServiceNow production build tree-shakes a namespace
 * object that's passed around, which would strip methods like `select`.
 *
 * No d3-transition — it gets tree-shaken out of the prod bundle. The tile-in
 * animation is driven by requestAnimationFrame (fade + scale from the tile
 * center).
 *
 * dispatch(actionName, payload) emits the custom actions declared in now-ui.json
 * (CHART_CLICKED / TILE_CLICKED / TILE_HOVERED) so page authors can hook them as
 * event handlers in UI Builder.
 */
import { select } from 'd3-selection';
import {
	hierarchy, treemap,
	treemapSquarify, treemapBinary, treemapSliceDice, treemapResquarify
} from 'd3-hierarchy';
import { scaleSequential, scaleOrdinal } from 'd3-scale';
import {
	schemeCategory10, schemeTableau10, schemeSet2, schemeSet3,
	schemePaired, schemeDark2, schemePastel1, schemeAccent,
	interpolateBlues, interpolateGreens, interpolateOranges, interpolatePurples,
	interpolateReds, interpolateGreys, interpolateViridis, interpolateMagma,
	interpolateInferno, interpolatePlasma, interpolateCividis, interpolateTurbo,
	interpolateWarm, interpolateCool, interpolateYlGnBu, interpolateYlOrRd
} from 'd3-scale-chromatic';
import { format } from 'd3-format';
import { color } from 'd3-color';
import {
	easeLinear, easeCubicOut, easeCubicInOut, easeQuadOut,
	easeExpOut, easeBackOut, easeBounceOut, easeElasticOut
} from 'd3-ease';

// Named categorical schemes selectable via the `colorScheme` property.
const COLOR_SCHEMES = {
	category10: schemeCategory10,
	tableau10: schemeTableau10,
	set2: schemeSet2,
	set3: schemeSet3,
	paired: schemePaired,
	dark2: schemeDark2,
	pastel1: schemePastel1,
	accent: schemeAccent
};

// Sequential interpolators selectable via the `valueColorScheme` property.
const SEQ_SCHEMES = {
	blues: interpolateBlues,
	greens: interpolateGreens,
	oranges: interpolateOranges,
	purples: interpolatePurples,
	reds: interpolateReds,
	greys: interpolateGreys,
	viridis: interpolateViridis,
	magma: interpolateMagma,
	inferno: interpolateInferno,
	plasma: interpolatePlasma,
	cividis: interpolateCividis,
	turbo: interpolateTurbo,
	warm: interpolateWarm,
	cool: interpolateCool,
	ylGnBu: interpolateYlGnBu,
	ylOrRd: interpolateYlOrRd
};

// Easing curves selectable via the `animationEasing` property.
const EASINGS = {
	linear: easeLinear,
	cubicOut: easeCubicOut,
	cubicInOut: easeCubicInOut,
	quadOut: easeQuadOut,
	expOut: easeExpOut,
	backOut: easeBackOut,
	bounceOut: easeBounceOut,
	elasticOut: easeElasticOut
};

// Tiling methods selectable via the `tileMethod` property.
const TILE_METHODS = {
	squarify: treemapSquarify,
	binary: treemapBinary,
	sliceDice: treemapSliceDice,
	resquarify: treemapResquarify
};

const num = (v, fallback) => {
	const n = typeof v === 'string' ? parseFloat(v) : v;
	return Number.isFinite(n) ? n : fallback;
};

const isBlank = (v) => v === undefined || v === null || v === '';

/**
 * Normalize the `data` prop into a nested hierarchy object { name, children?,
 * value?, color? }. Accepts:
 *   - an array (flat): [ { label|name, value, group?, color? } ]. With a group
 *     field present, builds a 2-level tree group -> leaf; otherwise a flat root.
 *   - an object with children: treated as a hierarchy as-is.
 *   - a leaf-ish object { name/label, value }: wrapped into a single-tile root.
 * Returns null when there's nothing renderable.
 */
const normalizeData = (data) => {
	if (Array.isArray(data)) {
		const rows = data
			.filter((d) => d && typeof d === 'object')
			.map((d) => ({
				name: String(d.label !== undefined ? d.label : (d.name !== undefined ? d.name : '')),
				value: num(d.value, 0),
				group: isBlank(d.group) ? null : String(d.group),
				color: isBlank(d.color) ? null : String(d.color),
				_raw: d
			}));
		if (!rows.length) return null;
		const grouped = rows.some((r) => r.group !== null);
		if (!grouped) {
			return {
				name: 'root',
				children: rows.map((r) => {
					const leaf = { name: r.name, value: r.value, _raw: r._raw };
					if (r.color) leaf.color = r.color;
					return leaf;
				})
			};
		}
		// build group -> leaf
		const order = [];
		const byGroup = {};
		rows.forEach((r) => {
			const g = r.group || '(ungrouped)';
			if (!byGroup[g]) { byGroup[g] = []; order.push(g); }
			const leaf = { name: r.name, value: r.value, _raw: r._raw };
			if (r.color) leaf.color = r.color;
			byGroup[g].push(leaf);
		});
		return {
			name: 'root',
			children: order.map((g) => ({ name: g, children: byGroup[g] }))
		};
	}
	if (data && typeof data === 'object') {
		if (Array.isArray(data.children) && data.children.length) {
			return data;
		}
		// a bare leaf-ish object
		if (data.value !== undefined && (data.name !== undefined || data.label !== undefined)) {
			return {
				name: 'root',
				children: [{
					name: String(data.name !== undefined ? data.name : data.label),
					value: num(data.value, 0),
					color: isBlank(data.color) ? undefined : String(data.color),
					_raw: data
				}]
			};
		}
	}
	return null;
};

/** Relative luminance (0..1) of a CSS color, for auto-contrast text. */
const luminance = (cssColor) => {
	const c = color(cssColor);
	if (!c) return 1;
	const rgb = c.rgb();
	const lin = (ch) => {
		const s = ch / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
};

/** Pick black or white text for best contrast against a fill. */
const autoTextColor = (fill) => (luminance(fill) > 0.5 ? '#1f2937' : '#ffffff');

export function drawChart(container, props, dispatch) {
	// ----- normalize props (values may arrive as strings from the panel) -----
	const tree = normalizeData(props.data);

	const backgroundColor = props.backgroundColor || 'transparent';
	const chartTitle = props.chartTitle || '';
	const titleColor = props.titleColor || '#374151';
	const titleFontSize = num(props.titleFontSize, 18);
	const fontFamily = props.fontFamily || 'inherit';

	const tileMethodKey = ['squarify', 'binary', 'sliceDice', 'resquarify'].includes(props.tileMethod) ? props.tileMethod : 'squarify';
	const tileMethod = TILE_METHODS[tileMethodKey] || treemapSquarify;
	const tilePadding = Math.max(0, num(props.tilePadding, 2));
	const tilePaddingTop = Math.max(0, num(props.tilePaddingTop, 18));
	const tileCornerRadius = Math.max(0, num(props.tileCornerRadius, 2));
	const tileStroke = props.tileStroke || '';
	const tileStrokeWidth = Math.max(0, num(props.tileStrokeWidth, 1));
	const sortTiles = ['none', 'value-desc', 'value-asc'].includes(props.sortTiles) ? props.sortTiles : 'value-desc';
	const maxDepth = Math.max(0, Math.round(num(props.maxDepth, 0)));

	const colorMode = ['byGroup', 'byValue', 'byDepth', 'custom'].includes(props.colorMode) ? props.colorMode : 'byGroup';
	const colorScheme = props.colorScheme || 'custom';
	const valueColorScheme = SEQ_SCHEMES[props.valueColorScheme] ? props.valueColorScheme : 'blues';
	const palette = Array.isArray(props.colorPalette) && props.colorPalette.length
		? props.colorPalette
		: ['#2E93fA', '#66DA26', '#546E7A', '#E91E63', '#FF9800', '#9C27B0', '#00B8D9', '#FFC107'];
	const categoricalRange = (colorScheme !== 'custom' && COLOR_SCHEMES[colorScheme]) ? COLOR_SCHEMES[colorScheme] : palette;
	const useNodeColors = props.useSeriesColors !== false;

	const showGroupHeaders = props.showGroupHeaders !== false;
	const groupHeaderFontSize = num(props.groupHeaderFontSize, 12);
	const groupHeaderColor = props.groupHeaderColor || '#374151';

	const labelMode = ['none', 'name', 'name+value', 'value'].includes(props.labelMode) ? props.labelMode : 'name+value';
	const labelFontSize = num(props.labelFontSize, 12);
	const labelColorProp = props.labelColor || '';
	const labelMinTileSize = Math.max(0, num(props.labelMinTileSize, 34));

	const showLegend = props.showLegend !== false;
	const legendPosition = ['top', 'right', 'bottom'].includes(props.legendPosition) ? props.legendPosition : 'bottom';
	const legendFontSize = num(props.legendFontSize, 12);

	const dropShadow = props.dropShadow === true;
	const shadowBlur = Math.max(0, num(props.shadowBlur, 4));
	const hoverHighlight = props.hoverHighlight !== false;
	const hoverDimOthers = props.hoverDimOthers === true;

	const animationDuration = Math.max(0, num(props.animationDuration, 800));
	const animate = props.animate !== false && animationDuration > 0;
	const easeFn = EASINGS[props.animationEasing] || easeCubicOut;

	const showTooltip = props.showTooltip !== false;
	const tooltipTemplate = isBlank(props.tooltipTemplate)
		? '<strong>{name}</strong><br/>{swatch}{formattedValue} ({percent})'
		: props.tooltipTemplate;
	const tooltipFollowCursor = props.tooltipFollowCursor !== false;
	const tooltipBackground = props.tooltipBackground || 'rgba(17,24,39,0.92)';
	const tooltipTextColor = props.tooltipTextColor || '#ffffff';
	const tooltipFontSize = num(props.tooltipFontSize, 12);

	const makeFmt = (spec) => {
		if (isBlank(spec)) return (n) => `${n}`;
		try { return format(spec); } catch (e) { return (n) => `${n}`; }
	};
	const fmt = makeFmt(props.labelFormat);

	// ----- clear previous render -----
	const root = select(container);
	root.selectAll('*').remove();

	// ----- dimensions -----
	const rect = container.getBoundingClientRect();
	const measuredW = Math.floor(rect.width) || container.clientWidth || 0;
	const width = Math.max(220, measuredW || 600);
	const height = Math.max(120, num(props.chartHeight, 360));

	// ----- root svg + click target -----
	const svg = root
		.append('svg')
		.attr('class', 'tc-svg')
		.attr('width', width)
		.attr('height', height)
		.attr('viewBox', `0 0 ${width} ${height}`)
		.style('font-family', fontFamily)
		.style('display', 'block');

	svg.append('rect')
		.attr('class', 'tc-bg')
		.attr('width', width)
		.attr('height', height)
		.attr('fill', backgroundColor)
		.on('click', () => {
			dispatch('CHART_CLICKED', { tileCount: 0 });
		});

	if (dropShadow) {
		const defs = svg.append('defs');
		const filter = defs.append('filter')
			.attr('id', 'tc-shadow')
			.attr('x', '-30%').attr('y', '-30%')
			.attr('width', '160%').attr('height', '160%');
		filter.append('feDropShadow')
			.attr('dx', 0).attr('dy', 1)
			.attr('stdDeviation', shadowBlur)
			.attr('flood-color', props.shadowColor || 'rgba(0,0,0,0.25)');
	}

	// ----- build the d3 hierarchy -----
	let rootNode = null;
	if (tree) {
		rootNode = hierarchy(tree)
			.sum((d) => (Array.isArray(d.children) && d.children.length ? 0 : Math.max(0, num(d.value, 0))));
		if (sortTiles === 'value-desc') rootNode.sort((a, b) => (b.value || 0) - (a.value || 0));
		else if (sortTiles === 'value-asc') rootNode.sort((a, b) => (a.value || 0) - (b.value || 0));
	}

	// empty state — no data, or all values sum to zero (nothing to encode by area)
	if (!rootNode || !(rootNode.value > 0)) {
		svg.append('text')
			.attr('x', width / 2).attr('y', height / 2)
			.attr('text-anchor', 'middle')
			.attr('fill', '#6b7280')
			.style('font-size', `${labelFontSize}px`)
			.text('No data to display');
		if (chartTitle) {
			svg.append('text').attr('class', 'tc-title')
				.attr('x', width / 2).attr('y', titleFontSize + 2)
				.attr('text-anchor', 'middle').attr('fill', titleColor)
				.style('font-size', `${titleFontSize}px`).style('font-weight', '600').text(chartTitle);
		}
		return;
	}

	// top-level groups drive grouping/legend/byGroup coloring
	const topGroups = (rootNode.children || []).map((c) => (c.data && c.data.name !== undefined ? String(c.data.name) : ''));
	const maxTreeDepth = (() => { let m = 0; rootNode.each((n) => { if (n.depth > m) m = n.depth; }); return m; })();

	// ----- layout margins -----
	const margin = { top: 6, right: 6, bottom: 6, left: 6 };
	if (chartTitle) margin.top += titleFontSize + 16;

	const legendRowH = legendFontSize + 10;
	const legendItemW = (name) => 16 + String(name).length * (legendFontSize * 0.62) + 16;
	const showGroupLegend = showLegend && topGroups.length > 0;
	if (showGroupLegend) {
		if (legendPosition === 'top') margin.top += legendRowH + 6;
		else if (legendPosition === 'bottom') margin.bottom += legendRowH + 6;
		else margin.right += Math.min(200, Math.max(...topGroups.map(legendItemW)) + 8);
	}

	const innerW = Math.max(10, width - margin.left - margin.right);
	const innerH = Math.max(10, height - margin.top - margin.bottom);

	// ----- compute treemap layout -----
	const headerSpace = (showGroupHeaders && maxTreeDepth > 1) ? Math.max(0, tilePaddingTop) : 0;
	const layout = treemap()
		.tile(tileMethod)
		.size([innerW, innerH])
		.paddingInner(tilePadding)
		.paddingTop(headerSpace)
		.round(true);
	layout(rootNode);

	// ----- depth flattening (maxDepth): keep tiles at/above maxDepth -----
	// A "render leaf" is a node whose depth === maxDepth (with children below
	// merged into it) OR an actual leaf shallower than maxDepth.
	const isRenderLeaf = (n) => {
		if (!n.children || !n.children.length) return true;
		if (maxDepth > 0 && n.depth >= maxDepth) return true;
		return false;
	};
	const renderLeaves = [];
	rootNode.each((n) => { if (n.depth > 0 && isRenderLeaf(n)) renderLeaves.push(n); });

	// header nodes: internal nodes that still have rendered children below them
	const headerNodes = [];
	if (headerSpace > 0) {
		rootNode.each((n) => {
			if (n.depth > 0 && n.children && n.children.length && !isRenderLeaf(n)) headerNodes.push(n);
		});
	}

	const total = rootNode.value || 0;

	// ----- color resolution -----
	const groupColor = scaleOrdinal().domain(topGroups).range(categoricalRange);
	const depthColor = scaleOrdinal()
		.domain(Array.from({ length: maxTreeDepth + 1 }, (_, i) => i))
		.range(categoricalRange);

	let valueExtent = [Infinity, -Infinity];
	renderLeaves.forEach((n) => { const v = n.value || 0; if (v < valueExtent[0]) valueExtent[0] = v; if (v > valueExtent[1]) valueExtent[1] = v; });
	if (!Number.isFinite(valueExtent[0])) valueExtent = [0, 1];
	if (valueExtent[0] === valueExtent[1]) valueExtent = [valueExtent[0], valueExtent[0] + 1];
	const valueColor = scaleSequential(SEQ_SCHEMES[valueColorScheme]).domain(valueExtent);

	const topGroupNameOf = (n) => {
		let cur = n;
		while (cur.parent && cur.parent.depth > 0) cur = cur.parent;
		return (cur.data && cur.data.name !== undefined) ? String(cur.data.name) : '';
	};

	const resolveColor = (n) => {
		// node's own color always wins when enabled
		if (useNodeColors && n.data && !isBlank(n.data.color)) return String(n.data.color);
		if (colorMode === 'byValue') {
			return valueColor(n.value || 0);
		}
		if (colorMode === 'byDepth') {
			return depthColor(n.depth);
		}
		// byGroup (and custom fallback): base color from the top group, with a
		// slight per-leaf lightness variation so sibling leaves are distinguishable.
		const g = topGroupNameOf(n);
		const base = groupColor(g);
		const c = color(base);
		if (!c) return base;
		// vary by sibling index within the group
		const siblings = n.parent ? (n.parent.children || []) : [];
		const idx = siblings.indexOf(n);
		const span = Math.max(1, siblings.length);
		const k = ((idx + 1) / (span + 1) - 0.5) * 0.9; // -0.45..0.45
		return (k >= 0 ? c.brighter(k) : c.darker(-k)).toString();
	};

	// stash resolved color on each render leaf
	renderLeaves.forEach((n) => { n._fill = resolveColor(n); });

	// ----- plot group -----
	const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
	const tileLayer = plot.append('g').attr('class', 'tc-tiles')
		.attr('filter', dropShadow ? 'url(#tc-shadow)' : null);

	// ----- tooltip helpers -----
	const tooltipEl = showTooltip
		? root.append('div').attr('class', 'tc-tooltip')
			.style('background', tooltipBackground).style('color', tooltipTextColor)
			.style('font-size', `${tooltipFontSize}px`).style('font-family', fontFamily)
			.style('opacity', 0).style('display', 'none')
		: null;

	const escapeHtml = (s) => String(s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	const swatchHtml = (cssColor) => {
		const safe = String(cssColor).replace(/[^a-zA-Z0-9#(),.%\s-]/g, '');
		return `<span class="tc-tt-swatch" style="background:${safe}"></span>`;
	};
	const pathOf = (n) => n.ancestors().reverse().slice(1).map((a) => (a.data && a.data.name !== undefined ? String(a.data.name) : '')).join(' / ');
	const renderTemplate = (n) => {
		const value = n.value || 0;
		const pct = total ? (value / total) * 100 : 0;
		const col = n._fill;
		const ctx = Object.assign({}, (n.data && n.data._raw) || {}, {
			name: (n.data && n.data.name !== undefined) ? n.data.name : '',
			value, formattedValue: fmt(value),
			group: topGroupNameOf(n), path: pathOf(n), depth: n.depth,
			percent: `${Math.round(pct * 10) / 10}%`, color: col
		});
		return tooltipTemplate.replace(/\{(\w+)\}/g, (m, key) => {
			if (key === 'swatch') return swatchHtml(col);
			const v = ctx[key];
			return (v === undefined || v === null) ? '' : escapeHtml(v);
		});
	};
	const placeTooltip = (clientX, clientY, anchorX, anchorY) => {
		if (!tooltipEl) return;
		const cr = container.getBoundingClientRect();
		const node = tooltipEl.node();
		const tw = node.offsetWidth;
		const th = node.offsetHeight;
		let xPos;
		let yPos;
		if (tooltipFollowCursor) {
			xPos = clientX - cr.left + 14;
			yPos = clientY - cr.top + 14;
			if (yPos + th > cr.height) yPos = clientY - cr.top - th - 14;
		} else {
			xPos = anchorX - tw / 2;
			yPos = anchorY - th - 10;
			if (yPos < 0) yPos = anchorY + 14;
		}
		if (xPos + tw > cr.width) xPos = cr.width - tw - 4;
		if (xPos < 0) xPos = 4;
		if (yPos < 0) yPos = 4;
		tooltipEl.style('left', `${xPos}px`).style('top', `${yPos}px`);
	};

	// ----- draw tiles -----
	const tileGroups = tileLayer.selectAll('g.tc-tile').data(renderLeaves).join('g')
		.attr('class', 'tc-tile')
		.attr('transform', (d) => `translate(${d.x0},${d.y0})`);

	const wOf = (d) => Math.max(0, d.x1 - d.x0);
	const hOf = (d) => Math.max(0, d.y1 - d.y0);

	const rects = tileGroups.append('rect')
		.attr('width', wOf)
		.attr('height', hOf)
		.attr('rx', tileCornerRadius)
		.attr('ry', tileCornerRadius)
		.attr('fill', (d) => d._fill)
		.attr('stroke', tileStroke && tileStrokeWidth > 0 ? tileStroke : 'none')
		.attr('stroke-width', tileStroke && tileStrokeWidth > 0 ? tileStrokeWidth : 0)
		.style('cursor', 'pointer');

	// ----- tile labels (auto-contrast when labelColor is blank) -----
	const labelText = (d) => {
		const nm = (d.data && d.data.name !== undefined) ? String(d.data.name) : '';
		const vl = fmt(d.value || 0);
		if (labelMode === 'name') return nm;
		if (labelMode === 'value') return vl;
		if (labelMode === 'name+value') return nm;
		return '';
	};
	if (labelMode !== 'none') {
		tileGroups.each(function (d) {
			const w = wOf(d);
			const h = hOf(d);
			if (w < labelMinTileSize || h < labelMinTileSize) return;
			const g = select(this);
			const txt = labelColorProp || autoTextColor(d._fill);
			const showVal = (labelMode === 'name+value');
			const pad = 4;
			const nameStr = labelText(d);
			if (nameStr) {
				g.append('text')
					.attr('class', 'tc-label-name')
					.attr('x', pad).attr('y', pad + labelFontSize * 0.85)
					.attr('fill', txt)
					.style('font-size', `${labelFontSize}px`)
					.style('font-weight', '600')
					.style('pointer-events', 'none')
					.style('font-family', fontFamily)
					.text(nameStr);
			}
			if (showVal && h >= labelMinTileSize + labelFontSize) {
				g.append('text')
					.attr('class', 'tc-label-value')
					.attr('x', pad).attr('y', pad + labelFontSize * 0.85 + labelFontSize + 2)
					.attr('fill', txt)
					.style('font-size', `${Math.max(9, labelFontSize - 1)}px`)
					.style('pointer-events', 'none')
					.style('font-family', fontFamily)
					.style('opacity', 0.85)
					.text(fmt(d.value || 0));
			}
		});
	}

	// ----- group headers (parent labels in the reserved top padding) -----
	if (headerSpace > 0 && showGroupHeaders) {
		const headerLayer = plot.append('g').attr('class', 'tc-headers').style('pointer-events', 'none');
		headerLayer.selectAll('text').data(headerNodes).join('text')
			.attr('x', (d) => d.x0 + 4)
			.attr('y', (d) => d.y0 + Math.min(headerSpace - 3, groupHeaderFontSize))
			.attr('fill', groupHeaderColor)
			.style('font-size', `${groupHeaderFontSize}px`)
			.style('font-weight', '700')
			.style('font-family', fontFamily)
			.each(function (d) {
				const w = Math.max(0, d.x1 - d.x0);
				const nm = (d.data && d.data.name !== undefined) ? String(d.data.name) : '';
				// truncate to fit width
				const maxChars = Math.max(0, Math.floor((w - 8) / (groupHeaderFontSize * 0.6)));
				const t = nm.length > maxChars ? `${nm.slice(0, Math.max(0, maxChars - 1))}…` : nm;
				select(this).text(maxChars <= 1 ? '' : t);
			});
	}

	// ----- interaction -----
	const hoverFill = (base) => { const c = color(base); return c ? c.brighter(0.45).toString() : base; };
	rects
		.on('mouseenter', function (event, d) {
			if (hoverHighlight) {
				select(this).attr('fill', hoverFill(d._fill))
					.attr('stroke', '#111827').attr('stroke-width', Math.max(1.5, tileStrokeWidth));
			}
			if (hoverDimOthers) tileGroups.style('opacity', (o) => (o === d ? 1 : 0.35));
			if (tooltipEl) {
				tooltipEl.html(renderTemplate(d)).style('display', 'block').style('opacity', 1);
				placeTooltip(event.clientX, event.clientY, margin.left + (d.x0 + d.x1) / 2, margin.top + d.y0);
			}
			dispatch('TILE_HOVERED', {
				name: (d.data && d.data.name !== undefined) ? d.data.name : '',
				value: d.value || 0,
				group: topGroupNameOf(d)
			});
		})
		.on('mousemove', function (event, d) {
			if (tooltipEl) placeTooltip(event.clientX, event.clientY, margin.left + (d.x0 + d.x1) / 2, margin.top + d.y0);
		})
		.on('mouseleave', function (event, d) {
			if (hoverHighlight) {
				select(this).attr('fill', d._fill)
					.attr('stroke', tileStroke && tileStrokeWidth > 0 ? tileStroke : 'none')
					.attr('stroke-width', tileStroke && tileStrokeWidth > 0 ? tileStrokeWidth : 0);
			}
			if (hoverDimOthers) tileGroups.style('opacity', 1);
			if (tooltipEl) tooltipEl.style('opacity', 0).style('display', 'none');
		})
		.on('click', function (event, d) {
			event.stopPropagation();
			dispatch('TILE_CLICKED', {
				name: (d.data && d.data.name !== undefined) ? d.data.name : '',
				value: d.value || 0,
				path: pathOf(d),
				group: topGroupNameOf(d),
				depth: d.depth,
				color: d._fill
			});
		});

	// ----- tile-in animation (fade + scale from each tile center) -----
	if (animate && typeof requestAnimationFrame === 'function') {
		const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : new Date().getTime());
		const t0 = now();
		// initial state
		tileGroups.attr('transform', (d) => {
			const cx = d.x0 + wOf(d) / 2;
			const cy = d.y0 + hOf(d) / 2;
			return `translate(${cx},${cy}) scale(0.01) translate(${-cx},${-cy})`;
		}).style('opacity', 0);
		const tick = () => {
			const elapsed = now() - t0;
			const k = easeFn(Math.max(0, Math.min(1, elapsed / animationDuration)));
			tileGroups.each(function (d) {
				const cx = d.x0 + wOf(d) / 2;
				const cy = d.y0 + hOf(d) / 2;
				const s = 0.01 + 0.99 * k;
				select(this)
					.attr('transform', `translate(${d.x0},${d.y0}) translate(${cx - d.x0},${cy - d.y0}) scale(${s}) translate(${-(cx - d.x0)},${-(cy - d.y0)})`)
					.style('opacity', k);
			});
			if (elapsed < animationDuration) requestAnimationFrame(tick);
			else tileGroups.attr('transform', (d) => `translate(${d.x0},${d.y0})`).style('opacity', 1);
		};
		requestAnimationFrame(tick);
	}

	// ----- title -----
	if (chartTitle) {
		svg.append('text').attr('class', 'tc-title')
			.attr('x', width / 2)
			.attr('y', (showGroupLegend && legendPosition === 'top' ? legendRowH + 4 : 0) + titleFontSize + 2)
			.attr('text-anchor', 'middle').attr('fill', titleColor)
			.style('font-size', `${titleFontSize}px`).style('font-weight', '600').text(chartTitle);
	}

	// ----- legend (top-level groups) -----
	if (showGroupLegend) {
		const legend = svg.append('g').attr('class', 'tc-legend');
		const items = legend.selectAll('g').data(topGroups).join('g');
		items.append('rect').attr('x', 0).attr('y', -legendFontSize + 2)
			.attr('width', 12).attr('height', 12).attr('rx', 2)
			.attr('fill', (g) => groupColor(g));
		items.append('text').attr('x', 18).attr('y', 0).attr('dominant-baseline', 'middle')
			.attr('fill', '#374151').style('font-size', `${legendFontSize}px`).style('font-family', fontFamily)
			.text((g) => g);

		if (legendPosition === 'right') {
			const totalH = topGroups.length * legendRowH;
			let yy = margin.top + Math.max(0, (innerH - totalH) / 2);
			items.attr('transform', () => { const tr = `translate(${width - margin.right + 12},${yy + legendFontSize})`; yy += legendRowH; return tr; });
		} else {
			const widths = topGroups.map(legendItemW);
			const totalW = widths.reduce((a, b) => a + b, 0);
			let xx = Math.max(8, margin.left + innerW / 2 - totalW / 2);
			const yPos = legendPosition === 'top'
				? (chartTitle ? titleFontSize + 16 : 0) + legendFontSize + 2
				: height - margin.bottom + legendFontSize + 6;
			items.attr('transform', (g, i) => { const tr = `translate(${xx},${yPos})`; xx += widths[i]; return tr; });
		}
	}
}
