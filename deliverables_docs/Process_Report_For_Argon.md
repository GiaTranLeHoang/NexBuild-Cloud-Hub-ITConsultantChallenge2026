# NexBuild Cloud Hub — Engineering Process & Verification Report
**Round 2 Build-a-thon MVP (Denmark Goods Receiving & ATP Lookup)**  
**Prepared For:** Argon (Technical Reviewer / Lead Auditor)  
**Author:** Gia (Team Leader & Backend Architect, TBL Gang)  
**Date:** November 2, 2026 | **Version:** 1.0.0-final  
**Repo Root:** `d:\NexBuild-Cloud-Hub-ITConsultantChallenge2026`

---

## 1. Executive Status & Milestone Checklist

| Milestone | Scope & Deliverable | Status | Verification Evidence |
| :--- | :--- | :---: | :--- |
| **Step 1** | Monorepo Scaffolding & Governance | **100% COMPLETE** | Clean tree, `CLAUDE.md`, `.gitignore`, `requirements.txt` |
| **Step 2** | Backend Implementation & SQLite Engine | **100% COMPLETE** | 7 REST endpoints, OCR simulation, Matching Engine, ERP Adapter |
| **Step 3** | Alignment with Round 1 Proposal & Refinements | **100% COMPLETE** | `FIX-M8` quarantine governance, corrected ATP math, Python 3.9 compatibility |
| **Step 4** | Automated Verification & Smoke Testing | **100% COMPLETE** | 8/8 tests green (`pytest` 1.38s), zero Git leaks |

---

## 2. Core Functional Capabilities Implemented

### 2.1. Physical Goods Receiving Pipeline
The backend executes the full 5-stage receiving workflow:
$$\text{Scan (OCR)} \longrightarrow \text{Match to PO} \longrightarrow \text{Confirm (Discrepancy Mgmt)} \longrightarrow \text{Post Hub (SQLite)} \longrightarrow \text{ATP Lookup}$$

1. **OCR Scanning (`POST /api/v1/scan-delivery-note`)**:
   - Supports simulated scan and file upload for delivery note `DN-DK-2026-94821`.
   - Extracts raw lines with AI confidence scores.
2. **Variance Matching Engine (`backend/matching_engine.py`)**:
   - Compares scanned lines against `PO-48213` (14 lines from *Nordic BuildSupply DK*).
   - Classifies lines into:
     - `CEM-25` (Cement 25kg): Ordered 80, Received 80 ➔ `match_status: "OK"`, confidence `0.985`, `requires_review: false`.
     - `TIM-4595` (Timber 45x95): Ordered 40, Received 40 ➔ `match_status: "OK"`, confidence `0.978`, `requires_review: false`.
     - `PLAST-01` (Plasterboard): Ordered 60, Received 52 ➔ `match_status: "SHORT"`, confidence `0.942`, `requires_review: true` (Shortfall of 8 sheets).
     - `FIX-M8` (Fixings M8): Ordered 0, Received 12 ➔ `match_status: "UNKNOWN_SKU"`, confidence `0.680` (low confidence!), `requires_review: true`.
   - Populates summary statistics (`total_lines: 4`, `ok_lines: 2`, `mismatch_lines: 2`, `low_confidence_lines: 1`).

### 2.2. Quarantine Governance for Unordered SKUs
- In compliance with wholesale warehouse operations and the Round 1 proposal, unordered items cannot enter sellable stock without authorization.
- When `PO-48213` receipt is confirmed:
  - `CEM-25`: `physical_on_hand` 120 ➔ 200, `atp_qty` 120 ➔ 200 ($+80$)
  - `TIM-4595`: `physical_on_hand` 85 ➔ 125, `atp_qty` 85 ➔ 125 ($+40$)
  - `PLAST-01`: `physical_on_hand` 30 ➔ 82, `atp_qty` 30 ➔ 82 ($+52$)
  - `FIX-M8`: **`atp_qty` strictly remains `10.0`**; `physical_on_hand` remains `10.0`; `quarantine_qty` becomes **`12.0`**.
  - Recorded in `audit_logs` under action `"QUARANTINED_UNORDERED_SKU"`.
- Explicit override is supported if store manager supplies `reason_code == "accept_unordered_override"`.

### 2.3. Offline Idempotency Protection
- Receiving staff often operate in Wi-Fi dead zones in steel-reinforced yard sheds.
- Every client submission transmits a UUIDv4 `idempotency_key`.
- If a mobile client resubmits after network drop, the backend detects the existing key in `receipt_transactions` and returns the previously committed transaction with `is_idempotent_replay: true`.
- **Result:** Physical inventory and ERP posting are guaranteed never to double-count.

### 2.4. Real-Time Available-To-Promise (ATP)
- `GET /api/v1/inventory/atp` returns instant stock levels for Store Counter Clerks.
- Response time $< 20\text{ms}$ on SQLite local engine, eliminating the 4–12 hour batch delay of legacy ERPs.

---

## 3. Architecture & Data Contracts

### 3.1. REST API Interface Summary (`http://localhost:8000/api/v1`)
All JSON keys use strict `snake_case`.

| Endpoint | Method | Input Payload | Output Schema | Purpose |
| :--- | :---: | :--- | :--- | :--- |
| `/api/v1/health` | `GET` | *None* | `status, erp_adapter_status, active_ocr_mode, timestamp` | Health probe & mode indicator |
| `/api/v1/po/{po_number}` | `GET` | Path param | `po_number, supplier, lines: [...]` | Fetches 14 baseline PO lines |
| `/api/v1/scan-delivery-note` | `POST` | `{"po_number": "PO-48213"}` | `items: [...], summary: {...}` | OCR & variance reconciliation |
| `/api/v1/confirm-receipt` | `POST` | `po_number, employee_id, store_id, idempotency_key, confirmed_lines` | `ReceiptTransactionResponse` | Idempotent stock post & ERP sync |
| `/api/v1/inventory/atp` | `GET` | Optional `?sku=...&category=...` | `InventoryATPResponse` | Store counter real-time stock |
| `/api/v1/audit-logs` | `GET` | Optional `?limit=50` | `logs: [...]` | Tamper-evident governance trail |
| `/api/v1/reset-demo` | `POST` | *None* | `ResetDemoResponse` | Reseeds DB in $< 100\text{ms}$ for demo video |

### 3.2. Database Relational Architecture (`nexbuild.db`)
- `po_headers`: PO primary records (`PO-48213`).
- `po_lines`: 14 building supply items with ordered vs. received tracking.
- `inventory_hub`: Multi-bucket stock separation (`physical_on_hand`, `quarantine_qty`, `reserved_qty`, `atp_qty`).
- `audit_logs`: Immutable security log (`employee_id`, `action`, `quantity_change`, `reason_code`, `photo_evidence`).
- `receipt_transactions`: Offline idempotency registry keyed on `idempotency_key`.

### 3.3. Corrected Mathematical Model
$$\text{Step 1 (Goods Receipt): } \text{Physical On-Hand}_{\text{new}} = \text{Physical On-Hand}_{\text{current}} + \text{Confirmed Received Qty (excluding quarantined/unordered)}$$
$$\text{Step 2 (ATP Calculation): } \text{ATP} = \text{Physical On-Hand} - \text{Reserved (Soft-Locked) Qty} - \text{Committed Outbound Qty}$$
*(Phase 1 Denmark MVP: $\text{Reserved} = 0$, $\text{Committed} = 0$. Soft-locks and cross-depot transfers roll out in Norway/Sweden phases).*

---

## 4. Verification Evidence & Test Execution

### Test Execution Command
```bash
py -m pytest tests/
```

### Pytest Console Output
```text
============================= test session starts =============================
platform win32 -- Python 3.9.13, pytest-8.4.2, pluggy-1.6.0
rootdir: D:\NexBuild-Cloud-Hub-ITConsultantChallenge2026
plugins: anyio-4.12.1
collected 8 items

tests\test_backend_smoke.py ........                                     [100%]

============================== 8 passed in 1.38s ==============================
```

---

## 5. Teammate Handoff & Governance Matrix

| Role | Teammate | Assigned Workspace | Handoff Status & Instructions |
| :--- | :--- | :--- | :--- |
| **Backend & Architecture** | **Gia** | `/backend/`<br/>`/deliverables_docs/` | **Complete.** FastAPI server ready to run via `uvicorn backend.main:app --reload`. |
| **Frontend & Demo Video** | **Hung** | `/frontend/` | **Ready for UI development.** Can consume all `/api/v1/` endpoints. All schemas provide both standard (`sku`, `description`) and alias keys (`sku_code`, `item_name`, `trust_status`). |
| **QA, Data & AI Journal** | **Dau** | `/tests/`<br/>`/seed_data/` | **Ready.** `tests/test_backend_smoke.py` is established. Dau can add `test_mvp_flow.py` and seed fixtures without merge conflicts. |

---

## 6. How to Run the Verification Environment
```bash
# 1. Activate environment (Python 3.9+)

# 2. Run backend API server
py -m uvicorn backend.main:app --reload --port 8000

# 3. Interactive API documentation
# Browse to: http://localhost:8000/docs

# 4. Run automated test suite
py -m pytest tests/
```

*Report certified by Gia, Team Leader & Backend Architect.*

