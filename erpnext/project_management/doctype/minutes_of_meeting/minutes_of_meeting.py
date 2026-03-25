# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import now_datetime, getdate
from frappe.exceptions import DuplicateEntryError


class MinutesofMeeting(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from erpnext.project_management.doctype.internal_participants.internal_participants import InternalParticipants
		from frappe.types import DF

		action_items: DF.Data | None
		created_by: DF.Link | None
		created_by_name: DF.Data | None
		date: DF.Date | None
		due_date: DF.Date | None
		external_participants: DF.Text | None
		feedback_summary: DF.Data | None
		internal_participants: DF.Table[InternalParticipants]
		notes: DF.Text | None
		project_id: DF.Link | None
		project_name: DF.Data | None
		status: DF.Literal["Open", "In Progress", "Completed", "In Review"]
		topic: DF.Data | None
	# end: auto-generated types

	def validate(self):
		print("validate subtask called")
		self._set_derived_fields()
	
	def _set_derived_fields(self):
		self.created_by = frappe.db.get_value("Employee", {"user_id": self.owner}, "name")
		self.created_by_name = frappe.db.get_value("Employee", {"user_id": self.owner}, "employee_name")
  
	def autoname(self):
		if self.project_id:
			year = now_datetime().year
			client_id = frappe.get_doc("Projects Brief", self.project_id).client_id
			client_alias = frappe.get_doc("Client", client_id).client_alias
			base = f"MFB-{year}-{client_alias}"
			self.name = make_autoname(f"{base}-.####")
