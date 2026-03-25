// Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Changelogs", {
	refresh(frm) {
		autofill_change_by_fields(frm);

		// (Standalone Add Documents button removed; integrated inside Show Documents dialog pagination)
		if (!frm.is_new()) {
			// Show Documents button
			frm.add_custom_button("Show Documents", function () {
				if (!frm.doc.name) return;
				const make_doc_dialog = () => {
					const dlg = new frappe.ui.Dialog({
						title: __("Documents for {0}", [frm.doc.name]),
						size: "large",
						fields: [
							{ fieldname: "filter_section", fieldtype: "Section Break" },
							{
								fieldname: "document_type",
								label: "Document Type",
								fieldtype: "Select",
								options: "\nKontrak\nKAK\nProposal\nSpec\nMoM\nNDA\nAgreement\nMom",
							},
							{
								fieldname: "status",
								label: "Status",
								fieldtype: "Select",
								options: "\nActive\nArchived",
							},
							{ fieldname: "refresh", fieldtype: "Button", label: "Apply Filters" },
							{ fieldname: "results_section", fieldtype: "Section Break" },
							{ fieldname: "docs_html", fieldtype: "HTML" },
							{ fieldname: "pagination_html", fieldtype: "HTML" },
						],
						primary_action_label: __("Close"),
						primary_action() {
							dlg.hide();
						},
					});

					dlg.$wrapper.addClass("wide-documents-dialog");
					if (!document.getElementById("doc-dialog-style-fixed")) {
						const style = document.createElement("style");
						style.id = "doc-dialog-style-fixed";
						style.textContent = `
							.wide-documents-dialog .modal-dialog { max-width:85vw; width:85vw; }
							.wide-documents-dialog .modal-content { width:100%; }
							.wide-documents-dialog .form-layout,
							.wide-documents-dialog .form-page,
							.wide-documents-dialog .form-section,
							.wide-documents-dialog .section-body {
							width:100% !important;
							max-width:100% !important;
							margin:0;
							padding:0;
							}
	
							.wide-documents-dialog .form-column {
							width:100% !important;
							max-width:100% !important;
							flex:0 0 100%;
							padding:0;
							}
	
							.wide-documents-dialog .frappe-control[data-fieldname="docs_html"],
							.wide-documents-dialog .frappe-control[data-fieldname="pagination_html"] {
							width:100% !important;
							margin:0;
							padding:0;
							}
							.wide-documents-dialog .docs-table-wrapper { width:100%; }
							.wide-documents-dialog table.docs-table { width:100%; }
							.wide-documents-dialog table.docs-table th { text-align:center; white-space:nowrap; }
							.wide-documents-dialog table.docs-table td { white-space:nowrap; }
							.wide-documents-dialog table.docs-table td.notes-cell { white-space:normal; max-width:420px; line-height:1.3; }
							.wide-documents-dialog table.docs-table td.id-cell { white-space:normal; word-break:normal; }
							.wide-documents-dialog table.docs-table td.action-cell .btn { display:block; width:100%; margin:0 0 4px 0; }
							.wide-documents-dialog table.docs-table td.action-cell .btn:last-child { margin-bottom:0; }
							.wide-documents-dialog table.docs-table td.attachment-cell { white-space:normal; max-width:260px; word-break:break-all; line-height:1.25; }
							.wide-documents-dialog table.docs-table td.attachment-cell.has-attachment { background: #f5fff5; }
							.wide-documents-dialog table.docs-table td.attachment-cell.no-attachment { background: #fff8f2; font-style: italic; color: #888; }
							.wide-documents-dialog table.docs-table td.attachment-cell a.attachment-link { text-decoration:none; color: var(--primary-color, #1f6feb); }
							.wide-documents-dialog table.docs-table td.attachment-cell a.attachment-link:hover { text-decoration:underline; }
						`;
						document.head.appendChild(style);
					}

					setTimeout(() => {
						dlg.$wrapper
							.find(".form-column")
							.css({ width: "100%", maxWidth: "100%", flex: "0 0 100%" });
					}, 0);

					const state = { page: 1, page_size: 3 };
					const columns = [
						{ key: "name", label: "ID" },
						{ key: "document_title", label: "Title" },
						{ key: "document_type", label: "Type" },
						{ key: "attachment", label: "File" },
						{ key: "version", label: "Version" },
						{ key: "status", label: "Status" },
						{ key: "created_date", label: "Created Date" },
						{ key: "uploaded_by_name", label: "Uploaded By" },
						{ key: "notes", label: "Notes" },
						{ key: "actions", label: "Actions" },
					];

					function esc(v) {
						if (v == null) return "";
						return String(v)
							.replace(/&/g, "&amp;")
							.replace(/</g, "&lt;")
							.replace(/>/g, "&gt;")
							.replace(/"/g, "&quot;");
					}
					function truncate_140(txt) {
						if (!txt) return "";
						return txt.length > 140 ? txt.slice(0, 140) + "..." : txt;
					}
					function hyphen_wrap(id) {
						if (!id) return "";
						let safe = esc(id);
						return safe.replace(/-/g, "-<wbr>");
					}

					function fetch_and_render() {
						const filters = [
							["Documents Management", "related_to", "=", "" + frm.doctype],
							["Documents Management", "related_id", "=", "" + frm.doc.name],
						];
						const dt = dlg.get_value("document_type");
						const st = dlg.get_value("status");
						if (dt) filters.push(["Documents Management", "document_type", "=", dt]);
						if (st) filters.push(["Documents Management", "status", "=", st]);
						const start = (state.page - 1) * state.page_size;
						frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype: "Documents Management",
								filters,
								// include attachment field for styling / linking
								// (keeping order; server ignores duplicates if any)
								fields: [
									"name",
									"document_title",
									"document_type",
									"attachment",
									"version",
									"status",
									"created_date",
									"uploaded_by_name",
									"notes",
								],
								limit_start: start,
								limit_page_length: state.page_size,
								order_by: "creation desc",
							},
							callback: (r) => {
								const rows = r.message || [];
								frappe.call({
									method: "frappe.client.get_count",
									args: { doctype: "Documents Management", filters },
									callback: (c) => {
										render_table(rows, c.message || 0);
										render_pagination(c.message || 0);
									},
								});
							},
						});
					}

					function render_table(rows, total) {
						let html = "";
						if (!rows.length) {
							html = `<div class="text-muted" style="padding:12px">${__(
								"No Documents found."
							)}</div>`;
						} else {
							html +=
								'<div class="docs-table-wrapper" style="max-height:420px; overflow:auto;">';
							html +=
								'<table class="table table-bordered table-compact docs-table" style="margin:0">';
							html +=
								"<thead><tr>" +
								columns.map((c) => `<th>${esc(c.label)}</th>`).join("") +
								"</tr></thead><tbody>";
							rows.forEach((row) => {
								html += `<tr data-name="${esc(row.name)}">`;
								columns.forEach((col) => {
									if (col.key === "name") {
										const idd = hyphen_wrap(row.name || "");
										html += `<td class="id-cell" title="${esc(row.name)}">${idd}</td>`;
									} else if (col.key === "notes") {
										const plain = row.notes || "";
										const trunc = truncate_140(plain);
										html += `<td class="notes-cell" title="${esc(plain)}">${esc(
											trunc
										)}</td>`;
									} else if (col.key === "attachment") {
										const att = row.attachment;
										if (att) {
											// Extract filename & truncate for display
											let filename = att.split("/").pop() || att;
											if (filename.length > 40) filename = filename.slice(0, 37) + "…";
											html += `<td class="attachment-cell has-attachment" title="${esc(
												att
											)}"><a class="attachment-link" href="${esc(
												att
											)}" target="_blank" rel="noopener noreferrer">${esc(
												filename
											)}</a></td>`;
										} else {
											html += `<td class="attachment-cell no-attachment" title="${esc(
												__("No file attached")
											)}">${esc(__("(None)"))}</td>`;
										}
									} else if (col.key === "actions") {
										html += `<td class="action-cell" style="min-width:70px;">\n<button class="btn btn-xs btn-primary open-doc" data-name="${esc(
											row.name
										)}">${__(
											"Open"
										)}</button>\n<button class="btn btn-xs btn-secondary edit-doc" data-name="${esc(
											row.name
										)}">${__("Edit")}</button>\n</td>`;
									} else {
										html += `<td>${esc(row[col.key] || "")}</td>`;
									}
								});
								html += "</tr>";
							});
							html += "</tbody></table></div>";
							html += `<div class="mt-2 small text-muted">${__("Total")}: ${total}</div>`;
						}
						dlg.fields_dict.docs_html.$wrapper.html(html);
						bind_row_events();
					}

					function open_add_document_dialog() {
						const d = new frappe.ui.Dialog({
							title: __("Add Document"),
							fields: [
								{
									fieldname: "related_to",
									fieldtype: "Data",
									label: "Related To",
									read_only: 1,
									default: frm.doctype,
								},
								{
									fieldname: "related_id",
									fieldtype: "Data",
									label: "Related ID",
									read_only: 1,
									default: frm.doc.name,
								},
								{
									fieldname: "related_document_name",
									fieldtype: "Data",
									label: "Related Document Name",
									read_only: 1,
									default: frm.doc.change_description || "",
								},
								{
									fieldname: "document_type",
									fieldtype: "Select",
									label: "Document Type",
									options: "\nKontrak\nKAK\nProposal\nSpec\nMoM\nNDA\nAgreement\nMom",
								},
								{
									fieldname: "document_title",
									fieldtype: "Data",
									label: "Document Title",
									reqd: 1,
								},
								{ fieldname: "attachment", fieldtype: "Attach", label: "Attachment" },
								{ fieldname: "version", fieldtype: "Data", label: "Version" },
								{ fieldname: "notes", fieldtype: "Long Text", label: "Notes" },
							],
							primary_action_label: __("Submit"),
							primary_action(vals) {
								d.set_primary_action(__("Saving..."));
								frappe.db
									.get_value("Employee", { user_id: frappe.session.user }, [
										"name",
										"employee_name",
									])
									.then((r) => {
										const emp = r && r.message && r.message.name;
										const emp_name = r && r.message && r.message.employee_name;
										const doc = {
											doctype: "Documents Management",
											related_to: frm.doctype,
											related_id: frm.doc.name,
											related_document_name: frm.doc.change_description || "",
											document_type: vals.document_type || null,
											document_title: vals.document_title,
											attachment: vals.attachment || null,
											version: vals.version || null,
											notes: vals.notes || null,
											status: "Active",
											created_date: frappe.datetime.get_today(),
											uploaded_by: emp || null,
											uploaded_by_name: emp_name || null,
										};
										frappe.call({
											method: "frappe.client.insert",
											args: { doc },
											callback: (r2) => {
												d.hide();
												if (r2 && r2.message && r2.message.name) {
													frappe.show_alert({
														message: __("Document created"),
														indicator: "green",
													});
													state.page = 1;
													fetch_and_render();
												} else {
													frappe.msgprint(__("Failed to create Document"));
												}
											},
											always: () => d.set_primary_action(__("Submit")),
										});
									});
							},
						});
						d.show();
					}
					function render_pagination(total) {
						const total_pages = Math.max(1, Math.ceil(total / state.page_size));
						if (state.page > total_pages) state.page = total_pages;
						let html =
							'<div class="d-flex" style="margin-top:8px; justify-content:space-between; align-items:center;">';
						html += "<div>";
						html += `<button class=\"btn btn-xs btn-default doc-pag-btn\" data-dir=\"prev\" ${
							state.page <= 1 ? "disabled" : ""
						}>${__("Prev")}</button>`;
						html += `<span style=\"padding:0 8px\">${__("Page")} ${
							state.page
						} / ${total_pages}</span>`;
						html += `<button class=\"btn btn-xs btn-default doc-pag-btn\" data-dir=\"next\" ${
							state.page >= total_pages ? "disabled" : ""
						}>${__("Next")}</button>`;
						html += "</div>";
						html += `<div><button class=\"btn btn-xs btn-secondary add-document-inline\">${__(
							"Add Document"
						)}</button></div>`;
						html += "</div>";
						dlg.fields_dict.pagination_html.$wrapper.html(html);
						const wrap = dlg.fields_dict.pagination_html.$wrapper;
						wrap.find(".doc-pag-btn").on("click", function () {
							const dir = $(this).data("dir");
							if (dir === "prev" && state.page > 1) state.page -= 1;
							else if (dir === "next") state.page += 1;
							fetch_and_render();
						});
						wrap.find(".add-document-inline").on("click", function () {
							open_add_document_dialog();
						});
					}

					function bind_row_events() {
						dlg.$wrapper
							.find(".open-doc")
							.off("click")
							.on("click", function () {
								const name = $(this).data("name");
								frappe.set_route("Form", "Documents Management", name);
							});
						dlg.$wrapper
							.find(".edit-doc")
							.off("click")
							.on("click", function () {
								const name = $(this).data("name");
								open_edit_dialog(name);
							});
					}

					function open_edit_dialog(name) {
						frappe.db.get_doc("Documents Management", name).then((doc) => {
							const ed = new frappe.ui.Dialog({
								title: __("Edit Document {0}", [name]),
								fields: [
									{
										fieldname: "document_title",
										fieldtype: "Data",
										label: "Title",
										reqd: 1,
										default: doc.document_title,
									},
									{
										fieldname: "document_type",
										fieldtype: "Select",
										label: "Document Type",
										options: "\nKontrak\nKAK\nProposal\nSpec\nMoM\nNDA\nAgreement\nMom",
										default: doc.document_type,
									},
									{
										fieldname: "version",
										fieldtype: "Data",
										label: "Version",
										default: doc.version,
									},
									{
										fieldname: "status",
										fieldtype: "Select",
										label: "Status",
										options: "Active\nArchived",
										default: doc.status,
									},
									{
										fieldname: "attachment",
										fieldtype: "Attach",
										label: "Attachment",
										default: doc.attachment,
									},
									{
										fieldname: "notes",
										fieldtype: "Long Text",
										label: "Notes",
										default: doc.notes,
									},
								],
								primary_action_label: __("Save"),
								primary_action(vals) {
									ed.set_primary_action(__("Saving..."));
									// Gabungkan seluruh dokumen asli (memuat field meta seperti modified)
									// dengan nilai baru agar tidak memicu error "has been modified".
									const updated_doc = { ...doc, ...vals };
									updated_doc.name = doc.name;
									updated_doc.doctype = doc.doctype;
									frappe.call({
										method: "frappe.client.save",
										args: { doc: updated_doc },
										callback: () => {
											ed.hide();
											frappe.show_alert({
												message: __("Document updated"),
												indicator: "green",
											});
											fetch_and_render();
										},
										error: (err) => {
											const msg = (err && err.message) || "";
											if (/modified after you have opened/i.test(msg)) {
												frappe.msgprint({
													message: __(
														"Document changed in server. Re-opening the newest version..."
													),
													indicator: "orange",
												});
												// Ambil ulang dokumen & buka kembali dialog
												frappe.db
													.get_doc("Documents Management", name)
													.then((fresh) => {
														ed.hide();
														// Buka ulang dialog dengan fresh doc
														// (Sederhana: panggil kembali open_edit_dialog; user bisa input ulang cepat)
														open_edit_dialog(name);
													});
											} else {
												frappe.msgprint({
													message: __("Failed to save: {0}", [
														msg || __("Unknown"),
													]),
													indicator: "red",
												});
											}
										},
										always: () => ed.set_primary_action(__("Save")),
									});
								},
							});
							ed.show();
						});
					}

					// Inline style for filters
					const dt_w = dlg.get_field("document_type").$wrapper;
					const st_w = dlg.get_field("status").$wrapper;
					const rf_w = dlg.get_field("refresh").$wrapper;
					dt_w.css({ display: "inline-block", width: "32%", "vertical-align": "top" });
					st_w.css({
						display: "inline-block",
						width: "32%",
						"vertical-align": "top",
						"margin-left": "8px",
					});
					rf_w.css({
						display: "inline-block",
						width: "32%",
						"vertical-align": "top",
						"margin-left": "10px",
					});
					dlg.get_field("refresh").$input.addClass("btn-primary");
					dlg.get_field("refresh").$input.on("click", () => {
						state.page = 1;
						fetch_and_render();
					});

					dlg.show();
					fetch_and_render();
				};
				make_doc_dialog();
			});
		}
	},
});

// Helper: autofill validation_date (today) & change_by (current user's Employee) if empty
function autofill_change_by_fields(frm, opts) {
	opts = opts || {};
	if (!frm || !frm.doc) return;

	const needs_date = !frm.doc.date || opts.force;
	const needs_by = !frm.doc.change_by || opts.force;
	const needs_by_name = !frm.doc.change_by_name || opts.force;
	if (!needs_by && !needs_by_name) return;

	if (needs_date) {
		frm.set_value("date", frappe.datetime.get_today());
	}

	if (needs_by || needs_by_name) {
		// We assume there is a mapping from current user to Employee via frappe.session.user
		// Common patterns: a field user_id/email on Employee matching user, OR using frappe.call to server.
		// We'll attempt a quick client query first; adjust if your doctype differs.
		frappe.db
			.get_value("Employee", { user_id: frappe.session.user }, ["name", "employee_name"])
			.then((r) => {
				const msg = r && r.message;
				if (!msg) return;
				const emp = msg.name || msg.employee;
				const emp_name = msg.employee_name;
				if (needs_by && emp) {
					frm.set_value("change_by", emp);
				}
				if (needs_by_name && emp_name) {
					frm.set_value("change_by_name", emp_name);
				}
			});
	}
}
