"""
NexBuild Cloud Hub - FastAPI Main Application (Phase 3 Locked)

REST API for Denmark Phase 1 MVP:
  Scan → Match PO → Confirm → Post Hub → ATP Lookup

Endpoints (all prefixed /api/v1):
  GET  /health
  GET  /po/{po_number}
  POST /scan-delivery-note          (JSON body)
  POST /scan-delivery-note/upload   (multipart file)
  POST /confirm-receipt             (idempotent)
  GET  /inventory/atp
  GET  /audit-logs
  POST /reset-demo

Compatible with Python 3.9+.
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

import sys
import os as _os
_os.sys = sys  # noqa: keep linters happy on Windows path hacks

# ── Local imports ──────────────────────────────────────────────────────────
from backend.database import (
    get_db_connection,
    init_db,
    seed_baseline_data,
    reset_and_reseed_db,
)
from backend.schemas import (
    # PO
    POLineSchema,
    POHeaderResponse,
    # Scan / match
    ScanDeliveryNoteRequest,
    ScanDeliveryNoteResponse,
    ScannedLineItem,
    MatchingSummary,
    # Confirm receipt
    ConfirmReceiptRequest,
    ConfirmLineItemInput,
    ReceiptTransactionResponse,
    # Inventory
    InventoryATPItem,
    InventoryATPResponse,
    # Audit / errors
    AuditLogEntry,
    StandardErrorResponse,
    # Demo reset
    ResetDemoResponse,
    # Backward-compat aliases (used in legacy idempotency replay path)
    InventoryItem,
    ErrorResponse,
)
from backend.ai_ocr_service import extract_delivery_note, process_delivery_note
from backend.matching_engine import reconcile_scanned_items, match_scanned_delivery_note
from backend.mock_erp_adapter import sync_to_denmark_erp, sync_goods_receipt_to_erp

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Boot-time DB init & deterministic seeding of PO-48213."""
    init_db()
    seed_baseline_data(force_reset=False)   # seed if empty; don't wipe on every restart
    logger.info("NexBuild Cloud Hub started. DB ready.")
    yield


app = FastAPI(
    title="NexBuild Cloud Hub MVP",
    description=(
        "Denmark Phase 1 MVP — Goods Receiving, PO Matching, "
        "Idempotent Receipt Confirmation & Real-Time ATP Lookup."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _trust_status(last_updated_iso: Optional[str]) -> str:
    """Return GREEN / AMBER / RED based on staleness of last inventory update."""
    if not last_updated_iso:
        return "AMBER"
    try:
        ts = datetime.fromisoformat(last_updated_iso.replace("Z", "+00:00"))
        age = datetime.now(timezone.utc) - ts
        if age <= timedelta(minutes=15):
            return "GREEN"
        if age <= timedelta(hours=2):
            return "AMBER"
        return "RED"
    except Exception:
        return "AMBER"


def _build_inventory_item(row: Any, now_iso: str) -> InventoryATPItem:
    """Map a sqlite3.Row from inventory_hub to InventoryATPItem."""
    last_updated = row["last_updated"] or row["updated_at"] or now_iso
    return InventoryATPItem(
        sku_code=row["sku_code"] or row["sku"],
        item_name=row["item_name"] or row["description"] or "",
        category=row["category"] or "",
        physical_on_hand=float(row["physical_on_hand"]),
        reserved_qty=float(row["reserved_qty"] or 0.0),
        committed_qty=float(row["committed_qty"] or 0.0),
        atp_qty=float(row["atp_qty"]),
        quarantine_qty=float(row["quarantine_qty"] or 0.0),
        last_updated=last_updated,
        trust_status=_trust_status(last_updated),
    )


# ---------------------------------------------------------------------------
# 0. Health Check
# ---------------------------------------------------------------------------

@app.get("/api/v1/health", tags=["System"])
def health_check():
    """Returns service health, ERP adapter status, and active OCR mode."""
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    ocr_mode = (
        "live_gemini"
        if gemini_key and gemini_key != "your_api_key_here"
        else "deterministic_fallback"
    )
    return {
        "status":               "ok",
        "active_ocr_mode":      ocr_mode,
        "service":              "NexBuild Cloud Hub (Denmark MVP)",
        "erp_adapter_status":   "ONLINE (Assumed Denmark Legacy ERP)",
        "timestamp":            datetime.now(timezone.utc).isoformat() + "Z",
    }


# ---------------------------------------------------------------------------
# 1. PO Lookup
# ---------------------------------------------------------------------------

@app.get(
    "/api/v1/po/{po_number}",
    response_model=POHeaderResponse,
    responses={404: {"model": ErrorResponse}},
    tags=["Purchase Orders"],
)
def get_po_details(po_number: str):
    """
    Returns PO header + all 14 line items for PO-48213 (Nordic BuildSupply DK).
    Used by the Receive Goods screen to pre-populate expected quantities.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT po_number, supplier_name, supplier, store_id,
               status, created_at
        FROM po_headers
        WHERE po_number = ?
        """,
        (po_number,),
    )
    header_row = cursor.fetchone()

    if not header_row:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "status":     "error",
                "error_code": "PO_NOT_FOUND",
                "message":    f"Purchase order '{po_number}' not found in Denmark Hub registry.",
                "details":    {"requested_po_number": po_number},
            },
        )

    cursor.execute(
        """
        SELECT id, po_number, line_number, sku_code, sku, item_name, description,
               ordered_qty, received_qty, unit, status
        FROM po_lines
        WHERE po_number = ?
        ORDER BY id ASC
        """,
        (po_number,),
    )
    line_rows = cursor.fetchall()
    conn.close()

    lines = [
        POLineSchema(
            id=r["id"],
            po_number=r["po_number"],
            line_number=r["line_number"] or 1,
            sku_code=r["sku_code"] or r["sku"],
            item_name=r["item_name"] or r["description"] or "",
            ordered_qty=float(r["ordered_qty"]),
            received_qty=float(r["received_qty"]),
            unit=r["unit"],
            status=r["status"] or "PENDING",
        )
        for r in line_rows
    ]

    supplier = header_row["supplier_name"] or header_row["supplier"] or ""

    return POHeaderResponse(
        po_number=header_row["po_number"],
        supplier_name=supplier,
        store_id=header_row["store_id"] or "DK-Aarhus-01",
        status=header_row["status"] or "OPEN",
        created_at=header_row["created_at"] or datetime.now(timezone.utc).isoformat(),
        lines=lines,
        total_lines=len(lines),
    )


# ---------------------------------------------------------------------------
# 2a. Scan Delivery Note (JSON body)
# ---------------------------------------------------------------------------

@app.post(
    "/api/v1/scan-delivery-note",
    response_model=ScanDeliveryNoteResponse,
    tags=["Goods Receiving"],
)
async def scan_delivery_note(
    request_payload: Optional[ScanDeliveryNoteRequest] = None,
):
    """
    Triggers AI OCR (demo mode) on PO-48213 delivery note, then runs the
    Matching Engine to produce line-by-line reconciliation with match_status,
    confidence_score, and discrepancy details.

    Demo scenario outcome:
      CEM-25   → OK    (80 == 80)
      TIM-4595 → OK    (40 == 40)
      PLAST-01 → SHORT (52 < 60, deficit -8)
      FIX-M8   → UNKNOWN_SKU (not on PO, conf 0.68)
      10 others → OK
    """
    po_number = (
        request_payload.po_number
        if request_payload and request_payload.po_number
        else "PO-48213"
    )

    # Step A: OCR extraction (always demo mode for Phase 1 MVP)
    scanned_items = await extract_delivery_note(use_demo_sample=True)

    # Step B: Matching engine
    conn = get_db_connection()
    try:
        result = reconcile_scanned_items(scanned_items, po_number, conn)
    finally:
        conn.close()

    return ScanDeliveryNoteResponse(**result)


# ---------------------------------------------------------------------------
# 2b. Scan Delivery Note (multipart file upload)
# ---------------------------------------------------------------------------

@app.post(
    "/api/v1/scan-delivery-note/upload",
    response_model=ScanDeliveryNoteResponse,
    tags=["Goods Receiving"],
)
async def scan_delivery_note_upload(
    po_number: str = Form("PO-48213"),
    file: Optional[UploadFile] = File(None),
):
    """
    Multipart variant — accepts camera capture / PDF scan of delivery note.
    Falls back to deterministic mock when no API key is configured.
    """
    image_bytes = await file.read() if file else None
    scanned_items = await extract_delivery_note(
        image_bytes=image_bytes,
        use_demo_sample=(image_bytes is None),
    )

    conn = get_db_connection()
    try:
        result = reconcile_scanned_items(scanned_items, po_number, conn)
    finally:
        conn.close()

    return ScanDeliveryNoteResponse(**result)


# ---------------------------------------------------------------------------
# 3. Confirm Goods Receipt (idempotent, quarantine-aware)
# ---------------------------------------------------------------------------

@app.post(
    "/api/v1/confirm-receipt",
    response_model=ReceiptTransactionResponse,
    tags=["Goods Receiving"],
)
def confirm_receipt(payload: ConfirmReceiptRequest):
    """
    Confirms received goods and posts inventory updates.

    Idempotency:
      If the supplied idempotency_key was already processed, the cached
      response is returned immediately — inventory is NOT touched again.

    Quarantine logic (per Round 1 proposal & Phase 1 spec):
      UNKNOWN_SKU lines (e.g. FIX-M8) or reason_code=="unordered_quarantine":
        → quarantine_qty += received_qty
        → physical_on_hand unchanged
        → atp_qty unchanged
        → audit_logs ACTION = "QUARANTINED_UNORDERED_SKU"
      Unless reason_code == "accept_unordered_override" (supervisor approval).

      Valid PO lines (CEM-25, PLAST-01, etc.):
        → physical_on_hand += received_qty
        → atp_qty += received_qty (Phase 1: reserved=0, committed=0)
        → audit_logs ACTION = "GOODS_RECEIPT_CONFIRMED"
    """
    # Normalise lines from either field alias
    lines: List[ConfirmLineItemInput] = (
        payload.confirmed_lines or payload.lines or []
    )

    conn = get_db_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat() + "Z"

    # ------------------------------------------------------------------
    # STEP 1: Idempotency guard
    # ------------------------------------------------------------------
    cursor.execute(
        "SELECT * FROM receipt_transactions WHERE idempotency_key = ?",
        (payload.idempotency_key,),
    )
    existing_tx = cursor.fetchone()

    if existing_tx:
        # Return cached response without touching inventory
        raw_json = existing_tx["response_json"] or existing_tx["payload_summary"] or "{}"
        cached = json.loads(raw_json) if raw_json else {}

        # Fetch current inventory snapshot for the confirmed lines
        snapshot: List[InventoryATPItem] = []
        for line in lines:
            sku = line.sku_code or line.sku or ""
            cursor.execute(
                "SELECT * FROM inventory_hub WHERE sku_code = ? OR sku = ?",
                (sku, sku),
            )
            row = cursor.fetchone()
            if row:
                snapshot.append(_build_inventory_item(row, now_iso))
        conn.close()

        return ReceiptTransactionResponse(
            status="success",
            message="Idempotent replay: Receipt already processed. Inventory unchanged.",
            idempotency_key=existing_tx["idempotency_key"],
            po_number=existing_tx["po_number"],
            employee_id=existing_tx["employee_id"],
            store_id=existing_tx["store_id"],
            is_idempotent_replay=True,
            processed_at=existing_tx["processed_at"] or existing_tx["created_at"] or now_iso,
            updated_inventory=snapshot,
            erp_sync=cached.get("erp_sync", {"sync_status": "REPLAYED"}),
        )

    # ------------------------------------------------------------------
    # STEP 2: Process new receipt — atomic transaction
    # ------------------------------------------------------------------
    try:
        updated_inventory: List[InventoryATPItem] = []

        for line in lines:
            sku = line.sku_code or getattr(line, "sku", None) or ""
            received_qty = float(line.received_qty)
            unit = line.unit or "pcs"
            match_status = getattr(line, "match_status", None) or ""
            line_reason = getattr(line, "reason_code", None) or ""
            line_photo = getattr(line, "photo_evidence", None) or getattr(payload, "photo_evidence", None)
            line_notes = getattr(line, "notes", None) or getattr(payload, "notes", None)

            # ── Is this SKU on the PO? ──────────────────────────────────
            cursor.execute(
                "SELECT ordered_qty FROM po_lines WHERE po_number = ? AND (sku_code = ? OR sku = ?)",
                (payload.po_number, sku, sku),
            )
            po_line_row = cursor.fetchone()
            is_on_po: bool = po_line_row is not None

            # ── Determine quarantine vs normal receipt ──────────────────
            is_quarantine: bool = (
                match_status == "UNKNOWN_SKU"
                or line_reason in ("unordered_quarantine", "not_on_po")
                or (not is_on_po and line_reason != "accept_unordered_override")
            )

            effective_reason = (
                line_reason
                or ("NORMAL_GOODS_RECEIPT" if is_on_po else "unordered_quarantine")
            )

            # ── Fetch current inventory row ─────────────────────────────
            cursor.execute(
                "SELECT * FROM inventory_hub WHERE sku_code = ? OR sku = ?",
                (sku, sku),
            )
            inv_row = cursor.fetchone()

            if is_quarantine:
                # --------------------------------------------------------
                # QUARANTINE PATH — do NOT touch physical_on_hand / atp_qty
                # --------------------------------------------------------
                if inv_row:
                    cur_physical = float(inv_row["physical_on_hand"])
                    cur_atp = float(inv_row["atp_qty"])
                    new_quarantine = float(inv_row["quarantine_qty"] or 0.0) + received_qty

                    cursor.execute(
                        """
                        UPDATE inventory_hub
                        SET quarantine_qty = ?, last_updated = ?, updated_at = ?
                        WHERE sku_code = ? OR sku = ?
                        """,
                        (new_quarantine, now_iso, now_iso, sku, sku),
                    )
                    updated_inventory.append(
                        _build_inventory_item(
                            # Re-fetch to get the refreshed row fields
                            _patch_row(inv_row, quarantine_qty=new_quarantine, last_updated=now_iso),
                            now_iso,
                        )
                    )

                else:
                    # SKU not in inventory at all — create quarantine slot
                    cursor.execute(
                        """
                        INSERT INTO inventory_hub
                            (sku_code, sku, item_name, description, category,
                             physical_on_hand, quarantine_qty, reserved_qty,
                             committed_qty, atp_qty,
                             last_updated, updated_at)
                        VALUES (?, ?, ?, ?, 'Quarantine Bay',
                                0.0, ?, 0.0, 0.0, 0.0, ?, ?)
                        """,
                        (
                            sku, sku,
                            f"Quarantined Material ({sku})",
                            f"Unordered item received — quarantine pending clearance ({sku})",
                            received_qty,
                            now_iso, now_iso,
                        ),
                    )
                    updated_inventory.append(InventoryATPItem(
                        sku_code=sku,
                        item_name=f"Quarantined Material ({sku})",
                        category="Quarantine Bay",
                        physical_on_hand=0.0,
                        reserved_qty=0.0,
                        committed_qty=0.0,
                        atp_qty=0.0,
                        quarantine_qty=received_qty,
                        last_updated=now_iso,
                        trust_status="AMBER",
                    ))

                # Quarantine audit record
                cursor.execute(
                    """
                    INSERT INTO audit_logs
                        (timestamp, employee_id, store_id, po_number,
                         sku_code, sku, action, reason_code,
                         quantity_change, photo_evidence, notes, details)
                    VALUES (?, ?, ?, ?, ?, ?, 'QUARANTINED_UNORDERED_SKU', ?,
                            ?, ?, ?, ?)
                    """,
                    (
                        now_iso, payload.employee_id, payload.store_id,
                        payload.po_number,
                        sku, sku,
                        effective_reason,
                        received_qty, line_photo,
                        line_notes or f"Unordered item {sku} ({received_qty} {unit}) quarantined.",
                        f"QUARANTINED_UNORDERED_SKU: sku={sku} qty={received_qty} unit={unit}",
                    ),
                )

            else:
                # --------------------------------------------------------
                # NORMAL RECEIPT PATH — increment physical_on_hand + atp_qty
                # --------------------------------------------------------
                if inv_row:
                    new_physical = float(inv_row["physical_on_hand"]) + received_qty
                    new_atp = float(inv_row["atp_qty"]) + received_qty
                    cur_quarantine = float(inv_row["quarantine_qty"] or 0.0)

                    cursor.execute(
                        """
                        UPDATE inventory_hub
                        SET physical_on_hand = ?,
                            atp_qty = ?,
                            last_updated = ?,
                            updated_at = ?
                        WHERE sku_code = ? OR sku = ?
                        """,
                        (new_physical, new_atp, now_iso, now_iso, sku, sku),
                    )
                    updated_inventory.append(
                        _build_inventory_item(
                            _patch_row(
                                inv_row,
                                physical_on_hand=new_physical,
                                atp_qty=new_atp,
                                last_updated=now_iso,
                            ),
                            now_iso,
                        )
                    )

                else:
                    # SKU not yet in inventory — create fresh record
                    item_desc = f"Newly Received Material ({sku})"
                    cursor.execute(
                        """
                        INSERT INTO inventory_hub
                            (sku_code, sku, item_name, description, category,
                             physical_on_hand, quarantine_qty, reserved_qty,
                             committed_qty, atp_qty,
                             last_updated, updated_at)
                        VALUES (?, ?, ?, ?, 'General Materials',
                                ?, 0.0, 0.0, 0.0, ?,
                                ?, ?)
                        """,
                        (
                            sku, sku, item_desc, item_desc,
                            received_qty, received_qty,
                            now_iso, now_iso,
                        ),
                    )
                    updated_inventory.append(InventoryATPItem(
                        sku_code=sku,
                        item_name=item_desc,
                        category="General Materials",
                        physical_on_hand=received_qty,
                        reserved_qty=0.0,
                        committed_qty=0.0,
                        atp_qty=received_qty,
                        quarantine_qty=0.0,
                        last_updated=now_iso,
                        trust_status="GREEN",
                    ))

                # Update po_lines.received_qty
                if is_on_po:
                    cursor.execute(
                        """
                        UPDATE po_lines
                        SET received_qty = received_qty + ?,
                            status = CASE
                                WHEN (received_qty + ?) >= ordered_qty THEN 'COMPLETED'
                                ELSE 'PARTIALLY_RECEIVED'
                            END
                        WHERE po_number = ? AND (sku_code = ? OR sku = ?)
                        """,
                        (received_qty, received_qty, payload.po_number, sku, sku),
                    )

                audit_action = (
                    "GOODS_RECEIPT_OVERRIDE_ACCEPTED"
                    if not is_on_po
                    else "GOODS_RECEIPT_CONFIRMED"
                )
                cursor.execute(
                    """
                    INSERT INTO audit_logs
                        (timestamp, employee_id, store_id, po_number,
                         sku_code, sku, action, reason_code,
                         quantity_change, photo_evidence, notes, details)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        now_iso, payload.employee_id, payload.store_id,
                        payload.po_number,
                        sku, sku,
                        audit_action,
                        effective_reason,
                        received_qty, line_photo,
                        line_notes or "Goods receipt confirmed by warehouse staff.",
                        f"{audit_action}: sku={sku} qty={received_qty} unit={unit}",
                    ),
                )

        # ── Update PO header status ─────────────────────────────────────
        cursor.execute(
            """
            SELECT COUNT(*) AS pending
            FROM po_lines
            WHERE po_number = ? AND status != 'COMPLETED'
            """,
            (payload.po_number,),
        )
        pending_row = cursor.fetchone()
        po_new_status = (
            "PARTIALLY_RECEIVED"
            if (pending_row and pending_row["pending"] > 0)
            else "COMPLETED"
        )
        cursor.execute(
            "UPDATE po_headers SET status = ?, updated_at = ? WHERE po_number = ?",
            (po_new_status, now_iso, payload.po_number),
        )

        # ── ERP sync ────────────────────────────────────────────────────
        erp_result = sync_to_denmark_erp(
            po_number=payload.po_number,
            confirmed_lines=[ln.model_dump() for ln in lines],
            employee_id=payload.employee_id,
            store_id=payload.store_id,
            idempotency_key=payload.idempotency_key,
        )

        # ── Record in receipt_transactions (idempotency seal) ───────────
        response_payload = {
            "confirmed_lines_count": len(lines),
            "erp_sync": erp_result,
        }
        response_json = json.dumps(response_payload)

        cursor.execute(
            """
            INSERT INTO receipt_transactions
                (idempotency_key, po_number, employee_id, store_id,
                 erp_voucher_no, response_json, created_at, processed_at,
                 status, erp_sync_status, erp_transaction_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?)
            """,
            (
                payload.idempotency_key,
                payload.po_number,
                payload.employee_id,
                payload.store_id,
                erp_result["erp_voucher_no"],
                response_json,
                now_iso,
                now_iso,
                erp_result["sync_status"],
                erp_result["erp_transaction_id"],
            ),
        )

        conn.commit()
        conn.close()

        return ReceiptTransactionResponse(
            status="success",
            message=(
                "Goods receipt confirmed. Inventory posted. "
                f"Denmark ERP synced ({erp_result['erp_voucher_no']})."
            ),
            idempotency_key=payload.idempotency_key,
            po_number=payload.po_number,
            employee_id=payload.employee_id,
            store_id=payload.store_id,
            is_idempotent_replay=False,
            processed_at=now_iso,
            updated_inventory=updated_inventory,
            erp_sync=erp_result,
        )

    except Exception as exc:
        conn.rollback()
        conn.close()
        logger.exception("confirm_receipt failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "status":     "error",
                "error_code": "CONFIRM_RECEIPT_ERROR",
                "message":    f"Failed to confirm goods receipt: {exc}",
                "details":    {"idempotency_key": payload.idempotency_key},
            },
        )


# ---------------------------------------------------------------------------
# 4. Real-time ATP Inventory
# ---------------------------------------------------------------------------

@app.get(
    "/api/v1/inventory/atp",
    response_model=InventoryATPResponse,
    tags=["Store Counter ATP"],
)
def get_inventory_atp(
    sku: Optional[str] = None,
    category: Optional[str] = None,
    store_id: str = "DK-Aarhus-01",
):
    """
    Returns real-time ATP quantities for all SKUs in the Denmark Distribution Hub.
    trust_status = GREEN  if last_updated within 15 minutes
                 = AMBER  if within 2 hours
                 = RED    if older than 2 hours
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat() + "Z"

    query = "SELECT * FROM inventory_hub WHERE 1=1"
    params: List[Any] = []

    if sku:
        query += " AND (sku_code LIKE ? OR sku LIKE ? OR item_name LIKE ? OR description LIKE ?)"
        params.extend([f"%{sku}%"] * 4)
    if category:
        query += " AND category = ?"
        params.append(category)

    query += " ORDER BY sku_code ASC"

    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()

    items = [_build_inventory_item(row, now_iso) for row in rows]

    return InventoryATPResponse(
        store_id=store_id,
        items=items,
        total_skus=len(items),
        total_items=len(items),
    )


# ---------------------------------------------------------------------------
# 5. Audit Logs
# ---------------------------------------------------------------------------

@app.get("/api/v1/audit-logs", tags=["Audit & Governance"])
def get_audit_logs(limit: int = 50):
    """Returns recent audit records ordered by newest timestamp first."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, timestamp, employee_id, store_id, po_number,
               sku_code, sku, action, reason_code,
               quantity_change, photo_evidence, notes, details
        FROM audit_logs
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    )
    rows = cursor.fetchall()
    conn.close()

    return {
        "status": "success",
        "count":  len(rows),
        "logs":   [dict(r) for r in rows],
    }


# ---------------------------------------------------------------------------
# 6. Reset Demo
# ---------------------------------------------------------------------------

@app.post(
    "/api/v1/reset-demo",
    response_model=ResetDemoResponse,
    tags=["Demo Administration"],
)
def reset_demo():
    """
    Truncates all operational tables and reseeds clean PO-48213 baseline data.
    Essential for clean demo video takes.
    """
    result = reset_and_reseed_db()
    return ResetDemoResponse(**result)


# ---------------------------------------------------------------------------
# Internal helper — patch a sqlite3.Row-like dict with updated field values
# ---------------------------------------------------------------------------

def _patch_row(row: Any, **kwargs: Any) -> Dict[str, Any]:
    """Return a mutable dict copy of a sqlite3.Row with fields overwritten."""
    d = dict(row)
    d.update(kwargs)
    return d
