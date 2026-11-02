# NexBuild Cloud Hub - System Rules & Agent Guidelines (CLAUDE.md)

## 1. Competition Context & Strict MVP Scope
- **Team**: TBL Gang — Netcompany IT Consultant Challenge 2026 (Round 2: Build-a-thon).
- **Scope**: **Denmark Phase 1 MVP only** (Locally-running Responsive Web Application).
- **Core Workflow Pipeline**:
  `1. Scan (Delivery Note AI OCR)` ➔ `2. Match to PO (#48213)` ➔ `3. Confirm (Human-in-the-Loop Review + Photo Audit)` ➔ `4. Post to Hub (Update On-Hand & ATP in <15m + Offline SQLite Queue)` ➔ `5. Counter Read-Only ATP Lookup`
- **Out of Scope for MVP Code**: Do NOT build complex Norway Soft-Lock timers or Sweden TMS vehicle routing algorithms in code. Keep code strictly aligned with Round 1 Slide 4 & Slide 5.

---

## 2. The "PO #48213" Golden Scenario (Mandatory Baseline across Backend, Frontend & QA)
All seed data, backend fallback mocks, frontend demo buttons, and automated tests MUST support this exact scenario from Round 1 Slide 4:
- **PO Number**: `PO-48213` (Supplier: `Nordic BuildSupply DK`, 14 lines total).
- **Key Line Outcomes on Delivery Note Scan**:
  1. `CEM-25` (**Cement 25kg**): Ordered `80`, Received `80` ➔ `match_status: "OK"`, `confidence_score: 0.99`, `requires_review: false` (Green)
  2. `TIM-4595` (**Timber 45x95**): Ordered `40`, Received `40` ➔ `match_status: "OK"`, `confidence_score: 0.98`, `requires_review: false` (Green)
  3. `PLAST-01` (**Plasterboard**): Ordered `60`, Received `52` ➔ `match_status: "SHORT"`, `confidence_score: 0.96`, `requires_review: true` (Amber — requires `reason_code: "short_delivery"` & photo evidence)
  4. `FIX-M8` (**Fixings M8**): Ordered `0` (Not on PO), Received `12` ➔ `match_status: "UNKNOWN_SKU"`, `confidence_score: 0.68` (Low confidence!), `requires_review: true` (Red)
  *(Plus 10 additional standard construction SKUs where Ordered == Received so that "12 of 14 lines OK" holds true).*

---

## 3. Folder Ownership & Team Responsibilities (PREVENT MERGE CONFLICTS)
Adhere strictly to directory ownership boundaries. **Never create, modify, or delete files outside your assigned folder without explicit coordination:**

- **Gia** (`Team Leader & Backend Architect` — `/backend/` & `/deliverables_docs/System_Diagram_Content.md`):
  - FastAPI application, SQLite database (`nexbuild.db`), Gemini OCR pipeline + deterministic fallback, PO matching engine, mock Denmark ERP adapter, and System Context Diagram.
- **Hung** (`Frontend Engineer & Video Producer` — `/frontend/`):
  - Responsive Web UI: Mobile Warehouse Receiving Scanner (`index.html`), Store Counter Read-Only ATP Lookup (`counter.html`), offline `localStorage`/queue toggle, and `MVP.mp4` demo recording.
- **Dau** (`QA, Data & AI Governance Lead` — `/tests/`, `/seed_data/`, & `/deliverables_docs/`):
  - Automated `pytest` suite, sample delivery note image/PDF generator for `PO-48213`, `AI Journal.pdf`, `User Journey.pdf`, and English demo script.

---

## 4. Strict API Contract (`http://localhost:8000/api/v1`)
All JSON keys in requests and responses **must strictly use `snake_case`** (No `camelCase` or `kebab-case`).

### Exact Endpoints (Do NOT invent alternative URL paths):
1. **`GET /api/v1/health`**
   - Returns system status, ERP adapter status, and active OCR mode (`"live_gemini"` or `"deterministic_fallback"`).
2. **`GET /api/v1/po/{po_number}`**
   - Returns original PO header and line items (`po_number`, `supplier_name`, `status`, `lines`: `[{sku_code, item_name, ordered_qty}]`).
3. **`POST /api/v1/scan-delivery-note`**
   - Accepts multipart image upload (optional) + `po_number` (default `"PO-48213"`).
   - Returns summary (`po_number`, `total_lines`, `ok_lines`, `mismatch_lines`, `low_confidence_lines`) and `lines`:
     ```json
     {
       "sku_code": "PLAST-01",
       "item_name": "Plasterboard",
       "ordered_qty": 60,
       "received_qty": 52,
       "confidence_score": 0.96,
       "match_status": "SHORT",
       "requires_review": true
     }
     ```
4. **`POST /api/v1/confirm-receipt`**
   - Accepts: `po_number`, `employee_id` (e.g., `"emp_dk_104"`), `store_id` (e.g., `"DK-Aarhus-01"`), `idempotency_key` (unique string to prevent duplicate offline syncs), and confirmed `lines` (with `reason_code` and `photo_evidence` for mismatches).
   - Updates `physical_on_hand` and `atp_qty` in Hub DB, writes immutable record to `audit_logs`, and syncs to Mock Denmark ERP.
5. **`GET /api/v1/inventory/atp`**
   - Returns real-time inventory list: `[{sku_code, item_name, physical_on_hand, atp_qty, last_updated, trust_status}]` (`"GREEN"` if updated < 15 mins ago).
6. **`GET /api/v1/audit-logs`**
   - Returns immutable audit trail entries (`id`, `timestamp`, `employee_id`, `store_id`, `po_number`, `action`, `details`, `photo_evidence`).
7. **`POST /api/v1/reset-demo`**
   - Resets and re-seeds the SQLite database to the initial pre-scan baseline for clean demo video takes.

### HTTP Status Codes & Error Format:
- `200 OK` / `201 Created` / `400 Bad Request` / `404 Not Found` / `409 Conflict` (Idempotency duplicate) / `422 Unprocessable Entity` / `500 Internal Server Error`.
- Standard Error JSON:
  ```json
  {
    "status": "error",
    "error_code": "ERROR_CODE_STRING",
    "message": "Human readable error description",
    "details": {}
  }