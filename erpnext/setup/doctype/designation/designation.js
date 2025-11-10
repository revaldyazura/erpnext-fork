// Copyright (c) 2016, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Designation", {
	setup(frm) {
		// When creating a new Skill from the 'skills' child table, prefill the Skill.designation
		if (frm.fields_dict.skills && frm.fields_dict.skills.grid) {
			const grid = frm.fields_dict.skills.grid;
			const link_field = grid.get_field("skill");
			if (link_field) {
				link_field.get_route_options_for_new_doc = function () {
					return { designation: frm.doc.name };
				};
			}
		}
	},
	refresh(frm) {},
});
