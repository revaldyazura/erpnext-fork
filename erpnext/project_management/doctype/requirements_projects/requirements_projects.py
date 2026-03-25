# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.naming import make_autoname


class RequirementsProjects(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		category: DF.Data | None
		description: DF.LongText | None
		employee_name: DF.Data | None
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		pipeline_id: DF.Link | None
		priority: DF.Literal["Low", "Medium", "High"]
		project_id: DF.Link | None
		requirement_status: DF.Literal["Accepted", "Pending", "Denied"]
		tech_validation: DF.Data | None
		title: DF.Data | None
		validation_by: DF.Link | None
		validation_date: DF.Date | None
		validation_reason: DF.Data | None
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
