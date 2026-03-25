#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import now_datetime, get_link_to_form
from frappe.exceptions import DuplicateEntryError


class PipelineProjects(Document):
    # begin: auto-generated types
    # This code is auto-generated. Do not modify anything in this block.

    from typing import TYPE_CHECKING

    if TYPE_CHECKING:
        from erpnext.project_management.doctype.approach_team.approach_team import ApproachTeam
        from erpnext.project_management.doctype.approval_by.approval_by import ApprovalBy
        from frappe.types import DF

        approval_by: DF.Table[ApprovalBy]
        client_id: DF.Link
        client_name: DF.Data | None
        estimate_value: DF.Currency
        members: DF.Table[ApproachTeam]
        notes: DF.LongText | None
        opportunity_source: DF.Literal["Direct Request", "Partner Referral", "Tender"]
        owner_pipeline: DF.Link
        owner_pipeline_name: DF.Data | None
        pipeline_percent: DF.Percent
        pipeline_status: DF.Link
        project_name: DF.Data
        sales_owner: DF.Link
        sales_owner_name: DF.Data | None
    # end: auto-generated types

    def autoname(self):
        year = now_datetime().year
        client_alias = frappe.get_doc("Client", self.client_id).client_alias
        base = f"PPL-{year}-{client_alias}"
        self.name = make_autoname(f"{base}-.####")

    def validate(self):
        """Validation rules including:
        1. Restrict who can toggle approvals (only the row's employee user can check/uncheck their own row)
        2. Set approved_on timestamps for new approvals
        3. Enforce Requirements validation before Converted status
        """
        # Approval toggle security
        old_rows_map = {}
        if not self.is_new():
            try:
                old_doc = frappe.get_doc(self.doctype, self.name)
                old_rows_map = {r.name: (r.approve, r.approved_on) for r in (old_doc.approval_by or [])}
            except Exception:
                old_rows_map = {}

        # Build employee -> user_id map in one query
        employee_names = {r.employee for r in (self.approval_by or []) if getattr(r, 'employee', None)}
        emp_user_map = {}
        if employee_names:
            emp_records = frappe.get_all('Employee', filters={'name': ('in', list(employee_names))}, fields=['name', 'user_id'])
            emp_user_map = {e.name: e.user_id for e in emp_records}

        current_user = frappe.session.user
        for row in (self.approval_by or []):
            prev_approve, prev_approved_on = old_rows_map.get(row.name, (0, None))
            emp_user = emp_user_map.get(row.employee)
            # New approval (unchecked -> checked)
            if row.approve and not prev_approve:
                if emp_user and emp_user != current_user:
                    frappe.throw(_( "Only the assigned approver {0} can approve this row.").format(row.employee_name or row.employee))
                if not row.approved_on:
                    row.approved_on = now_datetime()
            # Attempt to unapprove someone else's approval
            elif (not row.approve) and prev_approve:
                if emp_user and emp_user != current_user:
                    frappe.throw(_("You cannot remove approval for another approver: {0}.").format(row.employee_name or row.employee))

        # If trying to mark as Converted, enforce Requirements tech validation
        if getattr(self, 'pipeline_status', None) == 'Converted':
            if self.is_new():
                return
            reqs = frappe.get_all(
                'Requirements',
                filters={'pipeline_id': self.name},
                fields=['name', 'title', 'tech_validation']
            )
            if not reqs:
                frappe.throw(_( "Cannot set Pipeline Status to Converted because this Pipeline has no Requirements yet. Please create at least one Requirement and ensure it is Tech Validated."))
            unvalidated = [r for r in reqs if not (r.tech_validation == 1)]
            if unvalidated:
                preview = unvalidated[:10]
                lines = [f"- {frappe.utils.escape_html(r.name)}: {frappe.utils.escape_html(r.title or '')}" for r in preview]
                additional = ''
                if len(unvalidated) > len(preview):
                    additional = _("<br>... and {0} more not validated.").format(len(unvalidated) - len(preview))
                msg = _(
                    "Cannot set Pipeline Status to Converted because {0} Requirements are not Tech Validated:<br><br>{1}{2}"
                ).format(len(unvalidated), '<br>'.join(lines), additional)
                frappe.throw(msg)

        # Auto trigger conversion prompt logic handled client-side; here we only ensure integrity.


def update_fields(doc, method):
    pass


def _all_approvals_completed(doc) -> bool:
    rows = doc.approval_by or []
    return bool(rows) and all(getattr(r, 'approve', 0) for r in rows)


@frappe.whitelist()
def approve_and_maybe_convert(pipeline_id: str):
    """Server endpoint to be called after a save where approvals may have changed.
    If all approvals are complete and no Project Brief exists yet, return a flag so client can prompt conversion."""
    if not pipeline_id:
        frappe.throw('pipeline_id required')
    doc = frappe.get_doc('Pipeline Projects', pipeline_id)
    # Already converted or project exists? short-circuit
    existing = frappe.get_value('Projects Brief', {'pipeline_id': doc.name}, 'name')
    if existing:
        return {'ready': False, 'already_converted': True, 'project_brief': existing}
    return {'ready': _all_approvals_completed(doc)}


@frappe.whitelist()
def convert_to_project(pipeline_id: str):
    """Manual conversion of a Pipeline Project (with status 'Converted') into a Projects Brief.

    This encapsulates the logic that previously lived in update_fields().
    It is triggered explicitly from a custom button on the Pipeline Projects form.

    Returns dict with metadata about the conversion.
    """
    if not pipeline_id:
        frappe.throw("pipeline_id is required")

    doc = frappe.get_doc('Pipeline Projects', pipeline_id)

    if doc.pipeline_status != 'Converted':
        frappe.throw("Pipeline status must be 'Converted' to perform this action.")

    # If already converted (Projects Brief exists), return early
    existing = frappe.get_value("Projects Brief", {"pipeline_id": doc.name}, "name")
    if existing:
        return {
            'created': False,
            'already_exists': True,
            'project_brief': existing,
            'message': f"Projects Brief already exists: {existing}"
        }

    # Prepare child rows BEFORE insert (mandatory child tables on Projects Brief)
    team_source = list(doc.members or [])
    approval_source = list(doc.approval_by or [])

    if not team_source or not approval_source:
        frappe.throw(_("Cannot create Projects Brief because Project Team and Approval By are mandatory. Please ensure this Pipeline has Approach Team members and Approval By entries."))

    project_team_rows = [
        {
            "employee": r.employee,
            "employee_name": getattr(r, 'employee_name', None),
            "project_role": getattr(r, 'project_role', None),
        }
        for r in team_source
    ]

    approval_by_rows = [
        {
            "employee": r.employee,
            "employee_name": getattr(r, 'employee_name', None),
            "approve": 0,
            "approved_on": None,
        }
        for r in approval_source
    ]

    # Create Projects Brief including child rows so insert passes required checks
    new_project = frappe.get_doc({
        "doctype": "Projects Brief",
        "project_origin": "Pipeline",
        "pipeline_id": doc.name,
        "client_id": doc.client_id,
        "project_name": doc.project_name,
        "project_team": project_team_rows,
        "approval_by": approval_by_rows,
    })

    new_project.insert()

    # Copy Requirements (change parent link from pipeline to project)
    requirements = frappe.get_all("Requirements", filters={"pipeline_id": doc.name})
    for req in requirements:
        req_doc = frappe.get_doc("Requirements", req.name)
        req_copy = frappe.copy_doc(req_doc)
        req_copy.project_id = new_project.name
        req_copy.pipeline_id = None
        req_copy.insert()
    req_count = len(requirements)

    team_count = len(project_team_rows)
    approval_by_count = len(approval_by_rows)

    # Compose message (HTML) similar to previous implementation
    app_route = f"/app/projects-brief/{new_project.name}"
    open_btn = (
        f"<div style='margin-top:12px; display:flex; justify-content:flex-end;'>"
        f"<a class='btn btn-primary' href='{app_route}' style='min-width:170px; text-align:center;'>Open Project Brief</a>"
        f"</div>"
    )
    link_html = get_link_to_form("Projects Brief", new_project.name, label=new_project.project_name)
    msg_html = (
        f"Project Brief <b>{link_html}</b> (<code>{new_project.name}</code>) created from Pipeline Project "
        f"<b>{doc.project_name}</b> (<code>{doc.name}</code>).<br>"
        f"Copied <b>{req_count}</b> Requirements, <b>{team_count}</b> Approach Team members to Project Team and <b>{approval_by_count}</b> Approval By."  + open_btn
    )

    frappe.msgprint(msg_html, title="Project Brief Created", indicator="green")

    return {
        'created': True,
        'already_exists': False,
        'project_brief': new_project.name,
        'requirements_copied': req_count,
        'team_copied': team_count,
        'message_html': msg_html
    }


@frappe.whitelist()
def maybe_rename(name):
    """Rename Pipeline Projects doc to follow naming pattern if needed."""
    doc = frappe.get_doc('Pipeline Projects', name)

    year = now_datetime().year
    client_alias = frappe.db.get_value('Client', doc.client_id, 'client_alias') or ''
    base = f"PPL-{year}-{client_alias}"

    if doc.name.startswith(f"{base}-"):
        return doc.name

    new_name = make_autoname(f"{base}-.####")
    if new_name == doc.name:
        return doc.name

    try:
        renamed_to = frappe.rename_doc(
            doctype='Pipeline Projects',
            old=name,
            new=new_name,
            force=True,
            merge=False
        )
        return renamed_to
    except DuplicateEntryError:
        new_name = make_autoname(f"{base}-.####")
        renamed_to = frappe.rename_doc('Pipeline Projects', name, new_name, force=True, merge=False)
        return renamed_to


@frappe.whitelist()
def create_requirements(data):
    """Create a Requirements document from Pipeline Projects dialog.

    Data expected (dict): pipeline_id OR project_id (exclusive), title (reqd), optional: requirement_status, priority, description.
    Uses standard Doc API to trigger validations + autoname.
    """
    # Normalize incoming data (may arrive as dict, JSON string, or something unexpected)
    if data is None:
        data = {}
    elif isinstance(data, str):
        # Try parse JSON
        try:
            data = json.loads(data)
        except Exception:
            frappe.throw("Invalid data payload; must be JSON string or dict.")
    elif isinstance(data, (list, tuple)):
        # Accept list/tuple of 2-item pairs
        try:
            data = dict(data)
        except Exception:
            frappe.throw("Invalid sequence for data; expected list of key-value pairs.")
    elif not isinstance(data, dict):
        frappe.throw("Unsupported data type; expected dict or JSON string.")

    data = frappe._dict(data)

    pipeline_id = (data.get("pipeline_id") or "").strip() or None
    title = (data.get("title") or "").strip()
    req_status = data.get("requirement_status")
    priority = data.get("priority") or "Medium"
    description = data.get("description") or None
    tech_validation = data.get("tech_validation") or None
    # For Check field: must preserve 0 (unchecked) vs 1 (checked). Avoid using `or None` which would drop 0.
    raw_tv = data.get("tech_validation")
    if raw_tv in (1, "1", True, "true", "True"):
        tech_validation = 1
    else:
        tech_validation = 0 if raw_tv in (0, "0", False, "false", "False", None, "") else 0
    validation_reason = data.get("validation_reason") or None
    category = data.get("category") or None
    validation_by = data.get("validation_by") or None
    validation_date = data.get("validation_date") or None

    if not title:
        frappe.throw("Title is required.")

    # Server-side origin validation (mirrors Requirements.validate)
    if not pipeline_id:
        frappe.throw("Either Pipeline ID must be provided.")

    # Build new doc
    req_doc = frappe.get_doc({
        "doctype": "Requirements",
        "pipeline_id": pipeline_id,
        "title": title,
        "tech_validation": tech_validation,
        "validation_reason": validation_reason,
        "category": category,
        "validation_by": validation_by,
        "validation_date": validation_date,
        "requirement_status": req_status,
        "priority": priority,
        "description": description
    })

    # Insert (runs validate + autoname)
    req_doc.insert()

    return {"name": req_doc.name}


@frappe.whitelist()
def get_requirements(pipeline_id: str):
    """Fetch Requirements linked to a Pipeline Projects doc with optional filters & pagination.

    Args:
        pipeline_id (str): Parent pipeline project name.
        status (str, optional): Filter by requirement_status.
        priority (str, optional): Filter by priority.
        page (int, optional): Page number (1-based).
        page_size (int, optional): Items per page (default 50, max 200).

    Returns dict: { rows: [...], total: int, page: int, page_size: int }
    """
    if not pipeline_id:
        frappe.throw("pipeline_id is required")

    status = frappe.form_dict.get('status') or frappe.local.form_dict.get('status') or None
    priority = frappe.form_dict.get('priority') or frappe.local.form_dict.get('priority') or None
    # Fallback from kwargs (if passed directly via frappe.call args)
    if 'status' in frappe.form_dict:  # already assigned
        pass
    page = frappe.form_dict.get('page') or 1
    page_size = frappe.form_dict.get('page_size') or 50
    try:
        page = int(page)
        page_size = int(page_size)
    except ValueError:
        page = 1
        page_size = 50
    page = max(page, 1)
    page_size = max(1, min(page_size, 200))

    filters = {'pipeline_id': pipeline_id}
    if status:
        filters['requirement_status'] = status
    if priority:
        filters['priority'] = priority

    # Include stored field validation_by_name (already defined with fetch_from in Doctype)
    fields = [
        'name', 'title', 'requirement_status', 'priority', 'category', 'tech_validation',
        'validation_date', 'validation_by', 'validation_by_name', 'validation_reason', 'description'
    ]

    total = frappe.db.count('Requirements', filters=filters)
    offset = (page - 1) * page_size
    rows = frappe.get_all(
        'Requirements',
        filters=filters,
        fields=fields,
        order_by='creation desc',
        limit=page_size,
        start=offset
    )

    # Rows already contain validation_by_name (fetched/stored). If any row lacks it but has validation_by,
    # attempt a lightweight fallback fetch (should be rare – e.g., legacy rows created before field existed).
    emps_to_fetch = [r.validation_by for r in rows if r.validation_by and not getattr(r, 'validation_by_name', None)]
    if emps_to_fetch:
        emp_docs = frappe.get_all('Employee', filters={'name': ('in', list(set(emps_to_fetch)))}, fields=['name', 'employee_name'])
        lookup = {e.name: (e.employee_name or e.name) for e in emp_docs}
        for r in rows:
            if r.validation_by and not getattr(r, 'validation_by_name', None):
                setattr(r, 'validation_by_name', lookup.get(r.validation_by))
    return {
        'rows': rows,
        'total': total,
        'page': page,
        'page_size': page_size
    }


@frappe.whitelist()
def update_requirement(name: str, data: dict | str | None = None):
    """Update editable fields of a Requirements record.

    Args:
        name: Requirements docname
        data: dict with any allowed fields
    """
    if not name:
        frappe.throw("Requirement name is required")

    # Normalize data: may arrive as JSON string
    if data is None:
        data = {}
    elif isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            frappe.throw("Invalid data payload; must be valid JSON.")
    elif not isinstance(data, dict):
        frappe.throw("Parameter 'data' must be a dict or JSON string.")

    doc = frappe.get_doc('Requirements', name)
    allowed = {
        'title', 'requirement_status', 'priority', 'category', 'tech_validation',
        'validation_date', 'validation_by', 'validation_reason', 'description', 'validation_by_name'
    }
    for k, v in data.items():
        if k in allowed:
            if k == 'tech_validation':
                v = 1 if v in (1, '1', True, 'true', 'True') else 0
            setattr(doc, k, v)

    # Clear validation related fields if tech_validation is disabled
    if not getattr(doc, 'tech_validation', 0):
        doc.validation_date = None
        doc.validation_by = None
        doc.validation_reason = None
        if hasattr(doc, 'validation_by_name'):
            doc.validation_by_name = None

    doc.save()  # triggers validate & any naming logic
    frappe.db.commit()
    return { 'name': doc.name }


@frappe.whitelist()
def pipeline_requirements_status(doctype, txt, searchfield, start, page_len, filters):
    # Fetch possible pipeline statuses, excluding 'Converted' if any linked Requirements are not tech validated.
    # NOTE:
    # 1. The first argument `doctype` here is the target Link doctype ("Asset Pipeline"), NOT the current form doc.
    # 2. To know which Pipeline Projects record is being edited, the client MUST send it via `filters` in frm.set_query.
    # 3. Previously code tried `doctype.pipeline_id` which will always fail because `doctype` is a string.

    pipeline_id = None
    if filters and isinstance(filters, dict):
        pipeline_id = filters.get('pipeline_id')

    if not pipeline_id:
        # Without pipeline context we can't decide whether to exclude 'Converted'. Return a plain search on Asset Pipeline.
        # Implement a safe fallback respecting search text & pagination.
        like_txt = f"%{txt or ''}%"
        rows = frappe.db.sql(
            """
                SELECT name
                FROM `tabAsset Pipeline`
                WHERE name LIKE %s
                ORDER BY pipeline_percent ASC, name ASC
                LIMIT %s OFFSET %s
            """,
            (like_txt, page_len, start or 0)
        )
        return rows

    user = frappe.session.user

    # Fetch related requirements once we have pipeline_id context
    reqs = frappe.get_all(
        'Requirements',
        filters={'pipeline_id': pipeline_id},
        fields=['name', 'tech_validation'],
        limit=500  # safeguard; normally should be far less
    )
    unvalidated = [r for r in reqs if not (r.tech_validation == 1)]

    like_txt = f"%{txt or ''}%"

    if unvalidated or not reqs:
        # Exclude 'Converted' when requirements incomplete
        pipeline_status_rows = frappe.db.sql(
            """
                SELECT name FROM `tabAsset Pipeline`
                WHERE name != 'Converted' AND name LIKE %s
                ORDER BY pipeline_percent ASC, name ASC
                LIMIT %s OFFSET %s
            """,
            (like_txt, page_len, start or 0)
        )
    else:
        pipeline_status_rows = frappe.db.sql(
            """
                SELECT name FROM `tabAsset Pipeline`
                WHERE name LIKE %s
                ORDER BY pipeline_percent ASC, name ASC
                LIMIT %s OFFSET %s
            """,
            (like_txt, page_len, start or 0)
        )

    return pipeline_status_rows


@frappe.whitelist()
def approval_by_query(doctype, txt, searchfield, start, page_len, filters):
    """Custom query for Employee link in Approval By child table.

    Issues in previous version:
    - INNER JOIN ke `tabApproval By` membuat hasil hanya employee yang SUDAH ada di child table (menyempitkan hasil menjadi 1 kalau baru satu baris terisi).
    - Menggunakan GROUP BY e.name tanpa DISTINCT bisa tetap benar, tetapi join ekstra men-duplicate sebelum grouping dan tidak perlu.

    Perbaikan:
    - Hilangkan join ke `tabApproval By` agar semua approver muncul.
    - Tambah opsi pengecualian employee yang sudah ada pada pipeline tertentu (jika filters mengirim pipeline_id) agar user tidak menambahkan duplikat.
    - Gunakan DISTINCT untuk menghindari duplikat karena multiple role rows.
    """

    role = (filters or {}).get('role') or 'Projects Approver'
    pipeline_id = (filters or {}).get('pipeline_id')  # optional
    search_txt = f"%{txt or ''}%"

    params = {
        'role': role,
        'txt': search_txt,
        'start': start,
        'page_len': page_len
    }

    exclusion_clause = ''
    if pipeline_id:
        # Exclude employees already present in this pipeline's Approval By child table
        exclusion_clause = "AND e.name NOT IN (SELECT apv.employee FROM `tabApproval By` apv WHERE apv.parent = %(pipeline_id)s)"
        params['pipeline_id'] = pipeline_id

    query = f"""
        SELECT DISTINCT e.name, e.employee_name
        FROM `tabEmployee` e
        JOIN `tabUser` u ON u.name = e.user_id
        JOIN `tabHas Role` hr ON hr.parent = u.name
        WHERE e.status = 'Active'
          AND hr.role = %(role)s
          AND (e.name LIKE %(txt)s OR e.employee_name LIKE %(txt)s)
          {exclusion_clause}
        ORDER BY e.employee_name
        LIMIT %(page_len)s OFFSET %(start)s
    """

    employees = frappe.db.sql(query, params)
    return [(emp[0], emp[1]) for emp in employees]