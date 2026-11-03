"""
NexBuild Cloud Hub - Pydantic Request & Response Schemas (Phase 1 Locked)
Strict typing, snake_case conventions, and full bidirectional compatibility between
canonical backend domain models and frontend client contracts. Compatible with Python 3.9+.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal, Dict, Any, Union
from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------
# 1. Purchase Order Schemas
# ---------------------------------------------------------
class POLineSchema(BaseModel):
    id: Optional[int] = None
    po_number: str
    line_number: int = 1
    sku_code: str
    item_name: str
    ordered_qty: float
    received_qty: float = 0.0
    unit: str
    status: str = "PENDING"

    # Compatibility aliases
    sku: Optional[str] = None
    description: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Sync sku / sku_code
            if "sku_code" not in data and "sku" in data:
                data["sku_code"] = data["sku"]
            elif "sku" not in data and "sku_code" in data:
                data["sku"] = data["sku_code"]
            # Sync item_name / description
            if "item_name" not in data and "description" in data:
                data["item_name"] = data["description"]
            elif "description" not in data and "item_name" in data:
                data["description"] = data["item_name"]
        return data


# Backward-compatible alias
POLineItem = POLineSchema


class POHeaderResponse(BaseModel):
    po_number: str
    supplier_name: str
    store_id: str = "DK-Aarhus-01"
    status: str = "OPEN"
    total_lines: int = 14
    created_at: str
    order_date: Optional[str] = None
    expected_delivery_date: Optional[str] = None
    updated_at: Optional[str] = None
    lines: List[POLineSchema] = []

    # Compatibility alias
    supplier: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "supplier_name" not in data and "supplier" in data:
                data["supplier_name"] = data["supplier"]
            elif "supplier" not in data and "supplier_name" in data:
                data["supplier"] = data["supplier_name"]
        return data


# Backward-compatible aliases
POHeader = POHeaderResponse


class PODetailResponse(BaseModel):
    status: str = "success"
    po: POHeaderResponse


# ---------------------------------------------------------
# 2. OCR & Delivery Note Matching Schemas
# ---------------------------------------------------------
class ScannedRawLine(BaseModel):
    sku_code: str
    item_name: str
    received_qty: float
    unit: str
    confidence_score: float = Field(ge=0.0, le=1.0)

    # Aliases
    sku: Optional[str] = None
    description: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "sku_code" not in data and "sku" in data:
                data["sku_code"] = data["sku"]
            elif "sku" not in data and "sku_code" in data:
                data["sku"] = data["sku_code"]
            if "item_name" not in data and "description" in data:
                data["item_name"] = data["description"]
            elif "description" not in data and "item_name" in data:
                data["description"] = data["item_name"]
        return data


class ScanDeliveryNoteRequest(BaseModel):
    po_number: str = "PO-48213"
    simulated_ocr_text: Optional[str] = None
    photo_evidence: Optional[str] = None


class ScannedLineItem(BaseModel):
    line_number: Optional[int] = None
    sku_code: str
    item_name: str
    ordered_qty: float
    received_qty: float
    unit: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    match_status: Literal["OK", "SHORT", "OVER", "UNKNOWN_SKU"]
    requires_review: bool
    discrepancy_reason: Optional[str] = None

    # Compatibility aliases
    sku: Optional[str] = None
    description: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "sku_code" not in data and "sku" in data:
                data["sku_code"] = data["sku"]
            elif "sku" not in data and "sku_code" in data:
                data["sku"] = data["sku_code"]
            if "item_name" not in data and "description" in data:
                data["item_name"] = data["description"]
            elif "description" not in data and "item_name" in data:
                data["description"] = data["item_name"]
        return data


# Backward-compatible alias
MatchedLineItem = ScannedLineItem


class MatchingSummary(BaseModel):
    total_lines: int
    ok_lines: int
    mismatch_lines: int
    low_confidence_lines: int

    # Compatibility aliases
    total_scanned_items: Optional[int] = None
    matched_ok_count: Optional[int] = None
    discrepancy_count: Optional[int] = None
    requires_supervisor_approval: bool = False

    @model_validator(mode="before")
    @classmethod
    def sync_summary_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "total_lines" not in data and "total_scanned_items" in data:
                data["total_lines"] = data["total_scanned_items"]
            elif "total_scanned_items" not in data and "total_lines" in data:
                data["total_scanned_items"] = data["total_lines"]

            if "ok_lines" not in data and "matched_ok_count" in data:
                data["ok_lines"] = data["matched_ok_count"]
            elif "matched_ok_count" not in data and "ok_lines" in data:
                data["matched_ok_count"] = data["ok_lines"]

            if "mismatch_lines" not in data and "discrepancy_count" in data:
                data["mismatch_lines"] = data["discrepancy_count"]
            elif "discrepancy_count" not in data and "mismatch_lines" in data:
                data["discrepancy_count"] = data["mismatch_lines"]

            if "low_confidence_lines" not in data:
                data["low_confidence_lines"] = 0

            if "requires_supervisor_approval" not in data:
                data["requires_supervisor_approval"] = data.get("mismatch_lines", 0) > 0
        return data


class ScanDeliveryNoteResponse(BaseModel):
    status: str = "success"
    po_number: str
    supplier_name: str = "Nordic BuildSupply DK"
    delivery_note_id: Optional[str] = None
    delivery_note_number: Optional[str] = None
    scan_timestamp: Optional[str] = None
    ocr_engine: str = "NexBuild-Gemini-Vision-v2.5"
    items: List[ScannedLineItem] = Field(default_factory=list)
    lines: Optional[List[ScannedLineItem]] = None
    matched_lines: Optional[List[ScannedLineItem]] = None
    unmatched_lines: Optional[List[ScannedLineItem]] = None
    summary: Union[MatchingSummary, Dict[str, Any]] = Field(default_factory=dict)
    requires_manual_review: Optional[bool] = None

    # Compatibility alias
    supplier: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "supplier_name" not in data and "supplier" in data:
                data["supplier_name"] = data["supplier"]
            elif "supplier" not in data and "supplier_name" in data:
                data["supplier"] = data["supplier_name"]

            if "delivery_note_id" not in data and "delivery_note_number" in data:
                data["delivery_note_id"] = data["delivery_note_number"]
            elif "delivery_note_number" not in data and "delivery_note_id" in data:
                data["delivery_note_number"] = data["delivery_note_id"]

            if "items" not in data and "lines" in data:
                data["items"] = data["lines"]
            elif "lines" not in data and "items" in data:
                data["lines"] = data["items"]

            if not data.get("scan_timestamp"):
                data["scan_timestamp"] = datetime.utcnow().isoformat() + "Z"
        return data


# ---------------------------------------------------------
# 3. Goods Receipt Confirmation Schemas
# ---------------------------------------------------------
class ConfirmLineItemInput(BaseModel):
    sku_code: str
    received_qty: float
    unit: str = "pcs"
    match_status: Optional[str] = None
    reason_code: Optional[str] = None
    photo_evidence: Optional[str] = None
    notes: Optional[str] = None

    # Compatibility alias
    sku: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "sku_code" not in data and "sku" in data:
                data["sku_code"] = data["sku"]
            elif "sku" not in data and "sku_code" in data:
                data["sku"] = data["sku_code"]
        return data


# Backward-compatible alias
ReceiptLineConfirm = ConfirmLineItemInput


class ConfirmReceiptRequest(BaseModel):
    po_number: str
    employee_id: str
    store_id: str = "DK-Aarhus-01"
    idempotency_key: str
    confirmed_lines: List[ConfirmLineItemInput] = Field(default_factory=list)
    lines: Optional[List[ConfirmLineItemInput]] = None
    reason_code: Optional[str] = None
    photo_evidence: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_lines_alias(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "confirmed_lines" not in data and "lines" in data:
                data["confirmed_lines"] = data["lines"]
            elif "lines" not in data and "confirmed_lines" in data:
                data["lines"] = data["confirmed_lines"]
        return data


class ReceiptTransactionResponse(BaseModel):
    status: str = "success"
    message: str
    idempotency_key: str
    po_number: str
    employee_id: str
    store_id: str = "DK-Aarhus-01"
    is_idempotent_replay: bool = False
    processed_at: str
    updated_inventory: List[InventoryATPItem]
    erp_sync: Dict[str, Any]


# ---------------------------------------------------------
# 4. Inventory & Available-To-Promise (ATP) Schemas
# ---------------------------------------------------------
class InventoryATPItem(BaseModel):
    sku_code: str
    item_name: str
    category: Optional[str] = None
    physical_on_hand: float
    reserved_qty: float = 0.0
    committed_qty: float = 0.0
    atp_qty: float
    quarantine_qty: float = 0.0
    unit: str = "pcs"
    location: Optional[str] = None
    last_updated: str
    trust_status: Literal["GREEN", "AMBER", "RED"] = "GREEN"

    # Compatibility aliases
    sku: Optional[str] = None
    description: Optional[str] = None
    updated_at: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "sku_code" not in data and "sku" in data:
                data["sku_code"] = data["sku"]
            elif "sku" not in data and "sku_code" in data:
                data["sku"] = data["sku_code"]

            if "item_name" not in data and "description" in data:
                data["item_name"] = data["description"]
            elif "description" not in data and "item_name" in data:
                data["description"] = data["item_name"]

            if "last_updated" not in data and "updated_at" in data:
                data["last_updated"] = data["updated_at"]
            elif "updated_at" not in data and "last_updated" in data:
                data["updated_at"] = data["last_updated"]
        return data


# Backward-compatible alias
InventoryItem = InventoryATPItem


class InventoryATPResponse(BaseModel):
    status: str = "success"
    store_id: str = "DK-Aarhus-01"
    total_skus: Optional[int] = None
    total_items: Optional[int] = None
    timestamp: Optional[str] = None
    items: List[InventoryATPItem]

    @model_validator(mode="before")
    @classmethod
    def sync_counts(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "total_skus" not in data and "total_items" in data:
                data["total_skus"] = data["total_items"]
            elif "total_items" not in data and "total_skus" in data:
                data["total_items"] = data["total_skus"]
            elif "total_skus" not in data and "items" in data:
                data["total_skus"] = len(data["items"])
                data["total_items"] = len(data["items"])

            if not data.get("timestamp"):
                data["timestamp"] = datetime.utcnow().isoformat() + "Z"
        return data


# ---------------------------------------------------------
# 5. Audit Log & Error Schemas
# ---------------------------------------------------------
class AuditLogEntry(BaseModel):
    id: Optional[int] = None
    timestamp: str
    employee_id: str
    store_id: str = "DK-Aarhus-01"
    po_number: Optional[str] = None
    sku_code: Optional[str] = None
    action: str
    quantity_change: Optional[float] = 0.0
    reason_code: Optional[str] = None
    photo_evidence: Optional[str] = None
    details: Optional[str] = None

    # Compatibility aliases
    sku: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "sku_code" not in data and "sku" in data:
                data["sku_code"] = data["sku"]
            elif "sku" not in data and "sku_code" in data:
                data["sku"] = data["sku_code"]

            if "details" not in data and "notes" in data:
                data["details"] = data["notes"]
            elif "notes" not in data and "details" in data:
                data["notes"] = data["details"]
        return data


class StandardErrorResponse(BaseModel):
    status: str = "error"
    detail: Optional[str] = None
    message: Optional[str] = None
    error_code: Optional[str] = None
    timestamp: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

    @model_validator(mode="before")
    @classmethod
    def sync_error_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "detail" not in data and "message" in data:
                data["detail"] = data["message"]
            elif "message" not in data and "detail" in data:
                data["message"] = data["detail"]
            elif "detail" not in data and "message" not in data:
                data["detail"] = "An error occurred"
                data["message"] = "An error occurred"

            if not data.get("timestamp"):
                data["timestamp"] = datetime.utcnow().isoformat() + "Z"
        return data


# Backward-compatible alias
ErrorResponse = StandardErrorResponse


class ResetDemoResponse(BaseModel):
    status: str = "success"
    message: str
    po_number: str
    seeded_lines_count: int
    timestamp: str
