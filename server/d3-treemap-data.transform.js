/**
 * Script for the "D3 Treemap Data" Transform data resource
 * (table: sys_ux_data_broker_transform, "Mutates server data" = false).
 *
 * Produces a FLAT tile array [ { label, value, group?, color? } ] from a
 * GlideAggregate. `input` keys are the data resource's Properties (see
 * d3-treemap-data.properties.json). With a `groupField` set, the component
 * auto-builds a 2-level treemap (group -> leaf); without it, a single level.
 *
 * Bind the output in UI Builder: "Data · Treemap data" -> @data.<name>.output
 *
 * All logic lives in the global D3HierarchyData Script Include.
 */
function transform(input) {
	return new global.D3HierarchyData().fromAggregate(input);
}
