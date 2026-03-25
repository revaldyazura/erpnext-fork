# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, getdate
from frappe.model.naming import make_autoname
from frappe.exceptions import DuplicateEntryError


class Requirements(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		category: DF.Literal["Integrasi", "Fungsi", "Data", "Security"]
		description: DF.TextEditor | None
		pipeline_id: DF.Link | None
		pipeline_project_name: DF.Data | None
		priority: DF.Literal["Low", "Medium", "High"]
		project_id: DF.Link | None
		project_name: DF.Data | None
		requirement_status: DF.Literal["", "Accepted", "Pending", "Denied"]
		tech_validation: DF.Check
		title: DF.Data | None
		validation_by: DF.Link | None
		validation_by_name: DF.Data | None
		validation_date: DF.Date | None
		validation_reason: DF.LongText | None
	# end: auto-generated types

 
	def validate(self):
		print("validate requirements called")
		self.validate_requirements()
	def validate_requirements(self):
		if not self.pipeline_id and not self.project_id:
			frappe.throw("Either Pipeline ID or Project ID must be set in Requirements.")
		if self.pipeline_id and self.project_id:
			frappe.throw("Only one of Pipeline ID or Project ID can be set in Requirements.")
  
	def autoname(self):
		if self.pipeline_id:
			pipeline = frappe.get_doc("Pipeline Projects", self.pipeline_id)
			client = frappe.get_doc("Client", pipeline.client_id)
			client_alias = client.client_alias
			sub_unit_alias = client.sub_unit_alias
			base = f"REQ-RAW-{client_alias}-{sub_unit_alias}"
		elif self.project_id:
			if 'RND' in self.project_id:
				base = "REQ-RND-INT"
			else:
				project = frappe.get_doc("Projects Brief", self.project_id)
				client = frappe.get_doc("Client", project.client_id)
				client_alias = client.client_alias
				sub_unit_alias = client.sub_unit_alias
				base = f"REQ-PRJ-{client_alias}-{sub_unit_alias}"
		else:
			frappe.throw("Either Pipeline ID or Project ID must be set.")
		self.name = make_autoname(f"{base}-.####")

@frappe.whitelist()
def maybe_rename(name):
	
	latest_doc = frappe.get_doc('Requirements', name)

	year = now_datetime().year 
	# year = getdate(doc.creation).year

	if latest_doc.pipeline_id:
		pipeline = frappe.get_doc("Pipeline Projects", latest_doc.pipeline_id)
		client = frappe.get_doc("Client", pipeline.client_id)
		client_alias = client.client_alias
		sub_unit_alias = client.sub_unit_alias
		base = f"REQ-RAW-{client_alias}-{sub_unit_alias}"
	elif latest_doc.project_id:
		if 'RND' in latest_doc.project_id:
			base = "REQ-RND-INT"
		else:
			project = frappe.get_doc("Projects Brief", latest_doc.project_id)
			client = frappe.get_doc("Client", project.client_id)
			client_alias = client.client_alias
			sub_unit_alias = client.sub_unit_alias
			base = f"REQ-PRJ-{client_alias}-{sub_unit_alias}"

	if latest_doc.name.startswith(f"{base}-"):
		return latest_doc.name

	new_name = make_autoname(f"{base}-.####")
	if new_name == latest_doc.name:
		return latest_doc.name

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
		renamed_to = frappe.rename_doc('Pipeline Projects', name, new_name,
										force=True, merge=False)
		return renamed_to

@frappe.whitelist()
def get_changelogs(requirements_id: str):
	"""Fetch Changelogs linked to a Projects Brief doc with optional filters & pagination.

	Args:
		project_id (str): Parent project brief name.
		status (str, optional): Filter by requirement_status.
		priority (str, optional): Filter by priority.
		page (int, optional): Page number (1-based).
		page_size (int, optional): Items per page (default 50, max 200).

	Returns dict: { rows: [...], total: int, page: int, page_size: int }
	"""
	if not requirements_id:
		frappe.throw("requirements_id is required")

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

	filters = {'requirements_id': requirements_id}

	# Include stored field validation_by_name (already defined with fetch_from in Doctype)
	fields = [
		'name', 'requirements_id', 'date', 'change_description', 'change_by',
  	'change_by_name'
	]

	total = frappe.db.count('Changelogs', filters=filters)
	offset = (page - 1) * page_size
	rows = frappe.get_all(
		'Changelogs',
		filters=filters,
		fields=fields,
		order_by='creation desc',
		limit=page_size,
		start=offset
	)

	return {
		'rows': rows,
		'total': total,
		'page': page,
		'page_size': page_size
	}