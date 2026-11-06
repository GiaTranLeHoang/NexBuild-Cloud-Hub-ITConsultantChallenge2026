# NexBuild Cloud Hub — Engineering Process & Integration Report
**Round 2 Build-a-thon MVP (Denmark Goods Receiving & Real-Time ATP Lookup)**  
**Prepared For:** Argon (Technical Reviewer & Lead Auditor)  
**Author:** Gia (Team Leader & Backend Architect, TBL Gang)  
**Date:** November 6, 2026 | **Version:** 2.0.0-integrated  
**Repo Root:** `d:\NexBuild-Cloud-Hub-ITConsultantChallenge2026`  
**Git Commit:** `8503221` (Synchronized with `origin/main`)

---

## 1. Executive Status & Milestone Progress

| Milestone | Scope & Deliverable | Owner | Status | Verification Evidence |
| :--- | :--- | :---: | :---: | :--- |
| **Milestone 1** | Monorepo Scaffolding & Shared Rules | Gia | **100% COMPLETE** | Monorepo tree, `CLAUDE.md`, `.gitignore`, `.env.example`, `requirements.txt` |
| **Milestone 2** | Backend REST API & 5 SQLite Tables | Gia | **100% COMPLETE** | 7 REST endpoints (`/api/v1/*`), SQLite schema with 5 tables, deterministic seeding |
| **Milestone 3** | AI OCR & Discrepancy Matching Engine | Gia | **100% COMPLETE** | 14-line OCR extraction, automated variance classification (`SHORT`, `UNKNOWN_SKU` @ 0.68) |
| **Milestone 4** | Quarantine Governance & Offline Idempotency | Gia | **100% COMPLETE** | `FIX-M8` isolated in `quarantine_qty` & `GL-DK-9900`; UUIDv4 idempotency guard prevents double-counting |
| **Milestone 5** | C4 System Context & Container Deliverables | Gia | **100% COMPLETE** | `deliverables_docs/System_Diagram_Content.md` (C4 L1 & L2 diagrams, 2-page PDF compliant) |
| **Milestone 6** | Frontend Web Apps & Cross-Tab Synchronization | Hung | **100% COMPLETE** | `frontend/index.html` (Scanner UI), `frontend/counter.html` (Counter UI), `api_client.js`, `i18n.js` |
| **Milestone 7** | Automated Regression Suite & Benchmarks | Dau / Gia | **100% COMPLETE** | 8/8 smoke tests green (`pytest` 1.87s), demo reset latency avg 15.8ms (`< 100ms` SLA) |

---

## 2. Full-Stack Architecture & Data Flow

The solution implements the complete 5-stage receiving pipeline:
$$\text{Scan (OCR)} \longrightarrow \text{Match to PO} \longrightarrow \text{Confirm (Discrepancy Mgmt)} \longrightarrow \text{Post Hub (SQLite)} \longrightarrow \text{ATP Lookup}$$

```
[ Warehouse Mobile Scanner (index.html) ]
                   │
                   ▼  POST /api/v1/scan-delivery-note (simulated or upload)
[ AI OCR Service (ai_ocr_service.py) ]
                   │  14 scanned lines extracted (CEM-25, TIM-4595, PLAST-01: 52, FIX-M8: 12)
                   ▼
[ PO Matching Engine (matching_engine.py) ]
                   │  Reconciles against PO-48213 lines
                   │  CEM-25: OK (0.98), PLAST-01: SHORT (0.96), FIX-M8: UNKNOWN_SKU (0.68)
                   ▼
[ Mobile Operator Review & Confirmation ]
                   │
                   ▼  POST /api/v1/confirm-receipt (idempotency_key, confirmed_lines)
[ Idempotency Guard (main.py) ]
  ├── Key Exists ──► Replay cached response (is_idempotent_replay: true, 0 duplicate stock)
  └── New Key ─────► Atomic Transaction:
                       1. Quarantine Gate: FIX-M8 -> quarantine_qty (+12.0), ATP unchanged
                       2. Inbound Post: CEM-25, TIM-4595, PLAST-01 -> physical & ATP updated
                       3. Audit Log: Immutable entry with employee_id, action, reason_code
                       4. Mock Denmark ERP: Voucher DK-ERP-GR-2026-* (GL-DK-2100 & GL-DK-9900)
                       5. Seal Transaction: Record in receipt_transactions
                   │
                   ▼  Real-time BroadcastChannel sync (< 100ms)
[ Store Counter Portal (counter.html) ] ◄── GET /api/v1/inventory/atp (trust_status: GREEN)
```

---

## 3. Core Functional Modules & Implementation Verification

### 3.1. Backend Service Layer (`/backend/`)
- **`database.py`**: Initializes SQLite database `nexbuild.db` with WAL mode and PRAGMA foreign keys. Implements all 5 tables:
  1. `po_headers`: PO numbers, supplier names, store ID, status.
  2. `po_lines`: Ordered and received tracking for all 14 baseline SKUs.
  3. `inventory_hub`: Multi-bucket stock separation (`physical_on_hand`, `quarantine_qty`, `reserved_qty`, `committed_qty`, `atp_qty`).
  4. `receipt_transactions`: Idempotency registry preventing duplicate writes.
  5. `audit_logs`: Tamper-evident ledger logging badge ID, action, reason codes, photo evidence.
- **`schemas.py`**: Pydantic v2 models with bidirectional aliasing (`sku` ⇄ `sku_code`, `description` ⇄ `item_name`) ensuring seamless backward and forward compatibility.
- **`ai_ocr_service.py`**: Deterministic 14-line delivery note extraction (`DN-DK-2026-94821`) matching Slide 4 mockup with intentional discrepancy injection (`PLAST-01` short delivery, `FIX-M8` unordered goods).
- **`matching_engine.py`**: Reconciles physical counts against `PO-48213`, assigning standard confidence thresholds (`OK: 0.98`, `SHORT: 0.96`, `OVER: 0.95`, `UNKNOWN_SKU: 0.68`).
- **`mock_erp_adapter.py`**: Emulates OData v4 subledger posting to the Assumed Denmark Legacy ERP (Dynamics 365), generating voucher `DK-ERP-GR-2026-*` with split GL accounts (`GL-DK-2100` for sellable inventory, `GL-DK-9900` for quarantined items).
- **`main.py`**: High-performance FastAPI application exposing 7 REST endpoints with full CORS support.

### 3.2. Frontend Application Layer (`/frontend/`)
- **`index.html` & `js/scanner_app.js` (Warehouse Goods Receiving Scanner)**:
  - Mobile-first, responsive handheld scanner UI with industrial dark-theme aesthetics.
  - Optical simulation with laser sweep animation.
  - Line-by-line review showing clear badge indicators for `OK` (green), `SHORT` (amber), and `UNKNOWN_SKU` (red).
  - Built-in photo evidence attachment simulation and reason code selection.
- **`counter.html` & `js/counter_app.js` (Store Counter ATP Portal)**:
  - Desktop-optimized real-time inventory query portal for B2B contractor sales.
  - Instant reactive table updates with pulse/flash animations upon receipt confirmation.
  - Real-time `trust_status` visual indicators (🟢 GREEN for `< 15 min` freshness).
  - Search and category filters (Building Materials, Timber, Plasterboard, Fasteners).
- **`js/api_client.js`**:
  - Unified client supporting **Live API** (`http://localhost:8000/api/v1`) and **Offline Mock** mode with auto-fallback.
  - Cross-tab reactive synchronization using HTML5 `BroadcastChannel` and `localStorage`.
- **`js/i18n.js`**:
  - Full internationalization support with one-click toggling between **English (EN)** and **Danish (DK)**.
- **`js/fx.js`**:
  - Industrial audio feedback (barcode beep, confirmation chime, error buzz) and haptic feedback.

---

## 4. Key Engineering Decisions & Governance Verification

### 4.1. Quarantine Governance for Unordered SKUs (`FIX-M8`)
- **Operational Rule:** Goods not listed on `PO-48213` cannot enter sellable ATP without supervisor approval.
- **Verified State Transition:**
  - Before confirmation: `physical_on_hand: 10.0`, `atp_qty: 10.0`, `quarantine_qty: 0.0`.
  - After confirmation: `physical_on_hand: 10.0` (unchanged), `atp_qty: 10.0` (unchanged), `quarantine_qty: 12.0` ($+12$).
  - Audit trail: Action logged as `"QUARANTINED_UNORDERED_SKU"`.

### 4.2. Offline Idempotency Protection
- Every submission carries a unique `idempotency_key`.
- Replaying the exact same confirmation payload returns `is_idempotent_replay: true` with cached transaction details without re-incrementing stock.

### 4.3. Mathematical ATP Model (Two-Step State Derivation)
$$\text{Step 1 (Receipt Posting): } \text{Physical On-Hand}_{\text{new}} = \text{Physical On-Hand}_{\text{current}} + \text{Confirmed Received Qty (excluding quarantine)}$$
$$\text{Step 2 (ATP Calculation): } \text{ATP} = \text{Physical On-Hand} - \text{Reserved Qty} - \text{Committed Outbound Qty}$$
*(Denmark Phase 1 MVP: $\text{Reserved} = 0$, $\text{Committed} = 0$, thus $\text{ATP} = \text{Physical On-Hand}$).*

---

## 5. Verification Evidence & Performance Metrics

### 5.1. Automated Test Suite Execution
```text
tests\test_backend_smoke.py ........                                     [100%]
============================== 8 passed in 1.87s ==============================
```
1. `test_health_check` — PASS
2. `test_get_po_48213_details` — PASS
3. `test_get_nonexistent_po` — PASS
4. `test_scan_delivery_note_matching_engine` — PASS
5. `test_confirm_receipt_quarantine_governance_and_atp_update` — PASS
6. `test_confirm_receipt_explicit_override_allows_atp` — PASS
7. `test_idempotent_receipt_replay` — PASS
8. `test_reset_demo_endpoint` — PASS

### 5.2. Latency Benchmarks
- **Demo State Reset (`POST /api/v1/reset-demo`)**:
  - Average latency: **15.80 ms** (Target: `< 100 ms` SLA — **6.3x faster than required**).
  - Maximum latency: **41.08 ms**.
- **Real-Time ATP Query (`GET /api/v1/inventory/atp`)**:
  - Response time: **< 10 ms** (Local SQLite in WAL mode).

### 5.3. Security & Repository Hygiene
- **Leaked Secret Scan**: 0 API keys, passwords, or secrets detected.
- **Tracked Artifacts**: No `.env`, `.db`, `*.sqlite`, or cache folders tracked by Git.
- **Mermaid Encoding**: Clean UTF-8 without non-breaking spaces (`\u00a0`).

---

## 6. Team Ownership & Responsibilities

| Team Member | Role | Completed Tasks & Next Steps |
| :--- | :--- | :--- |
| **Gia** | Team Leader & Backend Architect | **Completed:** Full backend, database, C4 architecture documentation, integration management.<br/>**Next:** Coordinate rehearsal and oversee final packaging. |
| **Hung** | Frontend Lead & UX Engineer | **Completed:** Mobile Goods In Scanner UI, Store Counter ATP Portal, dual-language i18n, cross-tab sync.<br/>**Next:** Screen-record the 3-minute demo video following the standard scenario. |
| **Dau** | QA Lead & Presentation Specialist | **Completed:** Smoke test verification, seed fixtures.<br/>**Next:** Compile AI Interaction Journal (`deliverables_docs/AI_Interaction_Journal.md`) and slide deck. |

---

## 7. How to Run & Demonstrate the Full System

```powershell
# Step 1: Start Backend API Server (Port 8000)
py -m uvicorn backend.main:app --reload --port 8000

# Step 2: Open Frontend Applications in Browser
# Tab 1 (Handheld Scanner): file:///d:/NexBuild-Cloud-Hub-ITConsultantChallenge2026/frontend/index.html
# Tab 2 (Store Counter):    file:///d:/NexBuild-Cloud-Hub-ITConsultantChallenge2026/frontend/counter.html

# Step 3: Run Automated Regression Tests
py -m pytest -v
```

*Certified by Gia (Team Leader & Backend Architect) · Team TBL Gang.*
