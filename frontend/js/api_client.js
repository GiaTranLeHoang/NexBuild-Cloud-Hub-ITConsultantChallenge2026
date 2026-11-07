/**
 * NexBuild Cloud Hub - API Client
 * Denmark Phase 1 MVP (Frontend)
 *
 * Adheres strictly to CLAUDE.md Section 4 and backend API contracts.
 * Features:
 * - Base URL: http://localhost:8000/api/v1
 * - Snake_case keys in all payloads & responses
 * - Modes: "mock" (default) | "live" (persisted in localStorage)
 * - Auto-fallback to mock if live fetch fails
 * - Cross-tab reactive synchronization via BroadcastChannel & localStorage
 * - Idempotency handling matching backend/main.py (returns is_idempotent_replay: true, 200 OK)
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Api = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const BASE_URL = "http://localhost:8000/api/v1";
  const STORAGE_KEY_MODE = "nexbuild_mode";
  const STORAGE_KEY_STATE = "nexbuild_mock_state";
  const CHANNEL_NAME = "nexbuild_hub";

  // Cross-tab broadcast channel
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
  const stateListeners = new Set();

  function notifyStateChange() {
    stateListeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error("[Api] state listener error:", err);
      }
    });
  }

  if (channel) {
    channel.onmessage = (event) => {
      if (event.data && event.data.type === "state_change") {
        notifyStateChange();
      }
    };
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY_STATE) {
        notifyStateChange();
      }
    });

    // Auto-refresh when tab regains focus or visibility after background throttling
    window.addEventListener("focus", () => {
      notifyStateChange();
    });
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          notifyStateChange();
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // Baseline Seed Data for Mock Mode
  // Matching Golden Scenario (CLAUDE.md Sec. 2 & backend/database.py)
  // -------------------------------------------------------------------------

  function createInitialMockState() {
    const nowIso = new Date().toISOString();

    const poHeader = {
      po_number: "PO-48213",
      supplier_name: "Nordic BuildSupply DK",
      store_id: "DK-Aarhus-01",
      status: "OPEN",
      total_lines: 14,
      created_at: nowIso,
      order_date: "2026-10-28",
      expected_delivery_date: "2026-11-02",
      lines: [
        { id: 1, po_number: "PO-48213", line_number: 1, sku_code: "CEM-25", item_name: "Aalborg Portland Rapid Cement 25kg", ordered_qty: 80.0, received_qty: 0.0, unit: "bags", status: "PENDING" },
        { id: 2, po_number: "PO-48213", line_number: 2, sku_code: "TIM-4595", item_name: "C24 Structural Timber 45x95mm 4.2m", ordered_qty: 40.0, received_qty: 0.0, unit: "pcs", status: "PENDING" },
        { id: 3, po_number: "PO-48213", line_number: 3, sku_code: "PLAST-01", item_name: "Gyproc Standard Plasterboard 13x1200x2400", ordered_qty: 60.0, received_qty: 0.0, unit: "sheets", status: "PENDING" },
        { id: 4, po_number: "PO-48213", line_number: 4, sku_code: "INSUL-100", item_name: "Rockwool Flexi Acoustic Insulation 100mm", ordered_qty: 50.0, received_qty: 0.0, unit: "packs", status: "PENDING" },
        { id: 5, po_number: "PO-48213", line_number: 5, sku_code: "BRICK-RED", item_name: "Danish Red Facing Bricks RT 475", ordered_qty: 1200.0, received_qty: 0.0, unit: "pcs", status: "PENDING" },
        { id: 6, po_number: "PO-48213", line_number: 6, sku_code: "SAND-04", item_name: "Fine Grain Washed Sharp Sand 0-4mm 25kg", ordered_qty: 100.0, received_qty: 0.0, unit: "bags", status: "PENDING" },
        { id: 7, po_number: "PO-48213", line_number: 7, sku_code: "GRAV-1020", item_name: "Pea Shingle Drainage Gravel 10-20mm 25kg", ordered_qty: 60.0, received_qty: 0.0, unit: "bags", status: "PENDING" },
        { id: 8, po_number: "PO-48213", line_number: 8, sku_code: "REBAR-12", item_name: "High Yield Deformed Rebar Steel 12mm x 6m", ordered_qty: 30.0, received_qty: 0.0, unit: "pcs", status: "PENDING" },
        { id: 9, po_number: "PO-48213", line_number: 9, sku_code: "PLY-18", item_name: "Nordic Structural Birch Plywood 18mm", ordered_qty: 25.0, received_qty: 0.0, unit: "sheets", status: "PENDING" },
        { id: 10, po_number: "PO-48213", line_number: 10, sku_code: "SCREW-550", item_name: "Spax Stainless Torx Wood Screws 5.0x50mm (200pk)", ordered_qty: 35.0, received_qty: 0.0, unit: "boxes", status: "PENDING" },
        { id: 11, po_number: "PO-48213", line_number: 11, sku_code: "ROOF-FELT", item_name: "Icopal Top SBS Bitumen Roofing Felt 10m", ordered_qty: 20.0, received_qty: 0.0, unit: "rolls", status: "PENDING" },
        { id: 12, po_number: "PO-48213", line_number: 12, sku_code: "MORTAR-MIX", item_name: "Weber Premix Masonry Mortar M5 25kg", ordered_qty: 75.0, received_qty: 0.0, unit: "bags", status: "PENDING" },
        { id: 13, po_number: "PO-48213", line_number: 13, sku_code: "PAINT-WHT", item_name: "Nordsjö Professional Acryl Wall Paint 10L White", ordered_qty: 30.0, received_qty: 0.0, unit: "cans", status: "PENDING" },
        { id: 14, po_number: "PO-48213", line_number: 14, sku_code: "SEAL-SIL", item_name: "Dana Lim Sanitary Construction Silicone 310ml", ordered_qty: 45.0, received_qty: 0.0, unit: "tubes", status: "PENDING" },
      ],
    };

    const inventory = [
      { sku_code: "CEM-25", item_name: "Aalborg Portland Rapid Cement 25kg", category: "Heavy Building", physical_on_hand: 120.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 120.0, quarantine_qty: 0.0, unit: "bags", location: "Aisle 1 - Bay A", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "TIM-4595", item_name: "C24 Structural Timber 45x95mm 4.2m", category: "Timber & Joinery", physical_on_hand: 85.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 85.0, quarantine_qty: 0.0, unit: "pcs", location: "Yard Racks - Sec 3", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "PLAST-01", item_name: "Gyproc Standard Plasterboard 13x1200x2400", category: "Drywall & Board", physical_on_hand: 30.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 30.0, quarantine_qty: 0.0, unit: "sheets", location: "Aisle 2 - Drywall", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "INSUL-100", item_name: "Rockwool Flexi Acoustic Insulation 100mm", category: "Insulation", physical_on_hand: 45.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 45.0, quarantine_qty: 0.0, unit: "packs", location: "Aisle 3 - Insulation", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "BRICK-RED", item_name: "Danish Red Facing Bricks RT 475", category: "Masonry", physical_on_hand: 2500.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 2500.0, quarantine_qty: 0.0, unit: "pcs", location: "Yard Pallet Zone 1", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "SAND-04", item_name: "Fine Grain Washed Sharp Sand 0-4mm 25kg", category: "Aggregates", physical_on_hand: 150.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 150.0, quarantine_qty: 0.0, unit: "bags", location: "Yard Aggregate Bay 2", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "GRAV-1020", item_name: "Pea Shingle Drainage Gravel 10-20mm 25kg", category: "Aggregates", physical_on_hand: 90.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 90.0, quarantine_qty: 0.0, unit: "bags", location: "Yard Aggregate Bay 4", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "REBAR-12", item_name: "High Yield Deformed Rebar Steel 12mm x 6m", category: "Steel & Reinforcement", physical_on_hand: 40.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 40.0, quarantine_qty: 0.0, unit: "pcs", location: "Steel Yard Bay 1", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "PLY-18", item_name: "Nordic Structural Birch Plywood 18mm", category: "Sheet Materials", physical_on_hand: 35.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 35.0, quarantine_qty: 0.0, unit: "sheets", location: "Aisle 2 - Sheet Racks", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "SCREW-550", item_name: "Spax Stainless Torx Wood Screws 5.0x50mm (200pk)", category: "Fixings & Fasteners", physical_on_hand: 50.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 50.0, quarantine_qty: 0.0, unit: "boxes", location: "Aisle 4 - Shelf 1B", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "ROOF-FELT", item_name: "Icopal Top SBS Bitumen Roofing Felt 10m", category: "Roofing", physical_on_hand: 15.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 15.0, quarantine_qty: 0.0, unit: "rolls", location: "Aisle 5 - Roofing", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "MORTAR-MIX", item_name: "Weber Premix Masonry Mortar M5 25kg", category: "Heavy Building", physical_on_hand: 110.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 110.0, quarantine_qty: 0.0, unit: "bags", location: "Aisle 1 - Bay C", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "PAINT-WHT", item_name: "Nordsjö Professional Acryl Wall Paint 10L White", category: "Decorating & Chemicals", physical_on_hand: 25.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 25.0, quarantine_qty: 0.0, unit: "cans", location: "Aisle 6 - Paint Depot", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "SEAL-SIL", item_name: "Dana Lim Sanitary Construction Silicone 310ml", category: "Decorating & Chemicals", physical_on_hand: 65.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 65.0, quarantine_qty: 0.0, unit: "tubes", location: "Aisle 6 - Sealants", last_updated: nowIso, trust_status: "GREEN" },
      { sku_code: "FIX-M8", item_name: "Stainless Through-Bolt Heavy Duty Anchors M8x75mm", category: "Fixings & Fasteners", physical_on_hand: 10.0, reserved_qty: 0.0, committed_qty: 0.0, atp_qty: 10.0, quarantine_qty: 0.0, unit: "boxes", location: "Aisle 4 - Shelf 3A", last_updated: nowIso, trust_status: "GREEN" },
    ];

    return {
      po: poHeader,
      inventory: inventory,
      transactions: {},
      audit_logs: [],
      next_audit_id: 1,
    };
  }

  function getMockState() {
    try {
      const serialized = localStorage.getItem(STORAGE_KEY_STATE);
      if (serialized) {
        return JSON.parse(serialized);
      }
    } catch (err) {
      console.warn("[Api] failed to parse mock state from localStorage, initializing fresh state.", err);
    }
    const fresh = createInitialMockState();
    saveMockState(fresh);
    return fresh;
  }

  function saveMockState(state) {
    try {
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
      if (channel) {
        channel.postMessage({ type: "state_change" });
      }
      notifyStateChange();
    } catch (err) {
      console.error("[Api] failed to save mock state to localStorage:", err);
    }
  }

  // -------------------------------------------------------------------------
  // Golden Scenario Scanned Delivery Note Generator
  // 14 lines total: 12 OK, 1 SHORT (PLAST-01), 1 UNKNOWN_SKU (FIX-M8, conf 0.68)
  // -------------------------------------------------------------------------

  function getGoldenScenarioScannedLines() {
    return [
      {
        line_number: 1,
        sku_code: "CEM-25",
        item_name: "Aalborg Portland Rapid Cement 25kg",
        ordered_qty: 80.0,
        received_qty: 80.0,
        unit: "bags",
        confidence_score: 0.99,
        match_status: "OK",
        requires_review: false,
        discrepancy_reason: null,
      },
      {
        line_number: 2,
        sku_code: "TIM-4595",
        item_name: "C24 Structural Timber 45x95mm 4.2m",
        ordered_qty: 40.0,
        received_qty: 40.0,
        unit: "pcs",
        confidence_score: 0.98,
        match_status: "OK",
        requires_review: false,
        discrepancy_reason: null,
      },
      {
        line_number: 3,
        sku_code: "PLAST-01",
        item_name: "Gyproc Standard Plasterboard 13x1200x2400",
        ordered_qty: 60.0,
        received_qty: 52.0,
        unit: "sheets",
        confidence_score: 0.96,
        match_status: "SHORT",
        requires_review: true,
        discrepancy_reason: "Short shipment: Received 52 sheets (Ordered 60 sheets, deficit -8)",
      },
      {
        line_number: null,
        sku_code: "FIX-M8",
        item_name: "Stainless Through-Bolt Heavy Duty Anchors M8x75mm",
        ordered_qty: 0.0,
        received_qty: 12.0,
        unit: "boxes",
        confidence_score: 0.68,
        match_status: "UNKNOWN_SKU",
        requires_review: true,
        discrepancy_reason: "Unordered SKU: 'FIX-M8' is not present on PO PO-48213. Received 12 boxes. Quarantine pending manager approval.",
      },
      // 10 standard full-match lines (total 14 lines, 12 OK)
      { line_number: 4, sku_code: "INSUL-100", item_name: "Rockwool Flexi Acoustic Insulation 100mm", ordered_qty: 50.0, received_qty: 50.0, unit: "packs", confidence_score: 0.98, match_status: "OK", requires_review: false, discrepancy_reason: null },
      { line_number: 5, sku_code: "BRICK-RED", item_name: "Danish Red Facing Bricks RT 475", ordered_qty: 1200.0, received_qty: 1200.0, unit: "pcs", confidence_score: 0.98, match_status: "OK", requires_review: false, discrepancy_reason: null },
      { line_number: 6, sku_code: "SAND-04", item_name: "Fine Grain Washed Sharp Sand 0-4mm 25kg", ordered_qty: 100.0, received_qty: 100.0, unit: "bags", confidence_score: 0.98, match_status: "OK", requires_review: false, discrepancy_reason: null },
      { line_number: 7, sku_code: "GRAV-1020", item_name: "Pea Shingle Drainage Gravel 10-20mm 25kg", ordered_qty: 60.0, received_qty: 60.0, unit: "bags", confidence_score: 0.98, match_status: "OK", requires_review: false, discrepancy_reason: null },
      { line_number: 8, sku_code: "REBAR-12", item_name: "High Yield Deformed Rebar Steel 12mm x 6m", ordered_qty: 30.0, received_qty: 30.0, unit: "pcs", confidence_score: 0.98, match_status: "OK", requires_review: false, discrepancy_reason: null },
      { line_number: 9, sku_code: "PLY-18", item_name: "Nordic Structural Birch Plywood 18mm", ordered_qty: 25.0, received_qty: 25.0, unit: "sheets", confidence_score: 0.98, match_status: "OK", requires_review: false, discrepancy_reason: null },
      { line_number: 10, sku_code: "SCREW-550", item_name: "Spax Stainless Torx Wood Screws 5.0x50mm (200pk)", ordered_qty: 35.0, received_qty: 35.0, unit: "boxes", confidence_score: 0.98, match_status: "OK", requires_review: false, discrepancy_reason: null },
      { line_number: 11, sku_code: "ROOF-FELT", item_name: "Icopal Top SBS Bitumen Roofing Felt 10m", ordered_qty: 20.0, received_qty: 20.0, unit: "rolls", confidence_score: 0.98, match_status: "OK", requires_review: false, discrepancy_reason: null },
      { line_number: 12, sku_code: "MORTAR-MIX", item_name: "Weber Premix Masonry Mortar M5 25kg", ordered_qty: 75.0, received_qty: 75.0, unit: "bags", confidence_score: 0.98, match_status: "OK", requires_review: false, discrepancy_reason: null },
      { line_number: 14, sku_code: "SEAL-SIL", item_name: "Dana Lim Sanitary Construction Silicone 310ml", ordered_qty: 45.0, received_qty: 45.0, unit: "tubes", confidence_score: 0.98, match_status: "OK", requires_review: false, discrepancy_reason: null },
    ];
  }

  // -------------------------------------------------------------------------
  // Mock API Implementation
  // -------------------------------------------------------------------------

  const MockApi = {
    async health() {
      return {
        status: "ok",
        active_ocr_mode: "deterministic_fallback",
        service: "NexBuild Cloud Hub (Denmark MVP)",
        erp_adapter_status: "ONLINE (Assumed Denmark Legacy ERP)",
        timestamp: new Date().toISOString(),
      };
    },

    async getPO(poNumber = "PO-48213") {
      const state = getMockState();
      if (poNumber !== "PO-48213" && poNumber !== state.po.po_number) {
        return {
          status: "error",
          error_code: "PO_NOT_FOUND",
          message: `Purchase order '${poNumber}' not found in Denmark Hub registry.`,
          details: { requested_po_number: poNumber },
        };
      }
      return JSON.parse(JSON.stringify(state.po));
    },

    async scanDeliveryNote(poNumber = "PO-48213") {
      const lines = getGoldenScenarioScannedLines();
      const okLines = lines.filter((l) => l.match_status === "OK").length;
      const mismatchLines = lines.filter((l) => l.match_status !== "OK").length;
      const lowConfidenceLines = lines.filter((l) => l.confidence_score < 0.85).length;

      return {
        status: "success",
        po_number: poNumber,
        supplier_name: "Nordic BuildSupply DK",
        delivery_note_id: "DN-DK-2026-94821",
        scan_timestamp: new Date().toISOString(),
        ocr_engine: "NexBuild-Gemini-Vision-v2.5 (Demo Fallback)",
        is_fallback: true,
        is_demo_fallback: true,
        items: lines,
        lines: lines,
        summary: {
          total_lines: lines.length,
          ok_lines: okLines,
          mismatch_lines: mismatchLines,
          low_confidence_lines: lowConfidenceLines,
        },
        requires_manual_review: mismatchLines > 0,
      };
    },

    async confirmReceipt(payload) {
      if (!payload || !payload.idempotency_key) {
        return {
          status: "error",
          error_code: "INVALID_REQUEST",
          message: "idempotency_key is required for receipt confirmation.",
          details: {},
        };
      }

      const state = getMockState();
      const key = payload.idempotency_key;

      // 1. Idempotency guard: Honors idempotency_key exactly as backend does
      // Returns 200 with is_idempotent_replay: true without modifying inventory again
      if (state.transactions[key]) {
        const cached = state.transactions[key];
        const snapshot = [];
        const confirmedLines = payload.confirmed_lines || payload.lines || [];

        confirmedLines.forEach((cl) => {
          const invItem = state.inventory.find((item) => item.sku_code === cl.sku_code);
          if (invItem) {
            snapshot.push(JSON.parse(JSON.stringify(invItem)));
          }
        });

        return {
          status: "success",
          message: "Idempotent replay: Receipt already processed. Inventory unchanged.",
          idempotency_key: key,
          po_number: cached.po_number || payload.po_number,
          employee_id: cached.employee_id || payload.employee_id,
          store_id: cached.store_id || payload.store_id || "DK-Aarhus-01",
          is_idempotent_replay: true,
          processed_at: cached.processed_at || new Date().toISOString(),
          updated_inventory: snapshot.length > 0 ? snapshot : cached.updated_inventory || [],
          erp_sync: cached.erp_sync || { sync_status: "REPLAYED" },
        };
      }

      // 2. Fresh receipt processing
      const nowIso = new Date().toISOString();
      const updatedInventory = [];
      const confirmedLines = payload.confirmed_lines || payload.lines || [];

      confirmedLines.forEach((line) => {
        const sku = line.sku_code;
        const receivedQty = parseFloat(line.received_qty) || 0.0;
        const unit = line.unit || "pcs";
        const matchStatus = line.match_status || "";
        const reasonCode = line.reason_code || "";
        const photoEvidence = line.photo_evidence || payload.photo_evidence || null;
        const notes = line.notes || payload.notes || null;

        // Check if SKU is on PO
        const isPoLine = state.po.lines.some((pl) => pl.sku_code === sku);

        const isQuarantine =
          matchStatus === "UNKNOWN_SKU" ||
          reasonCode === "unordered_quarantine" ||
          reasonCode === "not_on_po" ||
          (!isPoLine && reasonCode !== "accept_unordered_override");

        let invItem = state.inventory.find((i) => i.sku_code === sku);

        if (!invItem) {
          invItem = {
            sku_code: sku,
            item_name: line.item_name || (isQuarantine ? `Quarantined Material (${sku})` : `Newly Received (${sku})`),
            category: isQuarantine ? "Quarantine Bay" : "General Materials",
            physical_on_hand: 0.0,
            reserved_qty: 0.0,
            committed_qty: 0.0,
            atp_qty: 0.0,
            quarantine_qty: 0.0,
            unit: unit,
            location: isQuarantine ? "Quarantine Zone Q-1" : "Receiving Staging",
            last_updated: nowIso,
            trust_status: "GREEN",
          };
          state.inventory.push(invItem);
        }

        if (isQuarantine) {
          // Quarantine: do not increase physical_on_hand or atp_qty
          invItem.quarantine_qty = (invItem.quarantine_qty || 0.0) + receivedQty;
          invItem.last_updated = nowIso;
          invItem.trust_status = "AMBER";

          state.audit_logs.unshift({
            id: state.next_audit_id++,
            timestamp: nowIso,
            employee_id: payload.employee_id || "emp_dk_104",
            store_id: payload.store_id || "DK-Aarhus-01",
            po_number: payload.po_number || "PO-48213",
            sku_code: sku,
            action: "QUARANTINED_UNORDERED_SKU",
            reason_code: reasonCode || "unordered_quarantine",
            quantity_change: receivedQty,
            photo_evidence: photoEvidence,
            details: `QUARANTINED_UNORDERED_SKU: sku=${sku} qty=${receivedQty} unit=${unit}`,
            notes: notes || `Unordered item ${sku} (${receivedQty} ${unit}) quarantined.`,
          });
        } else {
          // Normal receipt: increment physical_on_hand and atp_qty
          invItem.physical_on_hand += receivedQty;
          invItem.atp_qty += receivedQty;
          invItem.last_updated = nowIso;
          invItem.trust_status = "GREEN";

          // Update PO line received_qty
          const poLine = state.po.lines.find((pl) => pl.sku_code === sku);
          if (poLine) {
            poLine.received_qty += receivedQty;
            poLine.status = poLine.received_qty >= poLine.ordered_qty ? "COMPLETED" : "PARTIALLY_RECEIVED";
          }

          const auditAction = !isPoLine ? "GOODS_RECEIPT_OVERRIDE_ACCEPTED" : "GOODS_RECEIPT_CONFIRMED";
          state.audit_logs.unshift({
            id: state.next_audit_id++,
            timestamp: nowIso,
            employee_id: payload.employee_id || "emp_dk_104",
            store_id: payload.store_id || "DK-Aarhus-01",
            po_number: payload.po_number || "PO-48213",
            sku_code: sku,
            action: auditAction,
            reason_code: reasonCode || "NORMAL_GOODS_RECEIPT",
            quantity_change: receivedQty,
            photo_evidence: photoEvidence,
            details: `${auditAction}: sku=${sku} qty=${receivedQty} unit=${unit}`,
            notes: notes || "Goods receipt confirmed by warehouse staff.",
          });
        }

        updatedInventory.push(JSON.parse(JSON.stringify(invItem)));
      });

      // Update PO status
      const hasPending = state.po.lines.some((pl) => pl.status !== "COMPLETED");
      state.po.status = hasPending ? "PARTIALLY_RECEIVED" : "COMPLETED";

      const erpResult = {
        sync_status: "SYNCED",
        erp_voucher_no: `ERP-VOUCH-${Date.now().toString().slice(-6)}`,
        erp_transaction_id: `TX-ERP-DK-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        destination: "MOCK_DENMARK_ERP",
        posted_lines_count: confirmedLines.length,
      };

      const response = {
        status: "success",
        message: `Goods receipt confirmed. Inventory posted. Denmark ERP synced (${erpResult.erp_voucher_no}).`,
        idempotency_key: key,
        po_number: payload.po_number || "PO-48213",
        employee_id: payload.employee_id || "emp_dk_104",
        store_id: payload.store_id || "DK-Aarhus-01",
        is_idempotent_replay: false,
        processed_at: nowIso,
        updated_inventory: updatedInventory,
        erp_sync: erpResult,
      };

      state.transactions[key] = response;
      saveMockState(state);
      return response;
    },

    async getATP(params = {}) {
      const state = getMockState();
      let items = state.inventory;

      if (params.sku) {
        const query = params.sku.toLowerCase();
        items = items.filter(
          (i) => i.sku_code.toLowerCase().includes(query) || i.item_name.toLowerCase().includes(query)
        );
      }
      if (params.category) {
        items = items.filter((i) => i.category === params.category);
      }

      return {
        status: "success",
        store_id: params.store_id || "DK-Aarhus-01",
        total_skus: items.length,
        total_items: items.length,
        timestamp: new Date().toISOString(),
        items: JSON.parse(JSON.stringify(items)),
      };
    },

    async getAuditLogs(limit = 50) {
      const state = getMockState();
      const logs = state.audit_logs.slice(0, limit);
      return {
        status: "success",
        count: logs.length,
        logs: JSON.parse(JSON.stringify(logs)),
      };
    },

    async resetDemo() {
      const fresh = createInitialMockState();
      saveMockState(fresh);
      return {
        status: "success",
        message: "SQLite database reset (mock). Seeded clean PO-48213 (14 lines) and 15 inventory SKUs.",
        po_number: "PO-48213",
        seeded_lines_count: 14,
        timestamp: new Date().toISOString(),
      };
    },
  };

  // -------------------------------------------------------------------------
  // Mode Management & Live HTTP Dispatcher
  // -------------------------------------------------------------------------

  function getMode() {
    try {
      return localStorage.getItem(STORAGE_KEY_MODE) || "mock";
    } catch {
      return "mock";
    }
  }

  function setMode(mode) {
    const safeMode = mode === "live" ? "live" : "mock";
    try {
      localStorage.setItem(STORAGE_KEY_MODE, safeMode);
    } catch (err) {
      console.warn("[Api] failed to save mode to localStorage:", err);
    }
    return safeMode;
  }

  async function call(fnName, path, options = {}) {
    const currentMode = getMode();

    if (currentMode === "live") {
      try {
        const url = `${BASE_URL}${path}`;
        const resp = await fetch(url, options);
        let data;
        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await resp.json();
        } else {
          data = { message: await resp.text() };
        }

        if (!resp.ok) {
          // Standard error JSON contract - safe string extraction (QA D0-06)
          const errorMsg =
            (typeof data.detail === "string" ? data.detail : (data.detail && typeof data.detail === "object" && data.detail.message)) ||
            (data.detail && typeof data.detail === "object" && data.detail.error_code ? `${data.detail.error_code}: ${data.detail.message || "Request failed"}` : null) ||
            data.message ||
            `Request failed with status ${resp.status}`;
          const errorObj = {
            status: "error",
            error_code: data.error_code || (data.detail && data.detail.error_code) || `HTTP_${resp.status}`,
            message: errorMsg,
            details: data.details || data.detail || {},
            __http_status: resp.status,
          };
          return errorObj;
        }
        // In Live Mode: broadcast state changes across tabs when inventory-affecting actions succeed
        if (resp.ok && (path.includes("/confirm-receipt") || path.includes("/reset-demo"))) {
          if (channel) {
            try {
              channel.postMessage({ type: "state_change" });
            } catch (e) {
              console.warn("[Api] BroadcastChannel postMessage error:", e);
            }
          }
          notifyStateChange();
        }

        return data;
      } catch (err) {
        console.warn(`[Api] Live backend request to ${path} failed:`, err);
        // Honest Network State (QA D0-02): If in live mode and request fails, do NOT pretend it succeeded!
        return {
          status: "error",
          error_code: "NETWORK_ERROR",
          message: `Network/Server connection failed: ${err.message || "Unable to reach backend API"}`,
          details: { original_error: String(err) },
          __http_status: 0,
        };
      }
    }

    // Mock execution
    const mockHandler = MockApi[fnName];
    if (typeof mockHandler === "function") {
      return mockHandler(options.__payload, options.__extra);
    }
    throw new Error(`Unknown API function: ${fnName}`);
  }

  // Helper for JSON POST requests
  function jsonPost(body) {
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      __payload: body,
    };
  }

  // -------------------------------------------------------------------------
  // Public Interface
  // -------------------------------------------------------------------------

  return {
    getMode,
    setMode,

    onStateChange(fn) {
      if (typeof fn === "function") {
        stateListeners.add(fn);
        return () => stateListeners.delete(fn);
      }
      return () => {};
    },

    async health() {
      return call("health", "/health", { method: "GET" });
    },

    async getPO(poNumber = "PO-48213") {
      return call("getPO", `/po/${encodeURIComponent(poNumber)}`, {
        method: "GET",
        __payload: poNumber,
      });
    },

    async scanDeliveryNote(poNumber = "PO-48213", file = null) {
      if (file && file instanceof File) {
        const formData = new FormData();
        formData.append("po_number", poNumber);
        formData.append("file", file);
        return call("scanDeliveryNote", "/scan-delivery-note/upload", {
          method: "POST",
          body: formData,
          __payload: poNumber,
          __extra: file,
        });
      }

      return call("scanDeliveryNote", "/scan-delivery-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ po_number: poNumber }),
        __payload: poNumber,
      });
    },

    async confirmReceipt(payload) {
      return call("confirmReceipt", "/confirm-receipt", jsonPost(payload));
    },

    async getATP(params = {}) {
      const queryParams = new URLSearchParams();
      if (params.sku) queryParams.set("sku", params.sku);
      if (params.category) queryParams.set("category", params.category);
      if (params.store_id) queryParams.set("store_id", params.store_id);

      const qs = queryParams.toString();
      const path = `/inventory/atp${qs ? `?${qs}` : ""}`;
      return call("getATP", path, {
        method: "GET",
        __payload: params,
      });
    },

    async getAuditLogs(limit = 50) {
      return call("getAuditLogs", `/audit-logs?limit=${encodeURIComponent(limit)}`, {
        method: "GET",
        __payload: limit,
      });
    },

    async resetDemo() {
      return call("resetDemo", "/reset-demo", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
    },
  };
});

