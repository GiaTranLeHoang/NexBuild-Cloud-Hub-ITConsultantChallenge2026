# Leader's baseline smoke tests for /backend. QA Lead (Dau) can add test_mvp_flow.py alongside this file without conflicts.
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import reset_and_reseed_db

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_clean_db():
    """Reseeds database before each test run."""
    reset_and_reseed_db()
    yield


def test_health_check():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"  # Phase 3 spec: health returns "ok"
    assert "NexBuild Cloud Hub" in data["service"]


def test_get_po_48213_details():
    response = client.get("/api/v1/po/PO-48213")
    assert response.status_code == 200
    # Phase 3: POHeaderResponse is returned directly (no wrapper {"status","po"})
    po = response.json()
    assert po["po_number"] == "PO-48213"
    assert po["supplier_name"] == "Nordic BuildSupply DK"
    assert len(po["lines"]) == 14

    # Verify core items using canonical sku_code key
    sku_map = {line["sku_code"]: line for line in po["lines"]}
    assert sku_map["CEM-25"]["ordered_qty"] == 80.0
    assert sku_map["TIM-4595"]["ordered_qty"] == 40.0
    assert sku_map["PLAST-01"]["ordered_qty"] == 60.0


def test_get_nonexistent_po():
    response = client.get("/api/v1/po/PO-99999")
    assert response.status_code == 404
    error = response.json()
    assert error["detail"]["error_code"] == "PO_NOT_FOUND"


def test_scan_delivery_note_matching_engine():
    response = client.post("/api/v1/scan-delivery-note", json={"po_number": "PO-48213"})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["po_number"] == "PO-48213"

    items_map = {item["sku"]: item for item in data["items"]}

    # CEM-25: OK (exact match)
    assert items_map["CEM-25"]["match_status"] == "OK"
    assert items_map["CEM-25"]["received_qty"] == 80.0
    assert items_map["CEM-25"]["requires_review"] is False

    # TIM-4595: OK (exact match)
    assert items_map["TIM-4595"]["match_status"] == "OK"
    assert items_map["TIM-4595"]["received_qty"] == 40.0
    assert items_map["TIM-4595"]["requires_review"] is False

    # PLAST-01: SHORT (52 instead of 60)
    assert items_map["PLAST-01"]["match_status"] == "SHORT"
    assert items_map["PLAST-01"]["received_qty"] == 52.0
    assert items_map["PLAST-01"]["requires_review"] is True

    # FIX-M8: UNKNOWN_SKU with low confidence ~0.68
    assert items_map["FIX-M8"]["match_status"] == "UNKNOWN_SKU"
    assert items_map["FIX-M8"]["received_qty"] == 12.0
    assert items_map["FIX-M8"]["confidence_score"] == 0.68
    assert items_map["FIX-M8"]["requires_review"] is True

    # Summary - Phase 2: OCR returns all 14 PO-48213 lines (12 OK + PLAST-01 SHORT + FIX-M8 UNKNOWN_SKU)
    summary = data["summary"]
    assert summary["total_scanned_items"] == 14
    assert summary["matched_ok_count"] == 12
    assert summary["discrepancy_count"] == 2
    assert summary["requires_supervisor_approval"] is True


def test_confirm_receipt_quarantine_governance_and_atp_update():
    """
    Verifies that verified PO items increase ATP stock:
      CEM-25: 120 -> 200 (+80)
      TIM-4595: 85 -> 125 (+40)
      PLAST-01: 30 -> 82 (+52)
    While FIX-M8 (UNKNOWN_SKU not on PO) is quarantined:
      - atp_qty remains 10.0
      - physical_on_hand remains 10.0 (excluded from sellable stock)
      - quarantine_qty becomes 12.0
      - audit_logs records 'QUARANTINED_UNORDERED_SKU'
    """
    # Check baseline inventory before confirmation
    inv_before = client.get("/api/v1/inventory/atp").json()["items"]
    stock_before = {item["sku"]: (item["physical_on_hand"], item["atp_qty"]) for item in inv_before}

    assert stock_before["CEM-25"] == (120.0, 120.0)
    assert stock_before["TIM-4595"] == (85.0, 85.0)
    assert stock_before["PLAST-01"] == (30.0, 30.0)
    assert stock_before["FIX-M8"] == (10.0, 10.0)

    # Confirm goods receipt with FIX-M8 under default quarantine
    payload = {
        "po_number": "PO-48213",
        "employee_id": "EMP-DK-901",
        "store_id": "DK-HUB-01",
        "idempotency_key": "IDEMP-TEST-KEY-001",
        "confirmed_lines": [
            {"sku": "CEM-25", "received_qty": 80.0, "unit": "BAG", "reason_code": "NORMAL_GOODS_RECEIPT"},
            {"sku": "TIM-4595", "received_qty": 40.0, "unit": "PCS", "reason_code": "NORMAL_GOODS_RECEIPT"},
            {"sku": "PLAST-01", "received_qty": 52.0, "unit": "SHEET", "reason_code": "SUPPLIER_SHORT_SHIP"},
            {"sku": "FIX-M8", "received_qty": 12.0, "unit": "BOX", "reason_code": "unordered_quarantine"}
        ],
        "notes": "Verified at Gate 3 with driver."
    }

    res = client.post("/api/v1/confirm-receipt", json=payload)
    assert res.status_code == 200
    confirm_data = res.json()
    assert confirm_data["status"] == "success"
    assert confirm_data["is_idempotent_replay"] is False
    assert confirm_data["erp_sync"]["sync_status"] == "SUCCESS_COMMITTED"

    # Verify inventory ATP and quarantine separation
    inv_after = client.get("/api/v1/inventory/atp").json()["items"]
    stock_after = {item["sku"]: item for item in inv_after}

    # Verified PO lines: increased ATP
    assert stock_after["CEM-25"]["physical_on_hand"] == 200.0  # 120 + 80
    assert stock_after["CEM-25"]["atp_qty"] == 200.0

    assert stock_after["TIM-4595"]["physical_on_hand"] == 125.0  # 85 + 40
    assert stock_after["TIM-4595"]["atp_qty"] == 125.0

    assert stock_after["PLAST-01"]["physical_on_hand"] == 82.0  # 30 + 52
    assert stock_after["PLAST-01"]["atp_qty"] == 82.0

    # FIX-M8: Quarantined, atp_qty must remain 10.0, quarantine_qty = 12.0
    assert stock_after["FIX-M8"]["atp_qty"] == 10.0
    assert stock_after["FIX-M8"]["physical_on_hand"] == 10.0
    assert stock_after["FIX-M8"]["quarantine_qty"] == 12.0

    # Verify audit logs record quarantine action
    logs_res = client.get("/api/v1/audit-logs").json()
    quarantine_logs = [l for l in logs_res["logs"] if l["sku"] == "FIX-M8"]
    assert len(quarantine_logs) > 0
    assert quarantine_logs[0]["action"] == "QUARANTINED_UNORDERED_SKU"
    assert quarantine_logs[0]["quantity_change"] == 12.0


def test_confirm_receipt_explicit_override_allows_atp():
    """Verifies that an explicit supervisor override allows an unordered SKU into ATP."""
    payload = {
        "po_number": "PO-48213",
        "employee_id": "SUPERVISOR-DK-01",
        "store_id": "DK-HUB-01",
        "idempotency_key": "IDEMP-OVERRIDE-KEY-002",
        "confirmed_lines": [
            {"sku": "FIX-M8", "received_qty": 12.0, "unit": "BOX", "reason_code": "accept_unordered_override"}
        ],
        "notes": "Emergency purchasing override approved by store manager."
    }

    res = client.post("/api/v1/confirm-receipt", json=payload)
    assert res.status_code == 200

    inv = client.get("/api/v1/inventory/atp").json()["items"]
    stock = {item["sku"]: item for item in inv}
    # With explicit override, stock is accepted into ATP: 10 + 12 = 22
    assert stock["FIX-M8"]["atp_qty"] == 22.0
    assert stock["FIX-M8"]["physical_on_hand"] == 22.0


def test_idempotent_receipt_replay():
    payload = {
        "po_number": "PO-48213",
        "employee_id": "EMP-DK-901",
        "store_id": "DK-HUB-01",
        "idempotency_key": "IDEMP-DUPLICATE-PREVENTION-999",
        "confirmed_lines": [
            {"sku": "CEM-25", "received_qty": 80.0, "unit": "BAG"}
        ]
    }

    # First call: executes and updates stock
    res1 = client.post("/api/v1/confirm-receipt", json=payload)
    assert res1.status_code == 200
    assert res1.json()["is_idempotent_replay"] is False

    # Second call with identical idempotency_key: returns replay without updating stock again
    res2 = client.post("/api/v1/confirm-receipt", json=payload)
    assert res2.status_code == 200
    assert res2.json()["is_idempotent_replay"] is True

    # Stock should be 120 + 80 = 200 (NOT 280)
    inv = client.get("/api/v1/inventory/atp").json()["items"]
    stock = {item["sku"]: item["physical_on_hand"] for item in inv}
    assert stock["CEM-25"] == 200.0


def test_reset_demo_endpoint():
    res = client.post("/api/v1/reset-demo")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["seeded_lines_count"] == 14

