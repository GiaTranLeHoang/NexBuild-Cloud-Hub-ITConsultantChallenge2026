"""
NexBuild Cloud Hub - Mock Denmark ERP Adapter (Phase 3 Locked)

Simulates outbound synchronization to the Assumed Denmark Legacy ERP
(e.g., Microsoft Dynamics 365 / SAP Business One Country Instance).

Per Round 1 Proposal:
  Company A runs fragmented country-specific ERP instances. The Denmark
  instance is treated as an "Assumed Legacy ERP" accessed via standard
  asynchronous REST / OData voucher ingestion over Azure Integration Services.
  This adapter simulates that integration boundary deterministically without
  network I/O, so the demo can run fully offline.

GL Account used for all Denmark goods-receipt postings:
  GL-DK-2100-INVENTORY-RECEIVING

Compatible with Python 3.9+.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Primary canonical function (Phase 3 spec)
# ---------------------------------------------------------------------------

def sync_to_denmark_erp(
    po_number: str,
    confirmed_lines: List[Dict[str, Any]],
    employee_id: str,
    store_id: str = "DK-Aarhus-01",
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Simulate remote goods-receipt posting to the Assumed Denmark Legacy ERP.

    Generates a deterministic pseudo-random ERP voucher number of the form:
        DK-ERP-GR-2026-<8-hex-chars-uppercase>

    When idempotency_key is supplied, the first 8 characters are used as the
    voucher suffix so the same key always produces the same voucher number
    (idempotent replay-safe).

    Parameters
    ----------
    po_number:
        Purchase Order being received (e.g. "PO-48213").
    confirmed_lines:
        List of confirmed receipt line dicts.  Each dict must contain at minimum:
          sku_code (or sku), received_qty, unit.
    employee_id:
        Warehouse operator who confirmed the receipt (e.g. "EMP-9021").
    store_id:
        Destination store / hub (e.g. "DK-Aarhus-01").
    idempotency_key:
        Optional client-generated idempotency key.  Used to derive the voucher
        suffix so replayed confirmations produce the same ERP voucher.

    Returns
    -------
    dict with ERP acknowledgement payload including erp_voucher_no, status,
    gl_account, and per-line posting statuses.
    """
    # Derive voucher suffix — deterministic from idempotency_key when available
    if idempotency_key and len(idempotency_key) >= 8:
        suffix = idempotency_key[:8].upper()
    else:
        suffix = uuid.uuid4().hex[:8].upper()

    erp_voucher_no: str = f"DK-ERP-GR-2026-{suffix}"
    timestamp: str = datetime.now(timezone.utc).isoformat() + "Z"

    # Build per-line posting summary
    lines_posted: List[Dict[str, Any]] = []
    total_units: float = 0.0

    for line in confirmed_lines:
        sku = line.get("sku_code") or line.get("sku") or "UNKNOWN"
        qty = float(line.get("received_qty", 0.0))
        unit = line.get("unit", "pcs")
        match_status = line.get("match_status", "OK")

        total_units += qty

        # Quarantined / unordered items are logged in ERP as QUARANTINE_HOLD
        # (they do NOT touch the sellable subledger account)
        if match_status == "UNKNOWN_SKU" or line.get("reason_code") in (
            "unordered_quarantine",
            "not_on_po",
        ):
            ledger_note = "QUARANTINE_HOLD — pending purchasing clearance"
            gl_line = "GL-DK-9900-QUARANTINE-HOLD"
        else:
            ledger_note = "POSTED_TO_INVENTORY_SUBLEDGER"
            gl_line = "GL-DK-2100-INVENTORY-RECEIVING"

        lines_posted.append({
            "sku_code":      sku,
            "received_qty":  qty,
            "unit":          unit,
            "gl_account":    gl_line,
            "line_status":   ledger_note,
        })

    return {
        # Core voucher fields
        "erp_voucher_no":        erp_voucher_no,
        "erp_transaction_id":    erp_voucher_no,          # backward-compat alias
        "status":                "SUCCESS",
        "sync_status":           "SUCCESS_COMMITTED",     # backward-compat alias
        # ERP system metadata
        "erp_system":            (
            "Assumed Denmark Legacy ERP "
            "(e.g., Microsoft Dynamics 365 / Country ERP Instance)"
        ),
        "gl_account":            "GL-DK-2100-INVENTORY-RECEIVING",
        "general_ledger_account": "GL-DK-2100-INVENTORY-RECEIVING",  # alias
        "integration_protocol":  (
            "HTTPS/OData v4 via Azure Integration Services (Mock Adapter)"
        ),
        # Transaction metadata
        "po_number":             po_number,
        "store_id":              store_id,
        "employee_id":           employee_id,
        "timestamp":             timestamp,
        "total_lines_synced":    len(lines_posted),
        "total_units_received":  total_units,
        "lines_posted":          lines_posted,
        "message":               (
            f"Successfully posted Goods Receipt voucher {erp_voucher_no} "
            f"for PO {po_number} into Assumed Denmark Legacy ERP central ledger."
        ),
    }


# ---------------------------------------------------------------------------
# Legacy alias — kept so any existing call-sites using the old name still work
# ---------------------------------------------------------------------------

def sync_goods_receipt_to_erp(
    po_number: str,
    confirmed_lines: List[Dict[str, Any]],
    employee_id: str,
    store_id: str = "DK-Aarhus-01",
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Legacy shim — delegates to sync_to_denmark_erp()."""
    return sync_to_denmark_erp(
        po_number=po_number,
        confirmed_lines=confirmed_lines,
        employee_id=employee_id,
        store_id=store_id,
        idempotency_key=idempotency_key,
    )
