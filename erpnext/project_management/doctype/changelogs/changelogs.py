# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class Changelogs(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		change_by: DF.Link | None
		change_by_name: DF.Data | None
		change_description: DF.Text | None
		date: DF.Date | None
		requirements_id: DF.Link | None
		requirements_title: DF.Data | None
	# end: auto-generated types

	pass
