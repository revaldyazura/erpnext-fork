# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
import json
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import now_datetime, getdate
from frappe.exceptions import DuplicateEntryError

class ProjectsBrief(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from erpnext.project_management.doctype.approval_by.approval_by import ApprovalBy
		from erpnext.project_management.doctype.project_team.project_team import ProjectTeam
		from frappe.types import DF

		approval_by: DF.Table[ApprovalBy]
		channel: DF.Data | None
		client_id: DF.Link | None
		client_name: DF.Data | None
		description: DF.TextEditor | None
		end_date: DF.Date | None
		notes: DF.LongText | None
		pipeline_id: DF.Link | None
		project_manager: DF.Link | None
		project_manager_name: DF.Data | None
		project_name: DF.Data | None
		project_origin: DF.Literal["Pipeline", "RnD", "Direct"]
		project_owner: DF.Link | None
		project_owner_name: DF.Data | None
		project_team: DF.Table[ProjectTeam]
		project_type: DF.Literal["", "SaaS", "On Premise", "Hybrid", "Research"]
		start_date: DF.Date | None
		status: DF.Literal["Ongoing", "On hold", "Pre Approved"]
	# end: auto-generated types

	def autoname(self):
		if self.project_origin == 'Pipeline' or self.project_origin == 'Direct':
			year = now_datetime().year
			client_alias = frappe.get_doc("Client", self.client_id).client_alias
			base = f"PRJ-{year}-{client_alias}"
			self.name = make_autoname(f"{base}-.####")
		elif self.project_origin == 'RnD':
			year = now_datetime().year
			base = f"RND-{year}-INT"
			self.name = make_autoname(f"{base}-.####")


@frappe.whitelist()
def create_requirements(data):
	"""Create a Requirements document from Projects Brief dialog.

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

	project_id = (data.get("project_id") or "").strip() or None
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
	if not project_id :
		frappe.throw("Project ID must be provided.")

	# Existence checks (permission aware)
	# if pipeline_id:
	# 	frappe.get_doc("Pipeline Projects", pipeline_id)

	# Build new doc
	req_doc = frappe.get_doc({
		"doctype": "Requirements",
		"project_id": project_id,
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
def get_requirements(project_id: str):
	"""Fetch Requirements linked to a Projects Brief doc with optional filters & pagination.

	Args:
		project_id (str): Parent project brief name.
		status (str, optional): Filter by requirement_status.
		priority (str, optional): Filter by priority.
		page (int, optional): Page number (1-based).
		page_size (int, optional): Items per page (default 50, max 200).

	Returns dict: { rows: [...], total: int, page: int, page_size: int }
	"""
	if not project_id:
		frappe.throw("project_id is required")

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

	filters = {'project_id': project_id}
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

	# If tech_validation is 0, proactively clear all validation-related fields (including fetched name)
	if not getattr(doc, 'tech_validation', 0):
		doc.validation_date = None
		doc.validation_by = None
		doc.validation_reason = None
		# validation_by_name is a fetched (stored) field; clear it so UI/table shows blank
		if hasattr(doc, 'validation_by_name'):
			doc.validation_by_name = None

	doc.save()  # triggers validate & any naming logic
	frappe.db.commit()
	return { 'name': doc.name }
