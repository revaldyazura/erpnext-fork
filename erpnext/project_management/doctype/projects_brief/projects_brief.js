// Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Projects Brief", {
	onload(frm) {
		update_pipeline_visibility(frm);
		sync_pipeline_client(frm);

		frm.set_query("project_manager", function () {
			return {
				// query: "hrms.hr.doctype.subtask.subtask.get_employees_by_team",
				filters: {
					designation: "Business Support",
				},
			};
		});
		frm.fields_dict["approval_by"].grid.get_field("employee").get_query = function (doc, cdt, cdn) {
			return {
				query: "erpnext.project_management.doctype.pipeline_projects.pipeline_projects.approval_by_query",
				filters: { role: "Projects Approver", pipeline_id: frm.doc.name },
			};
		};
		frm.update_approve_field_state = function () {
			const grid = frm.fields_dict.approval_by && frm.fields_dict.approval_by.grid;
			if (!grid) return;
			const readonly = frm.doc.pipeline_status !== "Converted";
			// Update docfield property (affects all rows)
			grid.update_docfield_property("approve", "read_only", readonly ? 1 : 0);
			// For already rendered rows, ensure checkbox disabled visually when read-only
			(grid.grid_rows || []).forEach((gr) => {
				const $inp = gr.wrapper.find('input[data-fieldname="approve"]');
				if ($inp && $inp.length) {
					$inp.prop("disabled", readonly);
					if (readonly) {
						$inp.attr("title", __("Pipeline must be Converted before approvals can be toggled"));
					} else {
						$inp.removeAttr("title");
					}
				}
			});
		};
		// Initial apply (after slight delay to allow grid build)
		setTimeout(() => frm.update_approve_field_state(), 50);
	},
	refresh(frm) {
		update_pipeline_visibility(frm);
		if (!frm.is_new()) {
			// (Standalone Add Requirements button removed; integrated into Show Requirements dialog pagination)
			frm.add_custom_button(
				"Show Requirements",
				function () {
					if (!frm.doc.name) return;

					const make_dialog = () => {
						const dlg = new frappe.ui.Dialog({
							title: __("Requirements for {0}", [frm.doc.name]),
							size: "large", // baseline; we'll override with custom CSS to reach ~85% viewport
							fields: [
								{ fieldname: "filter_section", fieldtype: "Section Break" },
								{
									fieldname: "status",
									label: "Status",
									fieldtype: "Select",
									options: "\nAccepted\nPending\nDenied",
								},
								{
									fieldname: "priority",
									label: "Priority",
									fieldtype: "Select",
									options: "\nLow\nMedium\nHigh",
								},
								{ fieldname: "refresh", fieldtype: "Button", label: "Apply Filters" },
								{ fieldname: "results_section", fieldtype: "Section Break" },
								{ fieldname: "requirements_html", fieldtype: "HTML" },
								{ fieldname: "pagination_html", fieldtype: "HTML" },
								{ fieldname: "bottom_actions", fieldtype: "HTML" },
							],
							primary_action_label: __("Close"),
							primary_action() {
								dlg.hide();
							},
						});

						// Tag wrapper & inject improved styling for full-width table
						dlg.$wrapper.addClass("wide-requirements-dialog");
						if (!document.getElementById("req-dialog-style-fixed")) {
							const style = document.createElement("style");
							style.id = "req-dialog-style-fixed";
							style.textContent = `
                        .wide-requirements-dialog .modal-dialog { max-width:85vw; width:85vw; }
                        .wide-requirements-dialog .modal-content { width:100%; }
                        .wide-requirements-dialog .modal-body { max-height:72vh; overflow:auto; padding: 8px 14px 12px; }
                        .wide-requirements-dialog .form-layout, 
                        .wide-requirements-dialog .form-page, 
                        .wide-requirements-dialog .form-section, 
                        .wide-requirements-dialog .section-body { width:100% !important; max-width:100% !important; margin:0; padding:0; }
                        .wide-requirements-dialog .form-column { width:100% !important; max-width:100% !important; flex:0 0 100%; padding:0; }
                        .wide-requirements-dialog .frappe-control { margin-bottom:6px; }
                        .wide-requirements-dialog .frappe-control[data-fieldname="requirements_html"],
                        .wide-requirements-dialog .frappe-control[data-fieldname="pagination_html"],
                        .wide-requirements-dialog .frappe-control[data-fieldname="bottom_actions"] { width:100% !important; margin:0; padding:0; }
                        .wide-requirements-dialog .req-table-wrapper { width:100%; }
                        .wide-requirements-dialog .req-table { width:100%; table-layout:auto; }
                        .wide-requirements-dialog .req-table th { white-space:nowrap; text-align:center; vertical-align:middle; }
                        .wide-requirements-dialog .req-table th.tech-validation-col { white-space:normal; max-width:90px; }
                        .wide-requirements-dialog .req-table td { white-space:nowrap; }
                        .wide-requirements-dialog .req-table td.desc-cell { white-space:normal; line-height:1.3; max-width:460px; width:35%; overflow:hidden; }
                        .wide-requirements-dialog .req-table td.wrap-cell { white-space:normal; line-height:1.3; word-break:break-word; }
                        .wide-requirements-dialog .req-table td.title-cell { white-space:normal; word-break:normal; overflow-wrap:break-word; hyphens:auto; min-width:150px; line-height:1.3; }
                        .wide-requirements-dialog .req-table td.id-cell { white-space:normal; word-break:normal; font-family:inherit; }
                        .wide-requirements-dialog .req-table td.action-cell { white-space:normal; }
                        .wide-requirements-dialog .req-table td.action-cell .btn { display:block; width:100%; margin:0 0 4px 0; }
                        .wide-requirements-dialog .req-table td.action-cell .btn:last-child { margin-bottom:0; }
                        .wide-requirements-dialog .req-table td.text-center { text-align:center; }
                        .wide-requirements-dialog .tech-val-icon { display:inline-block; width:18px; font-weight:600; color: var(--green, #2e7d32); }
                        .wide-requirements-dialog .tech-val-icon.off { color:#d9534f; }
                        @media (max-width: 1200px) {
                            .wide-requirements-dialog .req-table th, .wide-requirements-dialog .req-table td { white-space:normal; }
                        }
                    `;
							document.head.appendChild(style);
						}
						// Force any existing form columns (after render) to 100%
						setTimeout(() => {
							dlg.$wrapper
								.find(".form-column")
								.css({ width: "100%", maxWidth: "100%", flex: "0 0 100%" });
						}, 0);

						const state = { page: 1, page_size: 3 }; // show only 3 rows per page as requested

						const columns = [
							{ key: "name", label: "ID" },
							{ key: "title", label: "Title" },
							{ key: "requirement_status", label: "Status" },
							{ key: "priority", label: "Priority" },
							{ key: "category", label: "Category" },
							{ key: "description", label: "Description" },
							{ key: "tech_validation", label: "Tech Validation" },
							{ key: "validation_reason", label: "Validation Reason" },
							{ key: "validation_date", label: "Validation Date" },
							// { key: 'validation_by', label: 'Validation By' },
							{ key: "validation_by_name", label: "Validation By Name" },
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

						// Convert rich text (Quill HTML) to plain text for compact table display
						function strip_html(html) {
							if (!html) return "";
							// Fast path: if no tag markers, return as-is
							if (!/[<>&]/.test(html)) return html;
							const tmp = document.createElement("div");
							tmp.innerHTML = html;
							const text = tmp.textContent || tmp.innerText || "";
							return text.trim();
						}

						function fetch_and_render() {
							frappe.call({
								method: "erpnext.project_management.doctype.projects_brief.projects_brief.get_requirements",
								args: {
									project_id: frm.doc.name,
									status: dlg.get_value("status") || undefined,
									priority: dlg.get_value("priority") || undefined,
									page: state.page,
									page_size: state.page_size,
								},
								callback: (r) => {
									const payload = r.message || { rows: [], total: 0 };
									render_table(payload.rows, payload.total);
									render_pagination(payload.total);
								},
							});
						}

						function truncate(str, n = 60) {
							if (!str) return "";
							return str.length > n ? str.slice(0, n) + "…" : str;
						}

						function row_class(row) {
							if (row.requirement_status === "Accepted") return "success";
							if (row.requirement_status === "Denied") return "danger";
							return "";
						}

						function render_table(rows, total) {
							let html = "";
							if (!rows.length) {
								html = `<div class="text-muted" style="padding:12px">${__(
									"No Requirements found."
								)}</div>`;
							} else {
								html +=
									'<div class="req-table-wrapper" style="max-height:420px; overflow:auto;">';
								html +=
									'<table class="table table-bordered table-compact req-table" style="margin:0">';
								html +=
									"<thead><tr>" +
									columns
										.map((c) => {
											const extra =
												c.key === "tech_validation"
													? ' class="tech-validation-col"'
													: "";
											return `<th${extra}>${esc(c.label)}</th>`;
										})
										.join("") +
									"</tr></thead>";
								html += "<tbody>";
								// Helper: truncate text to 140 chars with ellipsis
								function truncate_140(txt) {
									if (!txt) return "";
									return txt.length > 140 ? txt.slice(0, 140) + "..." : txt;
								}
								// Hyphen wrap for ID
								function hyphen_wrap(id) {
									if (!id) return "";
									// Escape first then insert <wbr> after '-'
									let safe = esc(id);
									return safe.replace(/-/g, "-<wbr>");
								}
								rows.forEach((row) => {
									html +=
										`<tr class="req-row ${row_class(row)}" data-name="${esc(row.name)}"` +
										` data-title="${esc(row.title || "")}" data-status="${esc(
											row.requirement_status || ""
										)}"` +
										` data-priority="${esc(row.priority || "")}" data-category="${esc(
											row.category || ""
										)}"` +
										` data-tech_validation="${esc(
											row.tech_validation || ""
										)}" data-validation_date="${esc(row.validation_date || "")}"` +
										// ` data-validation_by="${esc(row.validation_by || '')}" `
										+`data-validation_by_name="${esc(row.validation_by_name || "")}"` +
										` data-validation_reason="${esc(
											row.validation_reason || ""
										)}" data-description="${esc(row.description || "")}">`;
									columns.forEach((c) => {
										if (c.key === "name") {
											// Hyphen-based wrapping for ID
											const id_display = hyphen_wrap(row.name || "");
											html += `<td class="id-cell" title="${esc(
												row.name || ""
											)}">${id_display}</td>`;
										} else if (c.key === "description") {
											const raw = row.description || "";
											const plain = strip_html(raw);
											const truncated = truncate_140(plain);
											html += `<td class="desc-cell" title="${esc(plain)}">${esc(
												truncated
											)}</td>`;
										} else if (c.key === "title") {
											html += `<td class="title-cell" title="${esc(
												row.title || ""
											)}">${esc(row.title || "")}</td>`;
										} else if (c.key === "validation_reason") {
											const vr_raw = row.validation_reason || "";
											const vr_plain = strip_html(vr_raw);
											const vr_trunc = truncate_140(vr_plain);
											html += `<td class="desc-cell" title="${esc(vr_plain)}">${esc(
												vr_trunc
											)}</td>`;
										} else if (c.key === "tech_validation") {
											const tv =
												String(row.tech_validation) === "1" ||
												row.tech_validation === 1 ||
												row.tech_validation === true;
											html += `<td class="text-center">${
												tv
													? '<span class="tech-val-icon" title="Validated">&#10003;</span>'
													: '<span class="tech-val-icon off" title="Not Validated">&#10007;</span>'
											}</td>`;
										} else if (c.key === "actions") {
											html += `<td class="action-cell" style="min-width:70px;">
                                        <button class="btn btn-xs btn-primary open-req" data-name="${esc(
											row.name
										)}">${__("Open")}</button>
                                        <button class="btn btn-xs btn-secondary edit-req" data-name="${esc(
											row.name
										)}">${__("Edit")}</button>
                                    </td>`;
										} else {
											html += `<td>${esc(row[c.key] || "")}</td>`;
										}
									});
									html += "</tr>";
								});
								html += "</tbody></table></div>";
								html += `<div class="mt-2 small text-muted">${__("Total")}: ${total}</div>`;
							}
							dlg.fields_dict.requirements_html.$wrapper.html(html);
							bind_row_events();
						}

						function render_pagination(total) {
							const total_pages = Math.max(1, Math.ceil(total / state.page_size));
							if (state.page > total_pages) state.page = total_pages;
							let html =
								'<div class="d-flex justify-content-between align-items-center" style="margin-top:8px; gap:12px;">';
							html += '<div class="d-flex align-items-center gap">';
							html += `<button class="btn btn-xs btn-default pag-btn" data-dir="prev" ${
								state.page <= 1 ? "disabled" : ""
							}>${__("Prev")}</button>`;
							html += `<span style="padding:0 8px">${__("Page")} ${
								state.page
							} / ${total_pages}</span>`;
							html += `<button class="btn btn-xs btn-default pag-btn" data-dir="next" ${
								state.page >= total_pages ? "disabled" : ""
							}>${__("Next")}</button>`;
							html += "</div>";
							html += `<div><button class="btn btn-sm btn-secondary add-req-inline">${__(
								"Add Requirement"
							)}</button></div>`;
							html += "</div>";
							dlg.fields_dict.pagination_html.$wrapper.html(html);
							const wrap = dlg.fields_dict.pagination_html.$wrapper;
							wrap.find(".pag-btn").on("click", function () {
								const dir = $(this).data("dir");
								if (dir === "prev" && state.page > 1) {
									state.page -= 1;
								}
								if (dir === "next") {
									state.page += 1;
								}
								fetch_and_render();
							});
							wrap.find(".add-req-inline").on("click", () => open_add_requirement_dialog());
						}

						function open_add_requirement_dialog() {
							const add_req = new frappe.ui.Dialog({
								title: __("Add Requirement"),
								fields: [
									{
										fieldname: "project_id",
										label: "Project ID",
										fieldtype: "Link",
										options: "Projects Brief",
										default: frm.doc.name,
										read_only: 1,
									},
									{ fieldname: "title", label: "Title", fieldtype: "Data", reqd: 1 },
									{
										fieldname: "requirement_status",
										label: "Requirement Status",
										fieldtype: "Select",
										options: " \nPending",
										default: " ",
									},
									{
										fieldname: "priority",
										label: "Priority",
										fieldtype: "Select",
										options: "Low\nMedium\nHigh",
										default: "Medium",
										reqd: 1,
									},
									{
										fieldname: "category",
										label: "Category",
										fieldtype: "Select",
										options: "Integrasi\nFungsi\nData\nSecurity",
									},
									{
										fieldname: "description",
										label: "Description",
										fieldtype: "Text Editor",
									},
								],
								primary_action_label: __("Submit"),
								primary_action(values) {
									add_req.set_primary_action(__("Processing..."));
									frappe.call({
										method: "erpnext.project_management.doctype.projects_brief.projects_brief.create_requirements",
										args: { data: values },
										freeze: true,
										callback: function (r) {
											add_req.hide();
											if (r.message && r.message.name) {
												frappe.show_alert({
													message: __("Requirement created"),
													indicator: "green",
												});
												fetch_and_render();
											} else {
												frappe.msgprint(__("Failed to create Requirement."));
											}
										},
									});
								},
							});
							add_req.show();
						}

						function bind_row_events() {
							dlg.$wrapper
								.find(".edit-req")
								.off("click")
								.on("click", function () {
									const name = $(this).data("name");
									const tr = dlg.$wrapper.find(`tr[data-name="${name}"]`);
									open_edit_dialog(name, tr.data());
								});
							// Open button
							dlg.$wrapper
								.find(".open-req")
								.off("click")
								.on("click", function () {
									const docname = $(this).data("name");
									frappe.set_route("Form", "Requirements", docname);
								});
						}

						function open_edit_dialog(name, data_attrs) {
							const ed = new frappe.ui.Dialog({
								title: __("Edit Requirement {0}", [data_attrs.title]),
								fields: [
									{
										fieldname: "title",
										fieldtype: "Data",
										label: "Title",
										reqd: 1,
										default: data_attrs.title,
									},
									{
										fieldname: "requirement_status",
										fieldtype: "Select",
										label: "Status",
										options: " \nAccepted\nPending\nDenied",
										default: data_attrs.status,
									},
									{
										fieldname: "priority",
										fieldtype: "Select",
										label: "Priority",
										options: "Low\nMedium\nHigh",
										default: data_attrs.priority,
									},
									{
										fieldname: "category",
										fieldtype: "Select",
										label: "Category",
										options: "Integrasi\nFungsi\nData\nSecurity",
										default: data_attrs.category,
									},
									{
										fieldname: "description",
										fieldtype: "Text Editor",
										label: "Description",
										default: data_attrs.description,
									},
									{
										fieldname: "tech_validation",
										fieldtype: "Check",
										label: "Tech Validation",
										default: data_attrs.tech_validation ? 1 : 0,
									},
									{
										fieldname: "validation_reason",
										fieldtype: "Long Text",
										label: "Validation Reason",
										default: data_attrs.validation_reason,
									},
									{
										fieldname: "validation_date",
										fieldtype: "Date",
										label: "Validation Date",
										default: data_attrs.validation_date,
									},
									{
										fieldname: "validation_by",
										fieldtype: "Link",
										options: "Employee",
										label: "Validation By",
										default: data_attrs.validation_by,
									},
									{
										fieldname: "validation_by_name",
										fieldtype: "Data",
										label: "Validation By Name",
										default: data_attrs.validation_by_name,
										read_only: 1,
										description: __("Auto-filled from Employee"),
									},
								],
								primary_action_label: __("Save"),
								primary_action(vals) {
									// If tech_validation unchecked, force-clear validation fields before sending
									if (!vals.tech_validation) {
										// Use empty string for link/data fields (safer for some set_value behaviors on read_only fields)
										vals.validation_date = null; // null for Date is fine
										vals.validation_by = "";
										vals.validation_by_name = "";
										vals.validation_reason = "";
									}
									frappe.call({
										method: "erpnext.project_management.doctype.projects_brief.projects_brief.update_requirement",
										args: { name, data: vals },
										freeze: true,
										callback: (r) => {
											ed.hide();
											frappe.show_alert({
												message: __("Updated {0}", [name]),
												indicator: "green",
											});
											open_changelog_dialog(name, "edit", () => {
												fetch_and_render();
											});
										},
									});
								},
							});

							// Grab field objects
							const tv_field = ed.get_field("tech_validation");
							const vdate_field = ed.get_field("validation_date");
							const vby_field = ed.get_field("validation_by");
							const vbyname_field = ed.get_field("validation_by_name");
							const vreason_field = ed.get_field("validation_reason");

							// Align checkbox to right
							setTimeout(() => {
								// Remove float approach (was causing layout issues) and use flex alignment instead
								tv_field.$wrapper.css({
									display: "flex",
									"justify-content": "flex-end",
									"align-items": "center",
									"margin-top": "4px",
									"margin-bottom": "4px",
								});
								// Ensure checkbox group not stretched full width visually
								tv_field.$wrapper.find(".checkbox").css({ margin: 0 });
								tv_field.$wrapper
									.find("label")
									.css({ "font-weight": "600", margin: "0 0 0 6px" });
							}, 0);

							function fetch_current_employee(cb) {
								frappe.db
									.get_value("Employee", { user_id: frappe.session.user }, [
										"name",
										"employee_name",
									])
									.then((r) => {
										if (r && r.message) cb(r.message.name, r.message.employee_name || "");
										else cb(null, null);
									});
							}

							function toggle_validation_fields(show) {
								const method = show ? "show" : "hide";
								vdate_field.$wrapper[method]();
								vby_field.$wrapper[method]();
								vbyname_field.$wrapper[method]();
								vreason_field.$wrapper[method]();
							}

							function apply_validation_defaults(force_refresh_date = false) {
								if (force_refresh_date || !vdate_field.get_value()) {
									ed.set_value("validation_date", frappe.datetime.get_today());
								}
								if (!vby_field.get_value()) {
									fetch_current_employee((emp, emp_name) => {
										if (emp) {
											ed.set_value("validation_by", emp);
											ed.set_value("validation_by_name", emp_name);
										}
									});
								} else if (!vbyname_field.get_value() && vby_field.get_value()) {
									frappe.db
										.get_value("Employee", vby_field.get_value(), ["employee_name"])
										.then((r) => {
											ed.set_value(
												"validation_by_name",
												(r && r.message && r.message.employee_name) || ""
											);
										});
								}
							}

							// Explicit clearing helper to avoid race conditions & ensure UI reflects blank values
							function clear_validation_fields() {
								ed.set_value("validation_date", null);
								ed.set_value("validation_by", "");
								ed.set_value("validation_by_name", "");
								ed.set_value("validation_reason", "");
								// Force DOM update for read-only field (sometimes set_value on read_only may be ignored visually)
								if (vbyname_field && vbyname_field.$input) {
									vbyname_field.$input.val("");
								}
							}

							// Initial state
							const initially_checked = !!tv_field.get_value();
							toggle_validation_fields(initially_checked);
							if (initially_checked) apply_validation_defaults(false);

							// Bind change event
							tv_field.$input.on("change", () => {
								const checked = tv_field.$input.is(":checked");
								// Use dialog set_value to update internal value; avoid potential re-trigger loops with field.set_value
								ed.set_value("tech_validation", checked ? 1 : 0);
								if (!checked) {
									// Clear BEFORE hiding so user sees fields blank if they re-check quickly
									clear_validation_fields();
								}
								toggle_validation_fields(checked);
								if (checked) {
									apply_validation_defaults(true);
								}
							});

							// Sync validation_by_name when user manually changes validator
							vby_field.$input.on("change awesomplete-selectcomplete blur", () => {
								setTimeout(() => {
									const emp = vby_field.get_value();
									if (!emp) {
										ed.set_value("validation_by_name", "");
										return;
									}
									frappe.db.get_value("Employee", emp, ["employee_name"]).then((r) => {
										ed.set_value(
											"validation_by_name",
											(r &&
												r.message &&
												(r.message.full_name || r.message.employee_name)) ||
												""
										);
									});
								}, 30);
							});

							ed.show();
						}

						// Style filter row: place Apply Filters button on the right
						const status_w = dlg.get_field("status").$wrapper;
						const priority_w = dlg.get_field("priority").$wrapper;
						const refresh_w = dlg.get_field("refresh").$wrapper;
						// Make them inline
						status_w.css({ display: "inline-block", width: "32%", "vertical-align": "top" });
						priority_w.css({
							display: "inline-block",
							width: "32%",
							"vertical-align": "top",
							"margin-left": "8px",
						});
						refresh_w.css({
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

					make_dialog();
				},
				__("Actions")
			);

			// (Standalone Add Documents button removed; integrated inside Show Documents dialog pagination)

			// --- Show Documents Button ---
			frm.add_custom_button(
				"Show Documents",
				function () {
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
											html += `<td class="id-cell" title="${esc(
												row.name
											)}">${idd}</td>`;
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
												if (filename.length > 40)
													filename = filename.slice(0, 37) + "…";
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
										default: frm.doc.project_name,
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
												related_document_name: frm.doc.project_name,
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
											options:
												"\nKontrak\nKAK\nProposal\nSpec\nMoM\nNDA\nAgreement\nMom",
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

						// Style filter row inline
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
				},
				__("Actions")
			);
		}
	},
	project_origin(frm) {
		update_pipeline_visibility(frm);
	},
	project_type(frm) {
		update_pipeline_visibility(frm);
		sync_pipeline_client(frm);
	},
	pipeline_id(frm) {
		sync_pipeline_client(frm);
	},
});

function update_pipeline_visibility(frm) {
	if (!frm || !frm.doc) return;
	// Dianggap pipeline jika salah satu field origin/type bernilai 'Pipeline'
	const is_pipeline = frm.doc.project_origin === "Pipeline" || frm.doc.project_type === "Pipeline";

	frm.toggle_display("pipeline_id", is_pipeline);

	// Bersihkan pipeline_id ketika sudah bukan pipeline lagi untuk mencegah data nyangkut
	if (!is_pipeline && frm.doc.pipeline_id) {
		frm.set_value("pipeline_id", null);
		// Juga kosongkan client_id jika sebelumnya diisi otomatis dari pipeline
		if (frm.doc.client_id) {
			frm.set_value("client_id", null);
		}
	}
}

function sync_pipeline_client(frm) {
	if (!frm || !frm.doc) return;
	const is_pipeline_context = frm.doc.project_type === "Pipeline" || frm.doc.project_origin === "Pipeline";

	if (!is_pipeline_context) return; // hanya dalam konteks pipeline

	if (!frm.doc.pipeline_id) {
		if (frm.doc.client_id) frm.set_value("client_id", null);
		return;
	}

	const pipeline_field = frm.fields_dict.pipeline_id;
	const pipeline_doctype = pipeline_field?.df?.options || "Pipeline";

	// Pastikan dokumen pipeline dimuat agar bisa ambil field lain di masa depan tanpa extra query
	frappe.model.with_doc(pipeline_doctype, frm.doc.pipeline_id, () => {
		const pipeline_doc = frappe.model.get_doc(pipeline_doctype, frm.doc.pipeline_id);
		if (pipeline_doc && pipeline_doc.client_id && pipeline_doc.client_id !== frm.doc.client_id) {
			frm.set_value("client_id", pipeline_doc.client_id);
			frm.set_value("project_name", pipeline_doc.project_name);
		}
	});
}

// Unified function to open Changelog dialog and create a Changelogs doc
function open_changelog_dialog(requirements_id, action_type, after_submit_callback) {
	if (!requirements_id) {
		if (after_submit_callback) after_submit_callback();
		return;
	}
	// Build a smart placeholder description
	const default_desc =
		action_type === "create"
			? __("Initial creation of Requirement {0}", [requirements_id])
			: __("Update performed on Requirement {0}", [requirements_id]);

	const cd = new frappe.ui.Dialog({
		title: __("Log Changes for {0}", [requirements_id]),
		fields: [
			{
				fieldname: "requirements_id",
				fieldtype: "Link",
				label: __("Requirements ID"),
				options: "Requirements",
				default: requirements_id,
				read_only: 1,
			},
			{
				fieldname: "date",
				fieldtype: "Date",
				label: __("Date"),
				default: frappe.datetime.get_today(),
				reqd: 1,
			},
			{
				fieldname: "change_description",
				fieldtype: "Long Text",
				label: __("Change Description"),
				default: default_desc,
				reqd: 1,
			},
			{ fieldname: "change_by", fieldtype: "Link", label: __("Change By"), options: "Employee" },
			{
				fieldname: "change_by_name",
				fieldtype: "Data",
				label: __("Change By Name"),
				read_only: 1,
				description: __("Auto-filled from Employee"),
			},
		],
		primary_action_label: __("Submit Log"),
		secondary_action_label: __("Skip"),
		primary_action(values) {
			cd.set_primary_action(__("Saving..."));
			frappe.call({
				method: "frappe.client.insert",
				args: {
					doc: {
						doctype: "Changelogs",
						requirements_id: values.requirements_id,
						date: values.date,
						change_description: values.change_description,
						change_by: values.change_by || null,
					},
				},
				callback: (r) => {
					cd.hide();
					frappe.show_alert({ message: __("Changelog saved"), indicator: "green" });
					if (after_submit_callback) after_submit_callback();
				},
				always: () => {
					cd.set_primary_action(__("Submit Log"));
				},
			});
		},
		secondary_action() {
			cd.hide();
			if (after_submit_callback) after_submit_callback();
		},
	});

	const cby_field = cd.get_field("change_by");
	const cbyname_field = cd.get_field("change_by_name");

	function fetch_current_employee(cb) {
		frappe.db
			.get_value("Employee", { user_id: frappe.session.user }, ["name", "employee_name"])
			.then((r) => {
				if (r && r.message) cb(r.message.name, r.message.employee_name || "");
				else cb(null, null);
			});
	}

	function auto_fill_employee() {
		if (!cby_field.get_value()) {
			fetch_current_employee((emp, emp_name) => {
				if (emp) {
					cd.set_value("change_by", emp);
					cd.set_value("change_by_name", emp_name);
				}
			});
		} else if (!cbyname_field.get_value() && cby_field.get_value()) {
			frappe.db.get_value("Employee", cby_field.get_value(), ["employee_name"]).then((r) => {
				cd.set_value("change_by_name", (r && r.message && r.message.employee_name) || "");
			});
		}
	}

	// Initial autofill
	auto_fill_employee();

	// Update name when user changes change_by
	cby_field.$input.on("change awesomplete-selectcomplete blur", () => {
		setTimeout(() => {
			const emp = cby_field.get_value();
			if (!emp) {
				cd.set_value("change_by_name", "");
				return;
			}
			frappe.db.get_value("Employee", emp, ["employee_name"]).then((r) => {
				cd.set_value(
					"change_by_name",
					(r && r.message && (r.message.full_name || r.message.employee_name)) || ""
				);
			});
		}, 40);
	});

	cd.show();
}
