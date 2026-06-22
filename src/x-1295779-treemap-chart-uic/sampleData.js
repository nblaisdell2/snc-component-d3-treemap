/**
 * Built-in sample data so the component renders something meaningful the moment
 * it is dropped onto a page, before the author binds the `data` property to a
 * real data resource.
 *
 * The treemap accepts TWO shapes (auto-detected by the renderer):
 *
 *  - HIERARCHY: a nested object { name, children: [ ... ] }. Leaves carry a
 *    numeric `value`; internal nodes sum their descendants. Leaves may carry an
 *    optional `color`. This is `SAMPLE_HIERARCHY` below and the default the
 *    component renders on drop (mirrors the `data` default wired in index.js).
 *
 *  - FLAT: an array [ { label, value, group?, color? } ]. When a `group` field
 *    is present, a 2-level tree (group -> leaf) is built; otherwise it's a
 *    single level of tiles. `SAMPLE_DATA` below is the flat equivalent.
 *
 * This differs fundamentally from the line/column charts' `series` array (which
 * is N series of { label, value } points over a shared category axis). The
 * treemap has no axes — a single `data` tree whose tile AREAS encode value.
 */

/** Nested hierarchy: a multi-group spend tree (the default sample). */
export const SAMPLE_HIERARCHY = {
	name: 'IT Spend',
	children: [
		{
			name: 'Hardware',
			children: [
				{ name: 'Laptops', value: 40 },
				{ name: 'Monitors', value: 22 },
				{ name: 'Servers', value: 31 },
				{ name: 'Peripherals', value: 12 }
			]
		},
		{
			name: 'Software',
			children: [
				{ name: 'Licenses', value: 34 },
				{ name: 'SaaS', value: 48 },
				{ name: 'Support', value: 17 }
			]
		},
		{
			name: 'Services',
			children: [
				{ name: 'Consulting', value: 26 },
				{ name: 'Training', value: 9 },
				{ name: 'Outsourcing', value: 19 }
			]
		},
		{
			name: 'Cloud',
			children: [
				{ name: 'Compute', value: 38 },
				{ name: 'Storage', value: 21 },
				{ name: 'Network', value: 14 }
			]
		}
	]
};

/** Flat, grouped equivalent of the hierarchy above. */
export const SAMPLE_DATA = [
	{ label: 'Laptops', value: 40, group: 'Hardware' },
	{ label: 'Monitors', value: 22, group: 'Hardware' },
	{ label: 'Servers', value: 31, group: 'Hardware' },
	{ label: 'Peripherals', value: 12, group: 'Hardware' },
	{ label: 'Licenses', value: 34, group: 'Software' },
	{ label: 'SaaS', value: 48, group: 'Software' },
	{ label: 'Support', value: 17, group: 'Software' },
	{ label: 'Consulting', value: 26, group: 'Services' },
	{ label: 'Training', value: 9, group: 'Services' },
	{ label: 'Outsourcing', value: 19, group: 'Services' },
	{ label: 'Compute', value: 38, group: 'Cloud' },
	{ label: 'Storage', value: 21, group: 'Cloud' },
	{ label: 'Network', value: 14, group: 'Cloud' }
];
