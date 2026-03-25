# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class PartnerProjects(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		contact_info: DF.Phone | None
		contact_person: DF.Data | None
		notes: DF.Text | None
		partner_name: DF.Data | None
		role: DF.Data | None
		status: DF.Literal["Active"]
	# end: auto-generated types

	pass
