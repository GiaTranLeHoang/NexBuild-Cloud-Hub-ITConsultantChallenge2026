"""
NexBuild Cloud Hub - Database Layer & Seed Engine (Phase 1 Locked)
SQLite implementation with automated schema creation, auto-seeding, and connection management.
Compatible with Python 3.9+.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

# Database path resolution: project root nexbuild.db
DB_FILE = Path(__file__).resolve().parent.parent / "nexbuild.db"


def get_db_connection() -> sqlite3.Connection:
    """Creates a database connection with Row factory enabled for dictionary-like access."""
    conn = sqlite3.connect(str(DB_FILE))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    """Initializes tables if they do not exist, and auto-seeds baseline data."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Purchase Order Headers table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS po_headers (
            po_number TEXT PRIMARY KEY,
            supplier_name TEXT NOT NULL,
            supplier TEXT,
            store_id TEXT NOT NULL DEFAULT 'DK-Aarhus-01',
            status TEXT NOT NULL DEFAULT 'OPEN',
            order_date TEXT,
            expected_delivery_date TEXT,
            total_lines INTEGER NOT NULL DEFAULT 14,
            created_at TEXT NOT NULL,
            updated_at TEXT
        );
    """)

    # 2. Purchase Order Lines table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS po_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            po_number TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            sku_code TEXT NOT NULL,
            sku TEXT,
            item_name TEXT NOT NULL,
            description TEXT,
            ordered_qty REAL NOT NULL,
            received_qty REAL NOT NULL DEFAULT 0.0,
            unit TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            FOREIGN KEY (po_number) REFERENCES po_headers (po_number) ON DELETE CASCADE
        );
    """)

    # 3. Inventory Hub table (Separates physical_on_hand, reserved_qty, committed_qty, atp_qty, quarantine_qty)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventory_hub (
            sku_code TEXT PRIMARY KEY,
            sku TEXT,
            item_name TEXT NOT NULL,
            description TEXT,
            category TEXT,
            physical_on_hand REAL NOT NULL DEFAULT 0.0,
            reserved_qty REAL NOT NULL DEFAULT 0.0,
            committed_qty REAL NOT NULL DEFAULT 0.0,
            atp_qty REAL NOT NULL DEFAULT 0.0,
            quarantine_qty REAL NOT NULL DEFAULT 0.0,
            unit TEXT NOT NULL DEFAULT 'pcs',
            location TEXT,
            last_updated TEXT NOT NULL,
            updated_at TEXT
        );
    """)

    # 4. Receipt Transactions table (Offline Idempotency protection)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS receipt_transactions (
            idempotency_key TEXT PRIMARY KEY,
            po_number TEXT NOT NULL,
            employee_id TEXT NOT NULL,
            store_id TEXT NOT NULL,
            erp_voucher_no TEXT,
            erp_transaction_id TEXT,
            response_json TEXT,
            payload_summary TEXT,
            erp_sync_status TEXT,
            status TEXT NOT NULL DEFAULT 'SUCCESS',
            processed_at TEXT,
            created_at TEXT NOT NULL
        );
    """)

    # 5. Audit Logs table (tracks employee_id, reason_code, photo_evidence, details)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            employee_id TEXT NOT NULL,
            store_id TEXT NOT NULL DEFAULT 'DK-Aarhus-01',
            po_number TEXT,
            sku_code TEXT,
            sku TEXT,
            action TEXT NOT NULL,
            quantity_change REAL DEFAULT 0.0,
            reason_code TEXT,
            photo_evidence TEXT,
            details TEXT,
            notes TEXT
        );
    """)

    # Safe migration: ensure newly added columns exist if upgrading from older schema
    migrations = [
        ("po_headers", "supplier_name", "TEXT"),
        ("po_headers", "store_id", "TEXT NOT NULL DEFAULT 'DK-Aarhus-01'"),
        ("po_lines", "sku_code", "TEXT"),
        ("po_lines", "item_name", "TEXT"),
        ("inventory_hub", "sku_code", "TEXT"),
        ("inventory_hub", "item_name", "TEXT"),
        ("inventory_hub", "committed_qty", "REAL NOT NULL DEFAULT 0.0"),
        ("inventory_hub", "quarantine_qty", "REAL NOT NULL DEFAULT 0.0"),
        ("inventory_hub", "last_updated", "TEXT"),
        ("receipt_transactions", "erp_voucher_no", "TEXT"),
        ("receipt_transactions", "response_json", "TEXT"),
        ("receipt_transactions", "created_at", "TEXT"),
        ("audit_logs", "store_id", "TEXT NOT NULL DEFAULT 'DK-Aarhus-01'"),
        ("audit_logs", "sku_code", "TEXT"),
        ("audit_logs", "details", "TEXT"),
    ]
    for table, col, col_type in migrations:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type};")
        except sqlite3.OperationalError:
            pass  # Column already present

    conn.commit()
    conn.close()

    # Auto-seed baseline dataset if PO-48213 is missing
    seed_baseline_data(force_reset=False)


def get_seed_data_definition() -> Dict[str, Any]:
    """
    Returns the baseline data definition for PO-48213 and Denmark Hub inventory.
    Total 14 lines on PO matching Slide 4 mockup:
    - CEM-25 (Cement 25kg): Ordered 80, Initial On-Hand/ATP: 120
    - TIM-4595 (Timber 45x95): Ordered 40, Initial On-Hand/ATP: 85
    - PLAST-01 (Plasterboard): Ordered 60, Initial On-Hand/ATP: 30
    Plus remaining 11 building material lines (total 14).
    Also includes FIX-M8 (in inventory only, not on PO).
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    po_header = {
        "po_number": "PO-48213",
        "supplier_name": "Nordic BuildSupply DK",
        "supplier": "Nordic BuildSupply DK",
        "store_id": "DK-Aarhus-01",
        "status": "OPEN",
        "order_date": "2026-10-28",
        "expected_delivery_date": "2026-11-02",
        "total_lines": 14,
        "created_at": now_iso,
        "updated_at": now_iso
    }

    # Exactly 14 lines for PO-48213
    po_lines = [
        {"line_number": 1, "sku_code": "CEM-25", "sku": "CEM-25", "item_name": "Aalborg Portland Rapid Cement 25kg", "description": "Aalborg Portland Rapid Cement 25kg", "ordered_qty": 80.0, "unit": "bags"},
        {"line_number": 2, "sku_code": "TIM-4595", "sku": "TIM-4595", "item_name": "C24 Structural Timber 45x95mm 4.2m", "description": "C24 Structural Timber 45x95mm 4.2m", "ordered_qty": 40.0, "unit": "pcs"},
        {"line_number": 3, "sku_code": "PLAST-01", "sku": "PLAST-01", "item_name": "Gyproc Standard Plasterboard 13x1200x2400", "description": "Gyproc Standard Plasterboard 13x1200x2400", "ordered_qty": 60.0, "unit": "sheets"},
        {"line_number": 4, "sku_code": "INSUL-100", "sku": "INSUL-100", "item_name": "Rockwool Flexi Acoustic Insulation 100mm", "description": "Rockwool Flexi Acoustic Insulation 100mm", "ordered_qty": 50.0, "unit": "packs"},
        {"line_number": 5, "sku_code": "BRICK-RED", "sku": "BRICK-RED", "item_name": "Danish Red Facing Bricks RT 475", "description": "Danish Red Facing Bricks RT 475", "ordered_qty": 1200.0, "unit": "pcs"},
        {"line_number": 6, "sku_code": "SAND-04", "sku": "SAND-04", "item_name": "Fine Grain Washed Sharp Sand 0-4mm 25kg", "description": "Fine Grain Washed Sharp Sand 0-4mm 25kg", "ordered_qty": 100.0, "unit": "bags"},
        {"line_number": 7, "sku_code": "GRAV-1020", "sku": "GRAV-1020", "item_name": "Pea Shingle Drainage Gravel 10-20mm 25kg", "description": "Pea Shingle Drainage Gravel 10-20mm 25kg", "ordered_qty": 60.0, "unit": "bags"},
        {"line_number": 8, "sku_code": "REBAR-12", "sku": "REBAR-12", "item_name": "High Yield Deformed Rebar Steel 12mm x 6m", "description": "High Yield Deformed Rebar Steel 12mm x 6m", "ordered_qty": 30.0, "unit": "pcs"},
        {"line_number": 9, "sku_code": "PLY-18", "sku": "PLY-18", "item_name": "Nordic Structural Birch Plywood 18mm", "description": "Nordic Structural Birch Plywood 18mm", "ordered_qty": 25.0, "unit": "sheets"},
        {"line_number": 10, "sku_code": "SCREW-550", "sku": "SCREW-550", "item_name": "Spax Stainless Torx Wood Screws 5.0x50mm (200pk)", "description": "Spax Stainless Torx Wood Screws 5.0x50mm (200pk)", "ordered_qty": 35.0, "unit": "boxes"},
        {"line_number": 11, "sku_code": "ROOF-FELT", "sku": "ROOF-FELT", "item_name": "Icopal Top SBS Bitumen Roofing Felt 10m", "description": "Icopal Top SBS Bitumen Roofing Felt 10m", "ordered_qty": 20.0, "unit": "rolls"},
        {"line_number": 12, "sku_code": "MORTAR-MIX", "sku": "MORTAR-MIX", "item_name": "Weber Premix Masonry Mortar M5 25kg", "description": "Weber Premix Masonry Mortar M5 25kg", "ordered_qty": 75.0, "unit": "bags"},
        {"line_number": 13, "sku_code": "PAINT-WHT", "sku": "PAINT-WHT", "item_name": "Nordsjö Professional Acryl Wall Paint 10L White", "description": "Nordsjö Professional Acryl Wall Paint 10L White", "ordered_qty": 30.0, "unit": "cans"},
        {"line_number": 14, "sku_code": "SEAL-SIL", "sku": "SEAL-SIL", "item_name": "Dana Lim Sanitary Construction Silicone 310ml", "description": "Dana Lim Sanitary Construction Silicone 310ml", "ordered_qty": 45.0, "unit": "tubes"},
    ]

    # Inventory Baseline: separates physical_on_hand, reserved_qty, committed_qty, atp_qty, quarantine_qty
    # Includes FIX-M8 (which is in inventory but NOT in PO-48213)
    inventory_items = [
        {"sku_code": "CEM-25", "sku": "CEM-25", "item_name": "Aalborg Portland Rapid Cement 25kg", "description": "Aalborg Portland Rapid Cement 25kg", "category": "Heavy Building", "physical_on_hand": 120.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 120.0, "quarantine_qty": 0.0, "unit": "bags", "location": "Aisle 1 - Bay A"},
        {"sku_code": "TIM-4595", "sku": "TIM-4595", "item_name": "C24 Structural Timber 45x95mm 4.2m", "description": "C24 Structural Timber 45x95mm 4.2m", "category": "Timber & Joinery", "physical_on_hand": 85.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 85.0, "quarantine_qty": 0.0, "unit": "pcs", "location": "Yard Racks - Sec 3"},
        {"sku_code": "PLAST-01", "sku": "PLAST-01", "item_name": "Gyproc Standard Plasterboard 13x1200x2400", "description": "Gyproc Standard Plasterboard 13x1200x2400", "category": "Drywall & Board", "physical_on_hand": 30.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 30.0, "quarantine_qty": 0.0, "unit": "sheets", "location": "Aisle 2 - Drywall"},
        {"sku_code": "INSUL-100", "sku": "INSUL-100", "item_name": "Rockwool Flexi Acoustic Insulation 100mm", "description": "Rockwool Flexi Acoustic Insulation 100mm", "category": "Insulation", "physical_on_hand": 45.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 45.0, "quarantine_qty": 0.0, "unit": "packs", "location": "Aisle 3 - Insulation"},
        {"sku_code": "BRICK-RED", "sku": "BRICK-RED", "item_name": "Danish Red Facing Bricks RT 475", "description": "Danish Red Facing Bricks RT 475", "category": "Masonry", "physical_on_hand": 2500.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 2500.0, "quarantine_qty": 0.0, "unit": "pcs", "location": "Yard Pallet Zone 1"},
        {"sku_code": "SAND-04", "sku": "SAND-04", "item_name": "Fine Grain Washed Sharp Sand 0-4mm 25kg", "description": "Fine Grain Washed Sharp Sand 0-4mm 25kg", "category": "Aggregates", "physical_on_hand": 150.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 150.0, "quarantine_qty": 0.0, "unit": "bags", "location": "Yard Aggregate Bay 2"},
        {"sku_code": "GRAV-1020", "sku": "GRAV-1020", "item_name": "Pea Shingle Drainage Gravel 10-20mm 25kg", "description": "Pea Shingle Drainage Gravel 10-20mm 25kg", "category": "Aggregates", "physical_on_hand": 90.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 90.0, "quarantine_qty": 0.0, "unit": "bags", "location": "Yard Aggregate Bay 4"},
        {"sku_code": "REBAR-12", "sku": "REBAR-12", "item_name": "High Yield Deformed Rebar Steel 12mm x 6m", "description": "High Yield Deformed Rebar Steel 12mm x 6m", "category": "Steel & Reinforcement", "physical_on_hand": 40.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 40.0, "quarantine_qty": 0.0, "unit": "pcs", "location": "Steel Yard Bay 1"},
        {"sku_code": "PLY-18", "sku": "PLY-18", "item_name": "Nordic Structural Birch Plywood 18mm", "description": "Nordic Structural Birch Plywood 18mm", "category": "Sheet Materials", "physical_on_hand": 35.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 35.0, "quarantine_qty": 0.0, "unit": "sheets", "location": "Aisle 2 - Sheet Racks"},
        {"sku_code": "SCREW-550", "sku": "SCREW-550", "item_name": "Spax Stainless Torx Wood Screws 5.0x50mm (200pk)", "description": "Spax Stainless Torx Wood Screws 5.0x50mm (200pk)", "category": "Fixings & Fasteners", "physical_on_hand": 50.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 50.0, "quarantine_qty": 0.0, "unit": "boxes", "location": "Aisle 4 - Shelf 1B"},
        {"sku_code": "ROOF-FELT", "sku": "ROOF-FELT", "item_name": "Icopal Top SBS Bitumen Roofing Felt 10m", "description": "Icopal Top SBS Bitumen Roofing Felt 10m", "category": "Roofing", "physical_on_hand": 15.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 15.0, "quarantine_qty": 0.0, "unit": "rolls", "location": "Aisle 5 - Roofing"},
        {"sku_code": "MORTAR-MIX", "sku": "MORTAR-MIX", "item_name": "Weber Premix Masonry Mortar M5 25kg", "description": "Weber Premix Masonry Mortar M5 25kg", "category": "Heavy Building", "physical_on_hand": 110.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 110.0, "quarantine_qty": 0.0, "unit": "bags", "location": "Aisle 1 - Bay C"},
        {"sku_code": "PAINT-WHT", "sku": "PAINT-WHT", "item_name": "Nordsjö Professional Acryl Wall Paint 10L White", "description": "Nordsjö Professional Acryl Wall Paint 10L White", "category": "Decorating & Chemicals", "physical_on_hand": 25.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 25.0, "quarantine_qty": 0.0, "unit": "cans", "location": "Aisle 6 - Paint Depot"},
        {"sku_code": "SEAL-SIL", "sku": "SEAL-SIL", "item_name": "Dana Lim Sanitary Construction Silicone 310ml", "description": "Dana Lim Sanitary Construction Silicone 310ml", "category": "Decorating & Chemicals", "physical_on_hand": 65.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 65.0, "quarantine_qty": 0.0, "unit": "tubes", "location": "Aisle 6 - Sealants"},
        {"sku_code": "FIX-M8", "sku": "FIX-M8", "item_name": "Stainless Through-Bolt Heavy Duty Anchors M8x75mm", "description": "Stainless Through-Bolt Heavy Duty Anchors M8x75mm", "category": "Fixings & Fasteners", "physical_on_hand": 10.0, "reserved_qty": 0.0, "committed_qty": 0.0, "atp_qty": 10.0, "quarantine_qty": 0.0, "unit": "boxes", "location": "Aisle 4 - Shelf 3A"}
    ]

    return {
        "po_header": po_header,
        "po_lines": po_lines,
        "inventory_items": inventory_items
    }


def seed_baseline_data(force_reset: bool = True) -> Dict[str, Any]:
    """
    Deterministically resets and seeds baseline data for PO-48213 and inventory_hub.
    If force_reset=True, cleans existing tables and re-populates clean state.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    if not force_reset:
        cursor.execute("SELECT 1 FROM po_headers WHERE po_number = ?", ("PO-48213",))
        if cursor.fetchone() is not None:
            conn.close()
            return {"status": "skipped", "message": "PO-48213 already present."}

    # Clean existing data
    cursor.execute("DELETE FROM receipt_transactions;")
    cursor.execute("DELETE FROM audit_logs;")
    cursor.execute("DELETE FROM po_lines;")
    cursor.execute("DELETE FROM po_headers;")
    cursor.execute("DELETE FROM inventory_hub;")

    seed_data = get_seed_data_definition()
    header = seed_data["po_header"]
    lines = seed_data["po_lines"]
    inventory = seed_data["inventory_items"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Insert PO Header
    cursor.execute("""
        INSERT INTO po_headers (
            po_number, supplier_name, supplier, store_id, status,
            order_date, expected_delivery_date, total_lines, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (
        header["po_number"],
        header["supplier_name"],
        header["supplier"],
        header["store_id"],
        header["status"],
        header["order_date"],
        header["expected_delivery_date"],
        header["total_lines"],
        header["created_at"],
        header["updated_at"]
    ))

    # 2. Insert exactly 14 PO Lines for PO-48213
    for line in lines:
        cursor.execute("""
            INSERT INTO po_lines (
                po_number, line_number, sku_code, sku, item_name, description,
                ordered_qty, received_qty, unit, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, ?, 'PENDING');
        """, (
            header["po_number"],
            line["line_number"],
            line["sku_code"],
            line["sku"],
            line["item_name"],
            line["description"],
            line["ordered_qty"],
            line["unit"]
        ))

    # 3. Insert inventory items (all 14 PO items + FIX-M8 which is NOT on PO)
    for item in inventory:
        cursor.execute("""
            INSERT OR REPLACE INTO inventory_hub (
                sku_code, sku, item_name, description, category,
                physical_on_hand, reserved_qty, committed_qty, atp_qty, quarantine_qty,
                unit, location, last_updated, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            item["sku_code"],
            item["sku"],
            item["item_name"],
            item["description"],
            item["category"],
            item["physical_on_hand"],
            item["reserved_qty"],
            item["committed_qty"],
            item["atp_qty"],
            item["quarantine_qty"],
            item["unit"],
            item["location"],
            now_iso,
            now_iso
        ))

    # 4. Insert baseline initialization audit log
    cursor.execute("""
        INSERT INTO audit_logs (
            timestamp, employee_id, store_id, po_number, sku_code, sku,
            action, quantity_change, reason_code, photo_evidence, details, notes
        ) VALUES (?, 'SYSTEM', 'DK-Aarhus-01', 'PO-48213', NULL, NULL, 'BASELINE_SEEDED', 0.0, 'SYSTEM_INIT', NULL, 'Baseline dataset seeded for Round 2 MVP.', 'Baseline dataset seeded for Round 2 MVP.');
    """, (now_iso,))

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "message": "Database successfully seeded with PO-48213 baseline.",
        "po_number": "PO-48213",
        "seeded_lines_count": len(lines),
        "inventory_count": len(inventory),
        "timestamp": now_iso
    }


def seed_initial_data_if_needed() -> bool:
    """Inserts initial seed data if PO-48213 is not already present in database."""
    res = seed_baseline_data(force_reset=False)
    return res["status"] == "success"


def reset_and_reseed_db() -> Dict[str, Any]:
    """
    Truncates all tables and re-seeds baseline state.
    Used by POST /api/v1/reset-demo for fresh video takes and automated testing.
    """
    return seed_baseline_data(force_reset=True)
