"""
NexBuild Cloud Hub - FastAPI Main Application
Exposes RESTful endpoints for Denmark Goods Receiving, PO Matching,
Idempotent Receipt Confirmation, and Real-time ATP Inventory Lookup.
"""

from __future__ import annotations

import os
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Request, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.database import (
    init_db,
    get_db_connection,
    reset_and_reseed_db
)
from backend.schemas import (
    PODetailResponse,
    POHeader,
    POLineItem,
    ScanDeliveryNoteRequest,
    ScanDeliveryNoteResponse,
    ConfirmReceiptRequest,
    ReceiptTransactionResponse,
    InventoryATPResponse,
    InventoryItem,
    ResetDemoResponse,
    ErrorResponse
)
from backend.ai_ocr_service import process_delivery_note
from backend.matching_engine import match_scanned_delivery_note
from backend.mock_erp_adapter import sync_goods_receipt_to_erp


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes SQLite schema and auto-seeds PO-48213 data upon boot."""
    init_db()
    yield


# Initialize FastAPI application
app = FastAPI(
    title="NexBuild Cloud Hub API",
    description="Denmark Goods Receiving & Real-Time ATP Lookup Service (Round 2 MVP)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Enable CORS for all origins to allow seamless frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# Health Check Endpoint
# ---------------------------------------------------------
@app.get("/api/v1/health", tags=["System"])
def health_check():
    """Returns application health status, ERP adapter status, and active OCR mode."""
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    ocr_mode = "live_gemini" if (gemini_key and gemini_key != "your_api_key_here") else "deterministic_fallback"
    return {
        "status": "healthy",
        "service": "NexBuild Cloud Hub (Denmark MVP)",
        "erp_adapter_status": "ONLINE (Assumed Denmark Legacy ERP)",
        "active_ocr_mode": ocr_mode,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# ---------------------------------------------------------
# 1. PO Lookup Endpoint
# ---------------------------------------------------------
@app.get(
    "/api/v1/po/{po_number}",
    response_model=PODetailResponse,
    responses={404: {"model": ErrorResponse}},
    tags=["Purchase Orders"]
)
def get_po_details(po_number: str):
    """
    Retrieves purchase order header and line items for the Denmark Distribution Hub.
    Auto-seeded with PO-48213 (14 lines from Nordic BuildSupply DK).
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT po_number, supplier, order_date, expected_delivery_date, status, total_lines, created_at, updated_at
        FROM po_headers
        WHERE po_number = ?;
    """, (po_number,))
    header_row = cursor.fetchone()

    if not header_row:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "status": "error",
                "error_code": "PO_NOT_FOUND",
                "message": f"Purchase order '{po_number}' was not found in Denmark Hub registry.",
                "details": {"requested_po_number": po_number}
            }
        )

    cursor.execute("""
        SELECT id, po_number, line_number, sku, description, ordered_qty, received_qty, unit, status
        FROM po_lines
        WHERE po_number = ?
        ORDER BY line_number ASC;
    """, (po_number,))
    line_rows = cursor.fetchall()
    conn.close()

    lines = [
        POLineItem(
            id=row["id"],
            po_number=row["po_number"],
            line_number=row["line_number"],
            sku=row["sku"],
            description=row["description"],
            ordered_qty=float(row["ordered_qty"]),
            received_qty=float(row["received_qty"]),
            unit=row["unit"],
            status=row["status"]
        )
        for row in line_rows
    ]

    header = POHeader(
        po_number=header_row["po_number"],
        supplier=header_row["supplier"],
        order_date=header_row["order_date"],
        expected_delivery_date=header_row["expected_delivery_date"],
        status=header_row["status"],
        total_lines=header_row["total_lines"],
        created_at=header_row["created_at"],
        updated_at=header_row["updated_at"],
        lines=lines
    )

    return PODetailResponse(status="success", po=header)


# ---------------------------------------------------------
# 2. Delivery Note Scanning & Matching Endpoint
# ---------------------------------------------------------
@app.post(
    "/api/v1/scan-delivery-note",
    response_model=ScanDeliveryNoteResponse,
    tags=["Goods Receiving"]
)
def scan_delivery_note(request_payload: Optional[ScanDeliveryNoteRequest] = None):
    """
    Simulates or performs OCR scanning on a supplier delivery note, then triggers the
    Matching Engine to compare scanned items against the Purchase Order.

    Standard demo scenario for PO-48213:
    - CEM-25: 80 received (OK)
    - TIM-4595: 40 received (OK)
    - PLAST-01: 52 received (SHORT - 8 missing)
    - FIX-M8: 12 received (UNKNOWN_SKU - confidence 0.68)
    """
    po_number = request_payload.po_number if request_payload and request_payload.po_number else "PO-48213"
    sim_text = request_payload.simulated_ocr_text if request_payload else None

    # Step A: Run AI OCR service (returns scanned raw items with confidence scores)
    ocr_result = process_delivery_note(po_number=po_number, simulated_text=sim_text)

    # Step B: Run Matching Engine against PO database lines
    matched_result = match_scanned_delivery_note(ocr_result)

    return matched_result


@app.post(
    "/api/v1/scan-delivery-note/upload",
    response_model=ScanDeliveryNoteResponse,
    tags=["Goods Receiving"]
)
async def scan_delivery_note_file(
    po_number: str = Form("PO-48213"),
    file: Optional[UploadFile] = File(None)
):
    """
    Multipart file upload variant for mobile camera capture or PDF delivery note scans.
    Falls back gracefully to the deterministic mock pipeline for PO-48213.
    """
    file_bytes = await file.read() if file else None
    ocr_result = process_delivery_note(po_number=po_number, file_bytes=file_bytes)
    matched_result = match_scanned_delivery_note(ocr_result)
    return matched_result


# ---------------------------------------------------------
# 3. Confirm Goods Receipt Endpoint (Idempotent)
# ---------------------------------------------------------
@app.post(
    "/api/v1/confirm-receipt",
    response_model=ReceiptTransactionResponse,
    tags=["Goods Receiving"]
)
def confirm_receipt(payload: ConfirmReceiptRequest):
    """
    Confirms received goods, updates inventory (physical on-hand and ATP),
    records tamper-evident audit logs, and triggers synchronization with the Assumed Denmark Legacy ERP.

    Offline Idempotency Protection:
    - Checks `idempotency_key` before modifying database state.
    - If key has already been processed, returns the existing committed transaction
      without double-counting inventory.

    Quarantine Business Logic:
    - If a line is an UNKNOWN_SKU (not on PO) and not explicitly overridden with
      reason_code == "accept_unordered_override", it is quarantined:
      * atp_qty is NOT incremented (remains untouched).
      * physical_on_hand is NOT incremented into sellable stock.
      * quarantine_qty is incremented.
      * audit_logs records 'QUARANTINED_UNORDERED_SKU'.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Step 1: Idempotency check
    cursor.execute("""
        SELECT idempotency_key, po_number, employee_id, store_id, processed_at, status, payload_summary, erp_sync_status, erp_transaction_id
        FROM receipt_transactions
        WHERE idempotency_key = ?;
    """, (payload.idempotency_key,))
    existing_tx = cursor.fetchone()

    if existing_tx:
        # Transaction was previously executed. Replay cached result safely.
        summary_data = json.loads(existing_tx["payload_summary"]) if existing_tx["payload_summary"] else {}
        conn.close()

        # Fetch current inventory snapshot for the confirmed lines
        current_inv = []
        conn2 = get_db_connection()
        c2 = conn2.cursor()
        for line in payload.confirmed_lines:
            c2.execute("SELECT * FROM inventory_hub WHERE sku = ?", (line.sku,))
            row = c2.fetchone()
            if row:
                current_inv.append(InventoryItem(
                    sku=row["sku"],
                    description=row["description"],
                    category=row["category"],
                    physical_on_hand=float(row["physical_on_hand"]),
                    quarantine_qty=float(row["quarantine_qty"] if "quarantine_qty" in row.keys() else 0.0),
                    reserved_qty=float(row["reserved_qty"]),
                    atp_qty=float(row["atp_qty"]),
                    unit=row["unit"],
                    location=row["location"],
                    updated_at=row["updated_at"]
                ))
        conn2.close()

        return ReceiptTransactionResponse(
            status="success",
            message="Idempotent replay: Receipt transaction was already processed and verified.",
            idempotency_key=existing_tx["idempotency_key"],
            po_number=existing_tx["po_number"],
            employee_id=existing_tx["employee_id"],
            store_id=existing_tx["store_id"],
            is_idempotent_replay=True,
            processed_at=existing_tx["processed_at"],
            updated_inventory=current_inv,
            erp_sync=summary_data.get("erp_sync", {
                "sync_status": existing_tx["erp_sync_status"],
                "erp_transaction_id": existing_tx["erp_transaction_id"]
            })
        )

    # Step 2: Process new receipt transaction atomically
    try:
        updated_inventory_items: List[InventoryItem] = []

        for line in payload.confirmed_lines:
            received_qty = float(line.received_qty)

            # Check if SKU exists on the Purchase Order
            cursor.execute("""
                SELECT line_number, ordered_qty FROM po_lines
                WHERE po_number = ? AND sku = ?;
            """, (payload.po_number, line.sku))
            po_line_match = cursor.fetchone()
            is_on_po = po_line_match is not None

            # Determine quarantine vs normal receipt
            reason = line.reason_code or ("NORMAL_GOODS_RECEIPT" if is_on_po else "unordered_quarantine")
            is_unordered_quarantine = (not is_on_po) and (reason != "accept_unordered_override")

            cursor.execute("SELECT * FROM inventory_hub WHERE sku = ?;", (line.sku,))
            inv_row = cursor.fetchone()

            if is_unordered_quarantine:
                # -----------------------------------------------------
                # UNKNOWN_SKU / UNORDERED: DO NOT INCREMENT atp_qty!
                # Quarantined: atp_qty & physical_on_hand remain baseline.
                # Increment quarantine_qty and log QUARANTINED_UNORDERED_SKU.
                # -----------------------------------------------------
                if inv_row:
                    current_physical = float(inv_row["physical_on_hand"])
                    current_atp = float(inv_row["atp_qty"])
                    new_quarantine = float(inv_row["quarantine_qty"] if "quarantine_qty" in inv_row.keys() else 0.0) + received_qty

                    cursor.execute("""
                        UPDATE inventory_hub
                        SET quarantine_qty = ?, updated_at = ?
                        WHERE sku = ?;
                    """, (new_quarantine, now_iso, line.sku))

                    updated_inventory_items.append(InventoryItem(
                        sku=inv_row["sku"],
                        description=inv_row["description"],
                        category=inv_row["category"],
                        physical_on_hand=current_physical,
                        quarantine_qty=new_quarantine,
                        reserved_qty=float(inv_row["reserved_qty"]),
                        atp_qty=current_atp,
                        unit=inv_row["unit"],
                        location=inv_row["location"],
                        updated_at=now_iso
                    ))
                else:
                    item_desc = f"Quarantined Unordered Material ({line.sku})"
                    cursor.execute("""
                        INSERT INTO inventory_hub (sku, description, category, physical_on_hand, quarantine_qty, reserved_qty, atp_qty, unit, location, updated_at)
                        VALUES (?, ?, 'Quarantine Bay', 0.0, ?, 0.0, 0.0, ?, 'Receiving Quarantine Zone', ?);
                    """, (line.sku, item_desc, received_qty, line.unit, now_iso))

                    updated_inventory_items.append(InventoryItem(
                        sku=line.sku,
                        description=item_desc,
                        category="Quarantine Bay",
                        physical_on_hand=0.0,
                        quarantine_qty=received_qty,
                        reserved_qty=0.0,
                        atp_qty=0.0,
                        unit=line.unit,
                        location="Receiving Quarantine Zone",
                        updated_at=now_iso
                    ))

                # Log Quarantine Audit Record
                photo = line.photo_evidence or payload.photo_evidence
                notes = line.notes or payload.notes or f"Unordered item {line.sku} ({received_qty} {line.unit}) placed in quarantine pending purchasing/vendor resolution."

                cursor.execute("""
                    INSERT INTO audit_logs (timestamp, employee_id, action, po_number, sku, quantity_change, reason_code, photo_evidence, notes)
                    VALUES (?, ?, 'QUARANTINED_UNORDERED_SKU', ?, ?, ?, ?, ?, ?);
                """, (now_iso, payload.employee_id, payload.po_number, line.sku, received_qty, reason, photo, notes))

            else:
                # -----------------------------------------------------
                # VERIFIED PO ITEM OR EXPLICIT OVERRIDE:
                # Add ONLY received quantity to physical_on_hand & atp_qty
                # -----------------------------------------------------
                if inv_row:
                    new_physical = float(inv_row["physical_on_hand"]) + received_qty
                    new_atp = float(inv_row["atp_qty"]) + received_qty
                    current_quarantine = float(inv_row["quarantine_qty"] if "quarantine_qty" in inv_row.keys() else 0.0)

                    cursor.execute("""
                        UPDATE inventory_hub
                        SET physical_on_hand = ?, atp_qty = ?, updated_at = ?
                        WHERE sku = ?;
                    """, (new_physical, new_atp, now_iso, line.sku))

                    updated_inventory_items.append(InventoryItem(
                        sku=inv_row["sku"],
                        description=inv_row["description"],
                        category=inv_row["category"],
                        physical_on_hand=new_physical,
                        quarantine_qty=current_quarantine,
                        reserved_qty=float(inv_row["reserved_qty"]),
                        atp_qty=new_atp,
                        unit=inv_row["unit"],
                        location=inv_row["location"],
                        updated_at=now_iso
                    ))
                else:
                    item_desc = f"Newly Received Material ({line.sku})"
                    cursor.execute("""
                        INSERT INTO inventory_hub (sku, description, category, physical_on_hand, quarantine_qty, reserved_qty, atp_qty, unit, location, updated_at)
                        VALUES (?, ?, 'General Fasteners', ?, 0.0, 0.0, ?, ?, 'Receiving Staging Zone', ?);
                    """, (line.sku, item_desc, received_qty, received_qty, line.unit, now_iso))

                    updated_inventory_items.append(InventoryItem(
                        sku=line.sku,
                        description=item_desc,
                        category="General Fasteners",
                        physical_on_hand=received_qty,
                        quarantine_qty=0.0,
                        reserved_qty=0.0,
                        atp_qty=received_qty,
                        unit=line.unit,
                        location="Receiving Staging Zone",
                        updated_at=now_iso
                    ))

                # Update PO line status if line is on the PO
                if is_on_po:
                    cursor.execute("""
                        UPDATE po_lines
                        SET received_qty = received_qty + ?,
                            status = CASE 
                                WHEN (received_qty + ?) >= ordered_qty THEN 'COMPLETED'
                                ELSE 'PARTIALLY_RECEIVED'
                            END
                        WHERE po_number = ? AND sku = ?;
                    """, (received_qty, received_qty, payload.po_number, line.sku))

                # Log Normal Goods Receipt Confirmation
                action = "GOODS_RECEIPT_OVERRIDE_ACCEPTED" if not is_on_po else "GOODS_RECEIPT_CONFIRMED"
                photo = line.photo_evidence or payload.photo_evidence
                notes = line.notes or payload.notes or "Goods receipt confirmed by warehouse staff"

                cursor.execute("""
                    INSERT INTO audit_logs (timestamp, employee_id, action, po_number, sku, quantity_change, reason_code, photo_evidence, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (now_iso, payload.employee_id, action, payload.po_number, line.sku, received_qty, reason, photo, notes))

        # D. Trigger Mock Denmark ERP Adapter synchronization
        erp_sync_result = sync_goods_receipt_to_erp(
            po_number=payload.po_number,
            confirmed_lines=[l.model_dump() for l in payload.confirmed_lines],
            employee_id=payload.employee_id,
            store_id=payload.store_id,
            idempotency_key=payload.idempotency_key
        )

        # E. Record in receipt_transactions to enforce idempotency
        payload_summary_json = json.dumps({
            "confirmed_lines_count": len(payload.confirmed_lines),
            "erp_sync": erp_sync_result
        })

        cursor.execute("""
            INSERT INTO receipt_transactions (
                idempotency_key, po_number, employee_id, store_id, processed_at, status, payload_summary, erp_sync_status, erp_transaction_id
            ) VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?);
        """, (
            payload.idempotency_key,
            payload.po_number,
            payload.employee_id,
            payload.store_id,
            now_iso,
            payload_summary_json,
            erp_sync_result["sync_status"],
            erp_sync_result["erp_transaction_id"]
        ))

        # Check if PO should be marked PARTIALLY_RECEIVED or COMPLETED
        cursor.execute("""
            SELECT COUNT(*) AS pending_count
            FROM po_lines
            WHERE po_number = ? AND status != 'COMPLETED';
        """, (payload.po_number,))
        pending_row = cursor.fetchone()
        po_status = "PARTIALLY_RECEIVED" if (pending_row and pending_row["pending_count"] > 0) else "COMPLETED"

        cursor.execute("""
            UPDATE po_headers
            SET status = ?, updated_at = ?
            WHERE po_number = ?;
        """, (po_status, now_iso, payload.po_number))

        conn.commit()
        conn.close()

        return ReceiptTransactionResponse(
            status="success",
            message="Goods receipt successfully confirmed, inventory posted, and Denmark ERP synced.",
            idempotency_key=payload.idempotency_key,
            po_number=payload.po_number,
            employee_id=payload.employee_id,
            store_id=payload.store_id,
            is_idempotent_replay=False,
            processed_at=now_iso,
            updated_inventory=updated_inventory_items,
            erp_sync=erp_sync_result
        )

    except Exception as exc:
        conn.rollback()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "status": "error",
                "error_code": "CONFIRM_RECEIPT_ERROR",
                "message": f"Failed to confirm goods receipt: {str(exc)}",
                "details": {"idempotency_key": payload.idempotency_key}
            }
        )


# ---------------------------------------------------------
# 4. Real-time ATP Inventory Lookup Endpoint
# ---------------------------------------------------------
@app.get(
    "/api/v1/inventory/atp",
    response_model=InventoryATPResponse,
    tags=["Store Counter ATP"]
)
def get_inventory_atp(
    sku: Optional[str] = None,
    category: Optional[str] = None,
    store_id: str = "DK-HUB-01"
):
    """
    Returns real-time stock levels and Available-To-Promise (ATP) quantities
    for the Store Counter Clerk interface.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM inventory_hub WHERE 1=1"
    params: List[Any] = []

    if sku:
        query += " AND (sku LIKE ? OR description LIKE ?)"
        params.extend([f"%{sku}%", f"%{sku}%"])
    if category:
        query += " AND category = ?"
        params.append(category)

    query += " ORDER BY sku ASC;"

    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()

    items = [
        InventoryItem(
            sku=row["sku"],
            sku_code=row["sku"],
            description=row["description"],
            item_name=row["description"],
            category=row["category"],
            physical_on_hand=float(row["physical_on_hand"]),
            quarantine_qty=float(row["quarantine_qty"] if "quarantine_qty" in row.keys() else 0.0),
            reserved_qty=float(row["reserved_qty"]),
            atp_qty=float(row["atp_qty"]),
            unit=row["unit"],
            location=row["location"],
            updated_at=row["updated_at"],
            last_updated=row["updated_at"],
            trust_status="GREEN"
        )
        for row in rows
    ]

    return InventoryATPResponse(
        status="success",
        store_id=store_id,
        total_skus=len(items),
        timestamp=datetime.now(timezone.utc).isoformat(),
        items=items
    )


# ---------------------------------------------------------
# 5. Reset Demo Database Endpoint
# ---------------------------------------------------------
@app.post(
    "/api/v1/reset-demo",
    response_model=ResetDemoResponse,
    tags=["Demo Administration"]
)
def reset_demo():
    """
    Truncates all operational tables and reseeds clean baseline data
    (PO-48213 with 14 lines and initial inventory quantities).
    Essential for running clean demo video takes.
    """
    result = reset_and_reseed_db()
    return ResetDemoResponse(**result)


# ---------------------------------------------------------
# 6. Audit Logs Inspection Endpoint (QA & Debugging)
# ---------------------------------------------------------
@app.get("/api/v1/audit-logs", tags=["Audit & Governance"])
def get_audit_logs(limit: int = 50):
    """Returns recent audit log records including employee_id, reason_code, and photo_evidence."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, timestamp, employee_id, action, po_number, sku, quantity_change, reason_code, photo_evidence, notes
        FROM audit_logs
        ORDER BY id DESC
        LIMIT ?;
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()

    return {
        "status": "success",
        "count": len(rows),
        "logs": [dict(r) for r in rows]
    }
