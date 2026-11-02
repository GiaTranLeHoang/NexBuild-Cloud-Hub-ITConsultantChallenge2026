"""
NexBuild Cloud Hub - Database Layer & Seed Engine
SQLite implementation with automated schema creation, auto-seeding, and connection management.
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
            supplier TEXT NOT NULL,
            order_date TEXT NOT NULL,
            expected_delivery_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'OPEN',
            total_lines INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    """)

    # 2. Purchase Order Lines table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS po_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            po_number TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            sku TEXT NOT NULL,
            description TEXT NOT NULL,
            ordered_qty REAL NOT NULL,
            received_qty REAL NOT NULL DEFAULT 0.0,
            unit TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            FOREIGN KEY (po_number) REFERENCES po_headers (po_number) ON DELETE CASCADE
        );
    """)

    # 3. Inventory Hub table (Separates physical_on_hand, quarantine_qty, reserved_qty, and atp_qty)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventory_hub (
            sku TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            category TEXT,
            physical_on_hand REAL NOT NULL DEFAULT 0.0,
            quarantine_qty REAL NOT NULL DEFAULT 0.0,
            reserved_qty REAL NOT NULL DEFAULT 0.0,
            atp_qty REAL NOT NULL DEFAULT 0.0,
            unit TEXT NOT NULL,
            location TEXT,
            updated_at TEXT NOT NULL
        );
    """)

    # Safe migration: ensure quarantine_qty column exists if upgrading from v1.0
    try:
        cursor.execute("ALTER TABLE inventory_hub ADD COLUMN quarantine_qty REAL NOT NULL DEFAULT 0.0;")
    except sqlite3.OperationalError:
        pass  # Column already present

    # 4. Audit Logs table (tracks employee_id, reason_code, photo_evidence)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            employee_id TEXT NOT NULL,
            action TEXT NOT NULL,
            po_number TEXT,
            sku TEXT,
            quantity_change REAL,
            reason_code TEXT,
            photo_evidence TEXT,
            notes TEXT
        );
    """)

    # 5. Receipt Transactions table (Offline Idempotency protection)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS receipt_transactions (
            idempotency_key TEXT PRIMARY KEY,
            po_number TEXT NOT NULL,
            employee_id TEXT NOT NULL,
            store_id TEXT NOT NULL,
            processed_at TEXT NOT NULL,
            status TEXT NOT NULL,
            payload_summary TEXT,
            erp_sync_status TEXT,
            erp_transaction_id TEXT
        );
    """)

    conn.commit()
    conn.close()

    # Auto-seed initial dataset if PO-48213 is missing
    seed_initial_data_if_needed()


def get_seed_data_definition() -> Dict[str, Any]:
    """
    Returns the baseline data definition for PO-48213 and Denmark Hub inventory.
    Total 14 lines on PO matching Slide 4 mockup:
    - CEM-25 (Cement 25kg): Ordered 80, Initial On-Hand/ATP: 120
    - TIM-4595 (Timber 45x95): Ordered 40, Initial On-Hand/ATP: 85
    - PLAST-01 (Plasterboard): Ordered 60, Initial On-Hand/ATP: 30
    Plus remaining 11 building material lines (total 14).
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    po_header = {
        "po_number": "PO-48213",
        "supplier": "Nordic BuildSupply DK",
        "order_date": "2026-10-28",
        "expected_delivery_date": "2026-11-02",
        "status": "OPEN",
        "total_lines": 14,
        "created_at": now_iso,
        "updated_at": now_iso
    }

    # 14 lines for PO-48213
    po_lines = [
        {"line_number": 1, "sku": "CEM-25", "description": "Aalborg Portland Rapid Cement 25kg", "ordered_qty": 80.0, "unit": "BAG"},
        {"line_number": 2, "sku": "TIM-4595", "description": "C24 Structural Timber 45x95mm 4.2m", "ordered_qty": 40.0, "unit": "PCS"},
        {"line_number": 3, "sku": "PLAST-01", "description": "Gyproc Standard Plasterboard 13x1200x2400", "ordered_qty": 60.0, "unit": "SHEET"},
        {"line_number": 4, "sku": "INSUL-100", "description": "Rockwool Flexi Acoustic Insulation 100mm", "ordered_qty": 50.0, "unit": "PACK"},
        {"line_number": 5, "sku": "BRICK-RED", "description": "Danish Red Facing Bricks RT 475", "ordered_qty": 1200.0, "unit": "PCS"},
        {"line_number": 6, "sku": "SAND-04", "description": "Fine Grain Washed Sharp Sand 0-4mm 25kg", "ordered_qty": 100.0, "unit": "BAG"},
        {"line_number": 7, "sku": "GRAV-1020", "description": "Pea Shingle Drainage Gravel 10-20mm 25kg", "ordered_qty": 60.0, "unit": "BAG"},
        {"line_number": 8, "sku": "REBAR-12", "description": "High Yield Deformed Rebar Steel 12mm x 6m", "ordered_qty": 30.0, "unit": "PCS"},
        {"line_number": 9, "sku": "PLY-18", "description": "Nordic Structural Birch Plywood 18mm", "ordered_qty": 25.0, "unit": "SHEET"},
        {"line_number": 10, "sku": "SCREW-550", "description": "Spax Stainless Torx Wood Screws 5.0x50mm (200pk)", "ordered_qty": 35.0, "unit": "BOX"},
        {"line_number": 11, "sku": "ROOF-FELT", "description": "Icopal Top SBS Bitumen Roofing Felt 10m", "ordered_qty": 20.0, "unit": "ROLL"},
        {"line_number": 12, "sku": "MORTAR-MIX", "description": "Weber Premix Masonry Mortar M5 25kg", "ordered_qty": 75.0, "unit": "BAG"},
        {"line_number": 13, "sku": "PAINT-WHT", "description": "Nordsjö Professional Acryl Wall Paint 10L White", "ordered_qty": 30.0, "unit": "CAN"},
        {"line_number": 14, "sku": "SEAL-SIL", "description": "Dana Lim Sanitary Construction Silicone 310ml", "ordered_qty": 45.0, "unit": "TUBE"},
    ]

    # Inventory Baseline: separates physical_on_hand, quarantine_qty, reserved_qty, and atp_qty
    # Includes FIX-M8 (which is in inventory but NOT in PO-48213)
    inventory_items = [
        {"sku": "CEM-25", "description": "Aalborg Portland Rapid Cement 25kg", "category": "Heavy Building", "physical_on_hand": 120.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 120.0, "unit": "BAG", "location": "Aisle 1 - Bay A"},
        {"sku": "TIM-4595", "description": "C24 Structural Timber 45x95mm 4.2m", "category": "Timber & Joinery", "physical_on_hand": 85.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 85.0, "unit": "PCS", "location": "Yard Racks - Sec 3"},
        {"sku": "PLAST-01", "description": "Gyproc Standard Plasterboard 13x1200x2400", "category": "Drywall & Board", "physical_on_hand": 30.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 30.0, "unit": "SHEET", "location": "Aisle 2 - Drywall"},
        {"sku": "INSUL-100", "description": "Rockwool Flexi Acoustic Insulation 100mm", "category": "Insulation", "physical_on_hand": 45.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 45.0, "unit": "PACK", "location": "Aisle 3 - Insulation"},
        {"sku": "BRICK-RED", "description": "Danish Red Facing Bricks RT 475", "category": "Masonry", "physical_on_hand": 2500.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 2500.0, "unit": "PCS", "location": "Yard Pallet Zone 1"},
        {"sku": "SAND-04", "description": "Fine Grain Washed Sharp Sand 0-4mm 25kg", "category": "Aggregates", "physical_on_hand": 150.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 150.0, "unit": "BAG", "location": "Yard Aggregate Bay 2"},
        {"sku": "GRAV-1020", "description": "Pea Shingle Drainage Gravel 10-20mm 25kg", "category": "Aggregates", "physical_on_hand": 90.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 90.0, "unit": "BAG", "location": "Yard Aggregate Bay 4"},
        {"sku": "REBAR-12", "description": "High Yield Deformed Rebar Steel 12mm x 6m", "category": "Steel & Reinforcement", "physical_on_hand": 40.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 40.0, "unit": "PCS", "location": "Steel Yard Bay 1"},
        {"sku": "PLY-18", "description": "Nordic Structural Birch Plywood 18mm", "category": "Sheet Materials", "physical_on_hand": 35.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 35.0, "unit": "SHEET", "location": "Aisle 2 - Sheet Racks"},
        {"sku": "SCREW-550", "description": "Spax Stainless Torx Wood Screws 5.0x50mm (200pk)", "category": "Fixings & Fasteners", "physical_on_hand": 50.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 50.0, "unit": "BOX", "location": "Aisle 4 - Shelf 1B"},
        {"sku": "ROOF-FELT", "description": "Icopal Top SBS Bitumen Roofing Felt 10m", "category": "Roofing", "physical_on_hand": 15.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 15.0, "unit": "ROLL", "location": "Aisle 5 - Roofing"},
        {"sku": "MORTAR-MIX", "description": "Weber Premix Masonry Mortar M5 25kg", "category": "Heavy Building", "physical_on_hand": 110.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 110.0, "unit": "BAG", "location": "Aisle 1 - Bay C"},
        {"sku": "PAINT-WHT", "description": "Nordsjö Professional Acryl Wall Paint 10L White", "category": "Decorating & Chemicals", "physical_on_hand": 25.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 25.0, "unit": "CAN", "location": "Aisle 6 - Paint Depot"},
        {"sku": "SEAL-SIL", "description": "Dana Lim Sanitary Construction Silicone 310ml", "category": "Decorating & Chemicals", "physical_on_hand": 65.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 65.0, "unit": "TUBE", "location": "Aisle 6 - Sealants"},
        {"sku": "FIX-M8", "description": "Stainless Through-Bolt Heavy Duty Anchors M8x75mm", "category": "Fixings & Fasteners", "physical_on_hand": 10.0, "quarantine_qty": 0.0, "reserved_qty": 0.0, "atp_qty": 10.0, "unit": "BOX", "location": "Aisle 4 - Shelf 3A"}
    ]

    return {
        "po_header": po_header,
        "po_lines": po_lines,
        "inventory_items": inventory_items
    }


def seed_initial_data_if_needed() -> bool:
    """Inserts initial seed data if PO-48213 is not already present in database."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT 1 FROM po_headers WHERE po_number = ?", ("PO-48213",))
    row = cursor.fetchone()

    if row is not None:
        conn.close()
        return False  # Already seeded

    seed_data = get_seed_data_definition()
    header = seed_data["po_header"]
    lines = seed_data["po_lines"]
    inventory = seed_data["inventory_items"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Insert PO Header
    cursor.execute("""
        INSERT INTO po_headers (po_number, supplier, order_date, expected_delivery_date, status, total_lines, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """, (
        header["po_number"],
        header["supplier"],
        header["order_date"],
        header["expected_delivery_date"],
        header["status"],
        header["total_lines"],
        header["created_at"],
        header["updated_at"]
    ))

    # 2. Insert PO Lines
    for line in lines:
        cursor.execute("""
            INSERT INTO po_lines (po_number, line_number, sku, description, ordered_qty, received_qty, unit, status)
            VALUES (?, ?, ?, ?, ?, 0.0, ?, 'PENDING');
        """, (
            header["po_number"],
            line["line_number"],
            line["sku"],
            line["description"],
            line["ordered_qty"],
            line["unit"]
        ))

    # 3. Insert or update Inventory Items
    for item in inventory:
        cursor.execute("""
            INSERT OR REPLACE INTO inventory_hub (sku, description, category, physical_on_hand, quarantine_qty, reserved_qty, atp_qty, unit, location, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            item["sku"],
            item["description"],
            item["category"],
            item["physical_on_hand"],
            item.get("quarantine_qty", 0.0),
            item["reserved_qty"],
            item["atp_qty"],
            item["unit"],
            item["location"],
            now_iso
        ))

    # 4. Insert Initial Baseline Audit Log
    cursor.execute("""
        INSERT INTO audit_logs (timestamp, employee_id, action, po_number, sku, quantity_change, reason_code, photo_evidence, notes)
        VALUES (?, 'SYSTEM', 'INITIAL_SEED', 'PO-48213', NULL, 0, 'SYSTEM_INIT', NULL, 'Baseline seed data populated for Round 2 MVP demonstration.');
    """, (now_iso,))

    conn.commit()
    conn.close()
    return True


def reset_and_reseed_db() -> Dict[str, Any]:
    """
    Truncates all tables and re-seeds baseline state.
    Used by POST /api/v1/reset-demo for fresh video takes and automated testing.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Clean tables
    cursor.execute("DELETE FROM receipt_transactions;")
    cursor.execute("DELETE FROM audit_logs;")
    cursor.execute("DELETE FROM po_lines;")
    cursor.execute("DELETE FROM po_headers;")
    cursor.execute("DELETE FROM inventory_hub;")
    conn.commit()
    conn.close()

    # Seed fresh data
    seed_initial_data_if_needed()

    return {
        "status": "success",
        "message": "Database reset and re-seeded successfully with PO-48213 baseline.",
        "po_number": "PO-48213",
        "seeded_lines_count": 14,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
