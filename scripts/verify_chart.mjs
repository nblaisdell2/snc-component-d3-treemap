#!/usr/bin/env node
/**
 * Headless verification for a ServiceNow D3 chart renderer.
 *
 * Bundles a chart.js (which imports only d3 submodules) with real d3 via esbuild,
 * then runs drawChart(container, props, dispatch) in jsdom across a property
 * matrix, asserting an <svg> is produced with no exceptions. Catches the bulk of
 * renderer bugs without an authenticated ServiceNow instance.
 *
 * Usage:
 *   node verify_chart.mjs --chart <path-to-chart.js> [--export <fnName>]
 *
 * Deps (d3@7, jsdom, esbuild) are auto-installed into a temp dir on first run.
 * Edit SCENARIOS below to cover every property your chart introduces.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i > -1 ? args[i + 1] : undefined; };
const chartPath = get('--chart');
const exportName = get('--export') || 'drawChart';
if (!chartPath) { console.error('Usage: node verify_chart.mjs --chart <path-to-chart.js>'); process.exit(2); }

const DEPS = join(tmpdir(), 'snc-d3-verify-treemap');
if (!existsSync(join(DEPS, 'node_modules', 'esbuild'))) {
  console.log('Installing verify deps (d3@7, jsdom, esbuild) into ' + DEPS + ' ...');
  mkdirSync(DEPS, { recursive: true });
  execSync('npm init -y', { cwd: DEPS, stdio: 'ignore' });
  execSync('npm install d3@7 jsdom esbuild', { cwd: DEPS, stdio: 'inherit' });
}
const req = createRequire(pathToFileURL(join(DEPS, 'package.json')));
const esbuild = req('esbuild');
const { JSDOM } = req('jsdom');

const outfile = join(DEPS, 'chart.cjs');
esbuild.buildSync({
  entryPoints: [chartPath], bundle: true, format: 'cjs', platform: 'node',
  outfile, nodePaths: [join(DEPS, 'node_modules')], logLevel: 'warning'
});

const dom = new JSDOM('<!DOCTYPE html><body><div id="c"></div></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
try { if (!global.navigator) global.navigator = dom.window.navigator; } catch (_) { /* read-only: fine */ }
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.performance = global.performance || { now: () => Date.now() };
global.ResizeObserver = class { observe() {} disconnect() {} };
const container = document.getElementById('c');
container.getBoundingClientRect = () => ({ width: 640, height: 360, left: 0, top: 0, right: 640, bottom: 360 });
Object.defineProperty(container, 'clientWidth', { value: 640, configurable: true });

const bundle = req(outfile);
const drawChart = bundle[exportName];
if (typeof drawChart !== 'function') { console.error('Export "' + exportName + '" not found in bundle.'); process.exit(2); }

// ---- sample data: a multi-group HIERARCHY (the chart's default shape) ----
const HIERARCHY = {
	name: 'IT Spend',
	children: [
		{ name: 'Hardware', children: [
			{ label: 'Laptops', value: 40 }, { name: 'Monitors', value: 22 },
			{ name: 'Servers', value: 31 }, { name: 'Peripherals', value: 12 } ] },
		{ name: 'Software', children: [
			{ name: 'Licenses', value: 34 }, { name: 'SaaS', value: 48, color: '#FF9800' },
			{ name: 'Support', value: 17 } ] },
		{ name: 'Services', children: [
			{ name: 'Consulting', value: 26 }, { name: 'Training', value: 9 },
			{ name: 'Outsourcing', value: 19 } ] }
	]
};
const FLAT_GROUPED = [
	{ label: 'Laptops', value: 40, group: 'Hardware' },
	{ label: 'Monitors', value: 22, group: 'Hardware' },
	{ label: 'SaaS', value: 48, group: 'Software', color: '#FF9800' },
	{ label: 'Licenses', value: 34, group: 'Software' },
	{ label: 'Consulting', value: 26, group: 'Services' }
];
const FLAT_NOGROUP = [
	{ label: 'Alpha', value: 30 }, { label: 'Beta', value: 22 },
	{ label: 'Gamma', value: 15 }, { label: 'Delta', value: 9 }, { label: 'Epsilon', value: 4 }
];
const DEEP = {
	name: 'root',
	children: [
		{ name: 'A', children: [
			{ name: 'A1', children: [
				{ name: 'A1a', children: [ { name: 'A1a-i', value: 12 }, { name: 'A1a-ii', value: 8 } ] },
				{ name: 'A1b', value: 14 } ] },
			{ name: 'A2', value: 20 } ] },
		{ name: 'B', children: [ { name: 'B1', value: 18 }, { name: 'B2', value: 6 } ] }
	]
};

// ---- scenario matrix (treemap `data` prop: hierarchy + flat) ----
const base = { data: HIERARCHY, chartHeight: 360, chartTitle: 'Test' };
const SCENARIOS = [
	['defaults (hierarchy)', {}],
	['no title', { chartTitle: '' }],
	['animate off', { animate: false }],
	['flat no-group', { data: FLAT_NOGROUP }],
	['flat with group', { data: FLAT_GROUPED }],
	['tileMethod squarify', { tileMethod: 'squarify' }],
	['tileMethod binary', { tileMethod: 'binary' }],
	['tileMethod sliceDice', { tileMethod: 'sliceDice' }],
	['tileMethod resquarify', { tileMethod: 'resquarify' }],
	['colorMode byGroup', { colorMode: 'byGroup' }],
	['colorMode byValue', { colorMode: 'byValue' }],
	['colorMode byValue viridis', { colorMode: 'byValue', valueColorScheme: 'viridis' }],
	['colorMode byDepth', { colorMode: 'byDepth' }],
	['colorMode custom', { colorMode: 'custom', data: FLAT_GROUPED }],
	['colorScheme tableau10', { colorScheme: 'tableau10' }],
	['group headers on', { showGroupHeaders: true }],
	['group headers off', { showGroupHeaders: false }],
	['labelMode none', { labelMode: 'none' }],
	['labelMode name', { labelMode: 'name' }],
	['labelMode name+value', { labelMode: 'name+value' }],
	['labelMode value', { labelMode: 'value' }],
	['labelColor fixed', { labelColor: '#000000' }],
	['labelFormat $,.0f', { labelFormat: '$,.0f' }],
	['maxDepth 1 cap', { maxDepth: 1, data: DEEP }],
	['maxDepth 2 cap', { maxDepth: 2, data: DEEP }],
	['deep nesting', { data: DEEP }],
	['sortTiles none', { sortTiles: 'none' }],
	['sortTiles value-asc', { sortTiles: 'value-asc' }],
	['sortTiles value-desc', { sortTiles: 'value-desc' }],
	['legend top', { legendPosition: 'top' }],
	['legend right', { legendPosition: 'right' }],
	['legend off', { showLegend: false }],
	['tooltip off', { showTooltip: false }],
	['drop shadow', { dropShadow: true }],
	['hover dim others', { hoverDimOthers: true }],
	['no stroke', { tileStroke: '', tileStrokeWidth: 0 }],
	['corner radius', { tileCornerRadius: 8 }],
	['empty data (array)', { data: [] }],
	['empty data (object)', { data: { name: 'root', children: [] } }],
	['single tile', { data: [{ label: 'Only', value: 5 }] }],
	['all-zero values', { data: [{ label: 'a', value: 0 }, { label: 'b', value: 0 }] }],
	['negative values clamped', { data: [{ label: 'a', value: -3, group: 'G' }, { label: 'b', value: 7, group: 'G' }] }],
	['tiny height', { chartHeight: 80 }]
];


let pass = 0;
let fail = 0;
for (const [name, override] of SCENARIOS) {
  container.innerHTML = '';
  try {
    drawChart(container, Object.assign({}, base, override), () => {});
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('no <svg> produced');
    pass += 1;
    console.log('  ok    ' + name);
  } catch (e) {
    fail += 1;
    console.log('  FAIL  ' + name + ': ' + (e && e.message ? e.message : e));
  }
}
console.log('');
console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
