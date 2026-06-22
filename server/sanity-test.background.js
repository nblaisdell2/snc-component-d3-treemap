/**
 * Sanity test for the D3HierarchyData Script Include.
 * Run in System Definition → Scripts - Background (Global scope) AFTER creating
 * the D3HierarchyData Script Include. It logs the treemap data JSON so you can
 * confirm the shape before wiring it into the page. Adjust the cfg objects to
 * your data.
 */
(function () {
	var api = new global.D3HierarchyData();

	gs.info('--- fromAggregate: FLAT, single level (incidents by priority) ---');
	gs.info(JSON.stringify(api.fromAggregate({
		table: 'incident',
		categoryField: 'priority',
		metric: 'count',
		useDisplayValue: true,
		sort: 'value-desc'
	}), null, 2));

	gs.info('--- fromAggregate: FLAT, grouped (priority -> assignment_group) ---');
	gs.info(JSON.stringify(api.fromAggregate({
		table: 'incident',
		groupField: 'priority',
		categoryField: 'assignment_group',
		metric: 'count',
		useDisplayValue: true,
		sort: 'value-desc'
	}), null, 2));

	gs.info('--- fromHierarchy: NESTED tree (priority -> assignment_group) ---');
	gs.info(JSON.stringify(api.fromHierarchy({
		table: 'incident',
		groupField: 'priority',
		categoryField: 'assignment_group',
		metric: 'count',
		useDisplayValue: true,
		rootName: 'Incidents',
		sort: 'value-desc'
	}), null, 2));

	gs.info('--- fromRows: reshape plain objects (grouped flat) ---');
	var rows = [
		{ cat: 'Laptops', grp: 'Hardware', amount: 40 },
		{ cat: 'Monitors', grp: 'Hardware', amount: 22 },
		{ cat: 'SaaS', grp: 'Software', amount: 48 },
		{ cat: 'Licenses', grp: 'Software', amount: 34 }
	];
	gs.info(JSON.stringify(api.fromRows(rows, {
		categoryField: 'cat', groupField: 'grp', valueField: 'amount', sort: 'value-desc'
	}), null, 2));
})();
