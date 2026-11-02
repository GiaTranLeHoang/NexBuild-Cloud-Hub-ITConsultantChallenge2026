"""
NexBuild Cloud Hub - Pydantic Request & Response Schemas
Enforces strict typing, snake_case naming conventions, and API validation.
"""

from __future__ import annotations

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field


# ---------------------------------------------------------
# PO Schemas
# ---------------------------------------------------------
class POLineItem(BaseModel):
    id: Optional[int] = None
    po_number: str
    line_number: int
    sku: str
    description: str
    ordered_qty: float
    received_qty: float = 0.0
    unit: str
    status: str = "PENDING"


class POHeader(BaseModel):
    po_number: str
    supplier: str
    order_date: str
    expected_delivery_date: str
    status: str
    total_lines: int
    created_at: str
    updated_at: str
    lines: List[POLineItem] = []


class PODetailResponse(BaseModel):
    status: str = "success"
    po: POHeader


# ---------------------------------------------------------
# OCR & Matching Schemas
# ---------------------------------------------------------
class ScannedRawLine(BaseModel):
    sku: str
    description: str
    received_qty: float
    unit: str
    confidence_score: float = Field(ge=0.0, le=1.0)


class ScanDeliveryNoteRequest(BaseModel):
    po_number: str = "PO-48213"
    simulated_ocr_text: Optional[str] = None
    photo_evidence: Optional[str] = None


class MatchedLineItem(BaseModel):
    line_number: Optional[int] = None
    sku: str
    description: str
    ordered_qty: float
    received_qty: float
    unit: str
    match_status: Literal["OK", "SHORT", "OVER", "UNKNOWN_SKU"]
    confidence_score: float = Field(ge=0.0, le=1.0)
    requires_review: bool
    discrepancy_reason: Optional[str] = None

    # Frontend convenience aliases
    sku_code: Optional[str] = None
    item_name: Optional[str] = None


class MatchingSummary(BaseModel):
    total_scanned_items: int
    matched_ok_count: int
    discrepancy_count: int
    requires_supervisor_approval: bool

    # Frontend convenience aliases
    total_lines: Optional[int] = None
    ok_lines: Optional[int] = None
    mismatch_lines: Optional[int] = None
    low_confidence_lines: Optional[int] = None


class ScanDeliveryNoteResponse(BaseModel):
    status: str = "success"
    po_number: str
    supplier: str
    delivery_note_number: str
    scan_timestamp: str
    ocr_engine: str
    items: List[MatchedLineItem]
    summary: MatchingSummary


# ---------------------------------------------------------
# Receipt Confirmation Schemas
# ---------------------------------------------------------
class ReceiptLineConfirm(BaseModel):
    sku: str
    received_qty: float
    unit: str
    reason_code: Optional[str] = None
    notes: Optional[str] = None
    photo_evidence: Optional[str] = None


class ConfirmReceiptRequest(BaseModel):
    po_number: str
    employee_id: str
    store_id: str
    idempotency_key: str
    confirmed_lines: List[ReceiptLineConfirm]
    notes: Optional[str] = None
    photo_evidence: Optional[str] = None


class InventoryItem(BaseModel):
    sku: str
    description: str
    category: Optional[str] = None
    physical_on_hand: float
    quarantine_qty: float = 0.0
    reserved_qty: float = 0.0
    atp_qty: float
    unit: str
    location: Optional[str] = None
    updated_at: str

    # Frontend convenience aliases
    sku_code: Optional[str] = None
    item_name: Optional[str] = None
    last_updated: Optional[str] = None
    trust_status: str = "GREEN"


class ReceiptTransactionResponse(BaseModel):
    status: str = "success"
    message: str
    idempotency_key: str
    po_number: str
    employee_id: str
    store_id: str
    is_idempotent_replay: bool = False
    processed_at: str
    updated_inventory: List[InventoryItem]
    erp_sync: Dict[str, Any]


# ---------------------------------------------------------
# Inventory & ATP Schemas
# ---------------------------------------------------------
class InventoryATPResponse(BaseModel):
    status: str = "success"
    store_id: str = "DK-HUB-01"
    total_skus: int
    timestamp: str
    items: List[InventoryItem]


# ---------------------------------------------------------
# Demo Reset & Utility Schemas
# ---------------------------------------------------------
class ResetDemoResponse(BaseModel):
    status: str = "success"
    message: str
    po_number: str
    seeded_lines_count: int
    timestamp: str


class ErrorResponse(BaseModel):
    status: str = "error"
    error_code: str
    message: str
    details: Optional[Dict[str, Any]] = None
