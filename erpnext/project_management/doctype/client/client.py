# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class Client(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		city: DF.Link | None
		client_alias: DF.Data
		client_name: DF.Data
		contact_number: DF.Phone | None
		email: DF.Data | None
		notes: DF.LongText | None
		pic_name: DF.Data | None
		pic_role: DF.Data | None
		preffered_contact_method: DF.Data | None
		sector: DF.Data | None
		sub_unit: DF.Data
		sub_unit_alias: DF.Data
	# end: auto-generated types

	pass
