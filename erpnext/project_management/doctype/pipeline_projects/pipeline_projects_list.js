// Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.listview_settings['Pipeline Projects'] = {

	refresh(listview) {

		document.querySelectorAll('.list-subject').forEach(function(col){
			col.style.maxWidth = "200px";
			col.style.minWidth = "200px";
		})
	},
}