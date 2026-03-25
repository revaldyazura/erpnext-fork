# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe


class DocumentsManagement(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		attachment: DF.Attach | None
		created_date: DF.Date | None
		document_title: DF.Data | None
		document_type: DF.Literal["Kontrak", "KAK", "Proposal", "Spec", "MoM", "NDA", "Agreement", "Mom"]
		notes: DF.Text | None
		related_document_name: DF.Data | None
		related_id: DF.DynamicLink | None
		related_to: DF.Literal["Pipeline Projects", "Projects Brief", "Client", "Requirements", "Changelogs", "Minutes of Meeting", "Partner Projects", "Partner Contract"]
		status: DF.Literal["Active", "Archived"]
		uploaded_by: DF.Link | None
		uploaded_by_name: DF.Data | None
		version: DF.Data | None
	# end: auto-generated types

	pass

def update_fields(doc, method):
	"""Populate related_document_name with a human readable title from dynamic link.

	Logic:
	1. Ensure we have both parts of the Dynamic Link: related_to (doctype) & related_id (name)
	2. Get the meta of target doctype and determine its title field (if any)
	3. Fetch that field's value via frappe.db.get_value for efficiency
	4. Fallback chain: title value -> related_id (the name)
	5. Only set the field if it's empty or stale (optional simple refresh)

	This can be hooked on validate / before_save / before_insert.
	"""
	if not (doc.related_to and doc.related_id):
		return

	try:
		meta = frappe.get_meta(doc.related_to)
		# meta.get_title_field() returns the title field name or "name" fallback
		title_field = meta.get_title_field()
		value = None
		if title_field and title_field != "name":
			value = frappe.db.get_value(doc.related_to, doc.related_id, title_field)
		# Fallback to the document name if no specific title or value is empty
		doc.related_document_name = value or doc.related_id
	except frappe.DoesNotExistError:
		# Target document was deleted or invalid; leave field blank
		return
	except Exception:
		# Log but don't block the transaction
		frappe.log_error(frappe.get_traceback(), "DocumentsManagement: update_fields error")
		return


@frappe.whitelist()
def get_related_doc_title(doctype: str, name: str) -> str | None:
	"""Return the display title (title field or name) for a given document.

	Client can call this after user selects a value in related_id to immediately
	fill related_document_name without waiting for validate.
	"""
	if not (doctype and name):
		return None
	meta = frappe.get_meta(doctype)
	title_field = meta.get_title_field()
	if title_field and title_field != "name":
		val = frappe.db.get_value(doctype, name, title_field)
		return val or name
	return name
