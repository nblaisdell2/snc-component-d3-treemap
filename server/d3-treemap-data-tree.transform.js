/**
 * Script for the "D3 Treemap Data (Hierarchy)" Transform data resource
 * (table: sys_ux_data_broker_transform, "Mutates server data" = false).
 *
 * Produces a nested HIERARCHY object { name, children: [ { name, children:
 * [ { name, value, color? } ] } ] } from a TWO-level grouping
 * groupField (level 1) -> categoryField (level 2 / leaf), with a metric.
 * Leaves carry `value`; the component sums internal nodes for area.
 *
 * Bind the output in UI Builder: "Data · Treemap data" -> @data.<name>.output
 *
 * All logic lives in the global D3HierarchyData Script Include (fromHierarchy).
 */
function transform(input) {
	return new global.D3HierarchyData().fromHierarchy(input);
}
