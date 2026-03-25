# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import now_datetime, getdate
from frappe.exceptions import DuplicateEntryError


class PartnerContract(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		contract_end: DF.Date | None
		contract_start: DF.Date | None
		contract_type: DF.Literal["NDA + Subkontrak", "Konsultan + Audit", "Subkontrak", "Konsultan Forensik", "Audit", "Konsultan", "Audit + Support"]
		notes: DF.Text | None
		partner_id: DF.Link | None
		partner_name: DF.Data | None
		project_id: DF.Link | None
		project_name: DF.Data | None
		scope: DF.Data | None
		status: DF.Literal["Active", "Completed", "Planned"]
	# end: auto-generated types

	def autoname(self):
		if self.project_id:
			year = now_datetime().year
			client_id = frappe.get_doc("Projects Brief", self.project_id).client_id
			client_alias = frappe.get_doc("Client", client_id).client_alias
			base = f"CTR-{year}-{client_alias}"
			self.name = make_autoname(f"{base}-.####")
