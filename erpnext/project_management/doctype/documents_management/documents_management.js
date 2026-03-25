// Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Documents Management", {
    refresh(frm) {
        autofill_uploaded_by_fields(frm);
        if (frm.is_new()) {
            frm.set_df_property("status", "options", ["Active"]);
            frm.set_value("status", "Active");
        }
    },
    onload(frm) {
        // Dynamic filter for related_id based on selected doctype (optional can be expanded)
        frm.set_query("related_id", function () {
            if (!frm.doc.related_to) { return { filters: { name: ["is", "set"] } }; }
            return { doctype: frm.doc.related_to };
        });
    },
    related_to(frm) {
        frm.set_value("related_id", null);
        frm.set_value("related_document_name", null);
    },
    related_id(frm) {
        if (frm.doc.related_to && frm.doc.related_id) {
            frappe.call({
                method: "erpnext.project_management.doctype.documents_management.documents_management.get_related_doc_title",
                args: { doctype: frm.doc.related_to, name: frm.doc.related_id },
                callback(r) {
                    if (r.message) {
                        frm.set_value("related_document_name", r.message);
                    }
                }
            });
        } else {
            frm.set_value("related_document_name", null);
        }
    }
});

function autofill_uploaded_by_fields(frm, opts) {
    opts = opts || {};
    if (!frm || !frm.doc) return;

    const needs_date = !frm.doc.created_date || opts.force;
    const needs_by = !frm.doc.uploaded_by || opts.force;
    const needs_by_name = !frm.doc.uploaded_by_name || opts.force;
    if (!needs_by && !needs_by_name) return;

    if (needs_date) {
        frm.set_value('created_date', frappe.datetime.get_today());
    }

    if (needs_by || needs_by_name) {
        // We assume there is a mapping from current user to Employee via frappe.session.user
        // Common patterns: a field user_id/email on Employee matching user, OR using frappe.call to server.
        // We'll attempt a quick client query first; adjust if your doctype differs.
        frappe.db.get_value('Employee', { user_id: frappe.session.user }, ['name', 'employee_name']).then(r => {
            const msg = r && r.message;
            if (!msg) return;
            const emp = msg.name || msg.employee;
            const emp_name = msg.employee_name;
            if (needs_by && emp) {
                frm.set_value('uploaded_by', emp);
            }
            if (needs_by_name && emp_name) {
                frm.set_value('uploaded_by_name', emp_name);
            }
        });
    }
}