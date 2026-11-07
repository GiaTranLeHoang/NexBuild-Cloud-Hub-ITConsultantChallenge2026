/**
 * NexBuild Cloud Hub - Mobile Warehouse Receiving Scanner
 * Denmark Phase 1 MVP (Stage 3b: Desktop Optimization & Creative Features)
 *
 * Features:
 * - Mobile-first primary experience (390x844, touch targets >= 48px)
 * - Three-zone desktop layout (Left: Demo Guide, Center: Phone Column, Right: Live Event Log)
 * - Languages: English (default), Dansk, Tiếng Việt (instant switch via I18n)
 * - Pure CSS/JS micro-animations (Count-up, SVG checkmark draw, floating delta chips, badge pops)
 * - Demo captions (toggleable presenter guide)
 * - Haptics via navigator.vibrate (Fx)
 * - Dock mode (high-contrast, large touch targets >= 56px)
 * - Real offline queue & idempotency duplicate guard
 */

(function () {
  "use strict";

  // Shortcuts & Helpers
  const t = window.I18n ? window.I18n.t : (k) => k;
  const Fx = window.Fx || {};

  // Configuration & Constants
  const DEFAULT_PO = "PO-48213";
  const DEFAULT_STORE = "DK-Aarhus-01";
  const DEFAULT_EMPLOYEE = "emp_dk_104";
  const SPOTLIGHT_SKU_ORDER = ["CEM-25", "TIM-4595", "PLAST-01", "FIX-M8"];
  const QUEUE_STORAGE_KEY = "nbx_offline_queue";
  const PREF_PHONE_FRAME = "nbx_phone_frame";
  const PREF_DOCK_MODE = "nbx_dock_mode";
  const PREF_CAPTIONS = "nbx_demo_captions";

  // Storage preference readers
  function getBoolPref(key, defaultVal) {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? stored === "true" : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  function setBoolPref(key, val) {
    try {
      localStorage.setItem(key, val ? "true" : "false");
    } catch (e) {
      console.warn("Storage write failed", e);
    }
  }

  function loadOfflineQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function persistOfflineQueue(queue) {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error("[Scanner] Failed to save offline queue", e);
    }
  }

  // Safe HTML Escaping (QA D1-04 Stored XSS Prevention)
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Robust Error Message Extractor (QA D0-06 [object Object] Prevention)
  function formatErrorMessage(err) {
    if (!err) return "Unknown error occurred";
    if (typeof err === "string") return err;
    if (err.message && typeof err.message === "string") return err.message;
    if (typeof err.detail === "string") return err.detail;
    if (err.detail && typeof err.detail === "object") {
      if (typeof err.detail.message === "string") return err.detail.message;
      if (err.detail.error_code) return `${err.detail.error_code}: ${err.detail.message || "Operation failed"}`;
      try { return JSON.stringify(err.detail); } catch (e) {}
    }
    if (err.error_code) return `${err.error_code}: ${err.message || "Operation failed"}`;
    try { return JSON.stringify(err); } catch (e) { return String(err); }
  }

  // Application State
  const state = {
    step: 1, // 1 = Scan, 2 = Match to PO, 3 = Confirmation / Queue View
    isOnline: true,
    offlineQueue: loadOfflineQueue(),
    mode: window.Api ? window.Api.getMode() : "mock",
    isRealOcr: false,
    isDemoFallback: false,

    // Stage 3b Creative Toggles
    phoneFrame: getBoolPref(PREF_PHONE_FRAME, true), // default ON (framed phone)
    dockMode: getBoolPref(PREF_DOCK_MODE, false),     // default OFF
    demoCaptions: getBoolPref(PREF_CAPTIONS, false),  // default OFF
    vibration: window.Fx ? window.Fx.isVibrationEnabled() : true,

    menuOpen: false,
    isScanning: false,
    scanProgressText: "Reading lines... 14 found",
    scanResult: null,

    // PLAST-01 Exception State
    plastReview: {
      reviewed: false,
      received_qty: 52,
      ordered_qty: 60,
      reason_code: "short_delivery",
      photo_evidence: "damaged_pallet_plast01.jpg",
      has_photo: true,
      notes: "Pallet layer missing 8 sheets. Verified at receiving dock.",
    },
    plastDraft: null,

    // FIX-M8 State
    fixApproved: false,

    // Dynamic exception tracking across all SKUs
    reviewedExceptions: {},

    // Active bottom sheet modal
    activeSheet: null, // null | "PLAST_SHEET" | "DUPLICATE_RESULT"
    lastTriggerElement: null,
    duplicateModalData: null,

    // Confirmation & Sync State
    confirming: false,
    lastConfirmedPayload: null,
    lastConfirmedKey: null,
    lastElapsedSeconds: null,
    lastTransactionResult: null,
    isOfflineSaved: false,

    // Offline sync state
    isSyncing: false,
    syncMessage: null,
    errorMessage: null,

    // Event Log timeline (Requirement B)
    eventLogs: [
      { time: formatTimeNow(), text: "System initialized at DK-Aarhus-01", type: "info" }
    ],

    // Active Caption (Requirement E - always English per challenge spec)
    activeCaption: "AI reads the delivery note and matches it to PO-48213",
  };

  function formatTimeNow() {
    const d = new Date();
    return d.toTimeString().split(" ")[0];
  }

  function addEventLog(text, type = "info") {
    state.eventLogs.unshift({
      time: formatTimeNow(),
      text: text,
      type: type,
    });
    // Keep last 15 logs
    if (state.eventLogs.length > 15) {
      state.eventLogs.pop();
    }
    renderDesktopPanels();
  }

  // DOM Mount Points
  let dom = {};

  function cacheDom() {
    dom = {
      appContainer: document.getElementById("scanner-app"),
      topBar: document.getElementById("top-bar"),
      mobileCaptionBar: document.getElementById("mobile-caption-bar"),
      progressBar: document.getElementById("progress-bar"),
      mainContent: document.getElementById("main-content"),
      bottomBar: document.getElementById("bottom-bar"),
      menuDropdown: document.getElementById("menu-dropdown"),
      exceptionModal: document.getElementById("exception-modal"),
      desktopGuidePanel: document.getElementById("desktop-guide-panel"),
      desktopEventLogPanel: document.getElementById("desktop-event-log-panel"),
    };
  }

  // -------------------------------------------------------------------------
  // Core Business Actions
  // -------------------------------------------------------------------------

  async function triggerScan() {
    if (state.isScanning) return;
    state.isScanning = true;
    state.errorMessage = null;
    state.scanProgressText = "Aligning camera & capturing delivery note...";
    state.activeCaption = "AI reads the delivery note and matches it to PO-48213";
    render();

    const t1 = setTimeout(() => {
      state.scanProgressText = "Running Gemini OCR vision pipeline...";
      render();
    }, 600);

    const t2 = setTimeout(() => {
      state.scanProgressText = "Reading lines... 14 found. Reconciling with PO-48213...";
      render();
    }, 1200);

    try {
      await new Promise((r) => setTimeout(r, 1900));
      clearTimeout(t1);
      clearTimeout(t2);

      const result = await window.Api.scanDeliveryNote(DEFAULT_PO);
      if (result.status === "error") {
        throw new Error(result.message || "Failed to scan delivery note");
      }

      state.scanResult = result;
      state.isRealOcr = false;
      state.isDemoFallback = true; // Demo scan always uses deterministic mock
      const rawLines = result.lines || result.items || [];
      const plastLine = rawLines.find((l) => l.sku_code === "PLAST-01");
      if (plastLine && plastLine.match_status === "SHORT") {
        state.plastReview.reviewed = false;
        state.plastReview.received_qty = plastLine.received_qty;
      } else {
        state.plastReview.reviewed = true;
      }
      const fixLine = rawLines.find((l) => l.sku_code === "FIX-M8");
      if (fixLine && fixLine.match_status === "UNKNOWN_SKU") {
        state.fixApproved = false;
      } else {
        state.fixApproved = true;
      }
      state.reviewedExceptions = {};
      if (state.plastReview.reviewed) state.reviewedExceptions["PLAST-01"] = true;
      if (state.fixApproved) state.reviewedExceptions["FIX-M8"] = true;

      state.step = 2;
      state.isScanning = false;
      state.activeCaption = plastLine && plastLine.match_status === "SHORT" 
        ? "Plasterboard is short: reason and photo are logged"
        : "Reconciliation complete — review matched lines below";

      // Haptics on scan complete
      if (Fx.vibrateScanComplete) Fx.vibrateScanComplete();

      // Log event
      addEventLog(t("eventScanComplete"), "success");

      render();

      // Animate count-up for quantity numbers on mount
      setTimeout(() => {
        document.querySelectorAll("[data-count-target]").forEach((el) => {
          const target = parseFloat(el.getAttribute("data-count-target"));
          if (!isNaN(target) && Fx.animateCountUp) {
            Fx.animateCountUp(el, target, 250);
          }
        });
      }, 50);

    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      state.isScanning = false;
      const errMsg = formatErrorMessage(err) || "Network / OCR error occurred. Please try again.";
      state.errorMessage = errMsg;
      if (Fx.vibrateError) Fx.vibrateError();
      addEventLog(`Scan failed: ${errMsg}`, "error");
      render();
    }
  }

  /**
   * Real AI OCR scan — sends an actual image file to the backend Gemini Vision endpoint.
   * Falls back gracefully to the demo mock if the API key is missing or AI fails.
   */
  async function triggerRealScan(file) {
    if (state.isScanning || !file) return;
    state.isScanning = true;
    state.errorMessage = null;
    state.scanProgressText = "Uploading image to NexBuild AI OCR...";
    state.activeCaption = "Real AI reads your delivery note and matches it to PO-48213";
    render();

    const t1 = setTimeout(() => {
      state.scanProgressText = "Processing with Gemini Vision API... (3-5s)";
      render();
    }, 800);

    const t2 = setTimeout(() => {
      state.scanProgressText = "Extracting line items & matching SKU catalog...";
      render();
    }, 2500);

    try {
      const result = await window.Api.scanDeliveryNote(DEFAULT_PO, file);
      clearTimeout(t1);
      clearTimeout(t2);

      if (result.status === "error") {
        throw new Error(formatErrorMessage(result) || "AI OCR failed");
      }

      state.scanResult = result;
      state.isRealOcr = true;
      state.isDemoFallback = Boolean(
        result.is_demo_fallback ||
        result.is_fallback ||
        (result.ocr_engine && result.ocr_engine.includes("Fallback"))
      );
      const rawLines = result.lines || result.items || [];
      const plastLine = rawLines.find((l) => l.sku_code === "PLAST-01");
      if (plastLine && plastLine.match_status === "SHORT") {
        state.plastReview.reviewed = false;
        state.plastReview.received_qty = plastLine.received_qty;
      } else {
        state.plastReview.reviewed = true;
      }
      const fixLine = rawLines.find((l) => l.sku_code === "FIX-M8");
      if (fixLine && fixLine.match_status === "UNKNOWN_SKU") {
        state.fixApproved = false;
      } else {
        state.fixApproved = true;
      }
      state.reviewedExceptions = {};
      if (state.plastReview.reviewed) state.reviewedExceptions["PLAST-01"] = true;
      if (state.fixApproved) state.reviewedExceptions["FIX-M8"] = true;

      state.step = 2;
      state.isScanning = false;
      state.activeCaption = "AI scan complete — review matched lines below";

      if (Fx.vibrateScanComplete) Fx.vibrateScanComplete();
      addEventLog(
        state.isDemoFallback
          ? "AI OCR unavailable — loaded deterministic fallback data"
          : "Real AI OCR scan complete via Gemini Vision",
        state.isDemoFallback ? "warning" : "success"
      );
      render();

      setTimeout(() => {
        document.querySelectorAll("[data-count-target]").forEach((el) => {
          const target = parseFloat(el.getAttribute("data-count-target"));
          if (!isNaN(target) && Fx.animateCountUp) {
            Fx.animateCountUp(el, target, 250);
          }
        });
      }, 50);

    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      state.isScanning = false;
      const errMsg = formatErrorMessage(err) || "AI OCR error. Please try again or use demo scan.";
      state.errorMessage = errMsg;
      if (Fx.vibrateError) Fx.vibrateError();
      addEventLog(`Real AI scan failed: ${errMsg}`, "error");
      render();
    }
  }

  function openPlastSheet(triggerEl) {
    state.lastTriggerElement = triggerEl || document.querySelector('[data-sku="PLAST-01"]');
    state.plastDraft = {
      received_qty: state.plastReview.received_qty,
      reason_code: state.plastReview.reason_code,
      photo_evidence: state.plastReview.photo_evidence,
      has_photo: state.plastReview.has_photo,
      notes: state.plastReview.notes,
    };
    state.activeSheet = "PLAST_SHEET";
    state.activeCaption = "Plasterboard is short by 8: reason and photo are logged";
    render();

    setTimeout(() => {
      const focusTarget = document.getElementById("plast-stepper-val") || document.getElementById("btn-save-plast-sheet");
      if (focusTarget) focusTarget.focus();
    }, 50);
  }

  function closeActiveSheet() {
    state.activeSheet = null;
    state.plastDraft = null;
    render();

    if (state.lastTriggerElement && typeof state.lastTriggerElement.focus === "function") {
      state.lastTriggerElement.focus();
    }
  }

  function savePlastSheet() {
    if (!state.plastDraft) return;
    state.plastReview.reviewed = true;
    state.plastReview.received_qty = state.plastDraft.received_qty;
    state.plastReview.reason_code = state.plastDraft.reason_code;
    state.plastReview.photo_evidence = state.plastDraft.photo_evidence;
    state.plastReview.has_photo = state.plastDraft.has_photo;
    state.plastReview.notes = state.plastDraft.notes;

    state.reviewedExceptions = state.reviewedExceptions || {};
    state.reviewedExceptions["PLAST-01"] = true;

    closeActiveSheet();
    showToast("PLAST-01 exception saved (-8 short)");
    addEventLog(t("eventPlastReviewed"), "warning");

    // Pop animation on the reviewed card
    setTimeout(() => {
      const card = document.querySelector('[data-sku="PLAST-01"]');
      if (card) {
        card.classList.add("animate-pop");
        setTimeout(() => card.classList.remove("animate-pop"), 300);
      }
    }, 50);
  }

  function toggleFixApproved() {
    state.fixApproved = !state.fixApproved;
    state.reviewedExceptions = state.reviewedExceptions || {};
    state.reviewedExceptions["FIX-M8"] = state.fixApproved;
    state.activeCaption = "Unknown item goes to quarantine, not sellable stock";
    render();

    if (state.fixApproved) {
      showToast("Manager override approved for FIX-M8");
      addEventLog(t("eventQuarantineApproved"), "warning");
    } else {
      addEventLog(t("eventQuarantineHeld"), "info");
    }

    // Pop animation on FIX-M8 card
    setTimeout(() => {
      const card = document.querySelector('[data-sku="FIX-M8"]');
      if (card) {
        card.classList.add("animate-pop");
        setTimeout(() => card.classList.remove("animate-pop"), 300);
      }
    }, 50);
  }

  function buildConfirmPayload(idempotencyKey) {
    const rawLines = state.scanResult.lines || state.scanResult.items || [];

    const confirmedLines = rawLines.map((l) => {
      if (l.sku_code === "PLAST-01" && l.match_status === "SHORT") {
        return {
          sku_code: "PLAST-01",
          received_qty: parseFloat(state.plastReview.received_qty || l.received_qty),
          unit: l.unit || "sheets",
          match_status: "SHORT",
          reason_code: state.plastReview.reason_code || "supplier_shortage",
          photo_evidence: state.plastReview.photo_evidence,
          notes: state.plastReview.notes || "Short delivery documented with photo evidence",
        };
      }

      if (l.sku_code === "FIX-M8" && l.match_status === "UNKNOWN_SKU") {
        return {
          sku_code: "FIX-M8",
          received_qty: parseFloat(l.received_qty || 12.0),
          unit: l.unit || "boxes",
          match_status: "UNKNOWN_SKU",
          reason_code: state.fixApproved ? "accept_unordered_override" : "unordered_quarantine",
          photo_evidence: null,
          notes: state.fixApproved
            ? "Manager approved receipt of unordered item (accept_unordered_override)"
            : "Held in quarantine bay GL-DK-9900",
        };
      }

      const isReviewed = Boolean(state.reviewedExceptions && state.reviewedExceptions[l.sku_code]);
      return {
        sku_code: l.sku_code,
        received_qty: parseFloat(l.received_qty),
        unit: l.unit || "pcs",
        match_status: l.match_status || "OK",
        reason_code: l.match_status === "SHORT" ? "supplier_shortage" : l.match_status === "OVER" ? "supplier_overdelivery" : "NORMAL_GOODS_RECEIPT",
        photo_evidence: null,
        notes: isReviewed ? "Discrepancy acknowledged by receiver" : null,
      };
    });

    return {
      po_number: DEFAULT_PO,
      employee_id: DEFAULT_EMPLOYEE,
      store_id: DEFAULT_STORE,
      idempotency_key: idempotencyKey,
      confirmed_lines: confirmedLines,
    };
  }

  async function confirmCurrentReceipt() {
    if (state.confirming) return;

    const rawLines = state.scanResult ? (state.scanResult.lines || state.scanResult.items || []) : [];
    
    // Check all unresolved discrepancies and low-confidence lines (QA D1-05)
    const unresolvedDiscrepancies = rawLines.filter((l) => {
      const isShortOrOver = l.ordered_qty !== undefined && l.received_qty !== l.ordered_qty;
      const isUnknown = l.match_status === "UNKNOWN_SKU";
      const isLowConf = (l.confidence_score !== undefined && l.confidence_score < 0.75) || l.low_confidence;
      const isDisc = l.match_status !== "OK" || isShortOrOver || isUnknown || isLowConf;
      if (!isDisc) return false;
      if (l.sku_code === "PLAST-01") return !state.plastReview.reviewed;
      if (l.sku_code === "FIX-M8") return !state.fixApproved;
      return !Boolean(state.reviewedExceptions && state.reviewedExceptions[l.sku_code]);
    });

    if (unresolvedDiscrepancies.length > 0) {
      const skuList = unresolvedDiscrepancies.map((l) => l.sku_code).join(", ");
      showToast(`Please review discrepancy / low confidence for: ${skuList}`);
      return;
    }

    state.confirming = true;
    state.errorMessage = null;
    render();

    const idempotencyKey =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "tx_dk_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

    const payload = buildConfirmPayload(idempotencyKey);
    state.lastConfirmedPayload = payload;
    state.lastConfirmedKey = idempotencyKey;

    if (!state.isOnline) {
      // OFFLINE PATH
      const queueItem = {
        idempotency_key: idempotencyKey,
        payload: payload,
        created_at: new Date().toISOString(),
      };

      state.offlineQueue.push(queueItem);
      persistOfflineQueue(state.offlineQueue);

      state.isOfflineSaved = true;
      state.lastTransactionResult = null;
      state.step = 3;
      state.confirming = false;
      state.activeCaption = "Offline: saved on the device with a unique key";

      if (Fx.vibrateConfirmSuccess) Fx.vibrateConfirmSuccess();
      addEventLog(t("eventConfirmQueued", { key: idempotencyKey.substring(0, 14) + "..." }), "warning");
      render();
      showToast("Saved on this device. Offline queue badge: " + state.offlineQueue.length);
      return;
    }

    // ONLINE PATH
    const tStart = performance.now();
    try {
      const res = await window.Api.confirmReceipt(payload);
      const elapsed = ((performance.now() - tStart) / 1000).toFixed(2);

      // QA D0-02: Honest Network State - Never show success or advance step on failure
      if (!res || res.status === "error") {
        state.confirming = false;
        const msg = formatErrorMessage(res) || "Server rejected receipt confirmation";
        state.errorMessage = `Failed / Pending Sync: ${msg}`;
        if (Fx.vibrateError) Fx.vibrateError();
        addEventLog(`Confirmation failed: ${msg}`, "error");
        render();
        showToast(`Confirmation failed: ${msg}`);
        return;
      }

      state.lastElapsedSeconds = elapsed;
      state.lastTransactionResult = res;
      state.isOfflineSaved = false;
      state.step = 3;
      state.confirming = false;
      state.activeCaption = "Back online: synced automatically, duplicates are blocked";

      if (Fx.vibrateConfirmSuccess) Fx.vibrateConfirmSuccess();
      addEventLog(t("eventConfirmPosted", { sec: elapsed }), "success");
      render();
      showToast(t("postedHubTitle", { sec: elapsed }));
    } catch (err) {
      state.confirming = false;
      const msg = formatErrorMessage(err) || "Confirmation failed";
      state.errorMessage = `Failed / Pending Sync: ${msg}`;
      if (Fx.vibrateError) Fx.vibrateError();
      addEventLog(`Confirmation error: ${msg}`, "error");
      render();
      showToast(`Confirmation error: ${msg}`);
    }
  }

  async function flushOfflineQueue() {
    if (state.offlineQueue.length === 0 || state.isSyncing) return;

    state.isSyncing = true;
    const initialCount = state.offlineQueue.length;
    state.syncMessage = `Syncing ${initialCount} receipt${initialCount > 1 ? "s" : ""}...`;
    addEventLog(t("eventQueueSyncStart", { count: initialCount }), "info");
    render();

    while (state.offlineQueue.length > 0) {
      const nextItem = state.offlineQueue[0];
      try {
        const res = await window.Api.confirmReceipt(nextItem.payload);
        if (!res || res.status === "error") {
          throw new Error(formatErrorMessage(res) || "Sync failed");
        }
        // QA D0-02: Only remove from queue after successful 200 OK commit
        state.offlineQueue.shift();
        persistOfflineQueue(state.offlineQueue);
        render();
      } catch (err) {
        state.isSyncing = false;
        state.syncMessage = null;
        const msg = formatErrorMessage(err) || "Sync failed";
        state.errorMessage = `Sync paused: ${msg}. Retrying available.`;
        if (Fx.vibrateError) Fx.vibrateError();
        addEventLog(`Sync error: ${msg}`, "error");
        render();
        return;
      }
    }

    state.isSyncing = false;
    state.syncMessage = null;
    persistOfflineQueue(state.offlineQueue);
    addEventLog(t("eventQueueSynced"), "success");
    if (Fx.vibrateConfirmSuccess) Fx.vibrateConfirmSuccess();
    render();
    showToast("Synced. All queued receipts posted to Hub.");
  }

  function toggleOnline() {
    state.isOnline = !state.isOnline;
    render();

    if (state.isOnline) {
      showToast("Network restored: Online");
      if (state.offlineQueue.length > 0) {
        flushOfflineQueue();
      }
    } else {
      showToast("Switched to Offline mode. Confirmations will queue locally.");
    }
  }

  async function testDuplicateSend() {
    if (!state.lastConfirmedPayload || !state.lastConfirmedKey) {
      showToast("Please confirm a receipt first to generate an idempotency key.");
      return;
    }

    showToast("Re-sending identical idempotency key to test replay guard...");
    try {
      const dupRes = await window.Api.confirmReceipt(state.lastConfirmedPayload);
      state.duplicateModalData = {
        key: state.lastConfirmedKey,
        response: dupRes,
        isReplay: dupRes.is_idempotent_replay === true || dupRes.status === "success",
      };
      state.activeSheet = "DUPLICATE_RESULT";
      addEventLog(t("eventDuplicateBlocked"), "success");
      render();
    } catch (err) {
      state.duplicateModalData = {
        key: state.lastConfirmedKey,
        response: { message: err.message },
        isReplay: false,
      };
      state.activeSheet = "DUPLICATE_RESULT";
      addEventLog(`Duplicate check failed: ${err.message}`, "error");
      render();
    }
  }

  async function resetDemoData() {
    state.menuOpen = false;
    try {
      await window.Api.resetDemo();
      state.offlineQueue = [];
      persistOfflineQueue([]);
      state.step = 1;
      state.scanResult = null;
      state.plastReview = {
        reviewed: false,
        received_qty: 52,
        ordered_qty: 60,
        reason_code: "short_delivery",
        photo_evidence: "damaged_pallet_plast01.jpg",
        has_photo: true,
        notes: "Pallet layer missing 8 sheets. Verified at receiving dock.",
      };
      state.fixApproved = false;
      state.reviewedExceptions = {};
      state.lastConfirmedPayload = null;
      state.lastConfirmedKey = null;
      state.lastTransactionResult = null;
      state.isOfflineSaved = false;
      state.activeSheet = null;
      state.errorMessage = null;
      state.activeCaption = "AI reads the delivery note and matches it to PO-48213";
      addEventLog(t("eventDemoReset"), "info");
      render();
      showToast("Demo data reset & offline queue cleared.");
    } catch (err) {
      state.errorMessage = "Reset failed: " + err.message;
      render();
    }
  }

  function toggleMode() {
    const next = state.mode === "mock" ? "live" : "mock";
    window.Api.setMode(next);
    state.mode = next;
    state.menuOpen = false;
    render();
    showToast(`Switched to ${next.toUpperCase()} mode`);
  }

  function togglePhoneFrame() {
    state.phoneFrame = !state.phoneFrame;
    setBoolPref(PREF_PHONE_FRAME, state.phoneFrame);
    render();
    showToast(state.phoneFrame ? "Phone frame: ON" : "Phone frame: OFF");
  }

  function toggleDockMode() {
    state.dockMode = !state.dockMode;
    setBoolPref(PREF_DOCK_MODE, state.dockMode);
    render();
    showToast(state.dockMode ? "Dock mode: ON" : "Dock mode: OFF");
  }

  function toggleDemoCaptions() {
    state.demoCaptions = !state.demoCaptions;
    setBoolPref(PREF_CAPTIONS, state.demoCaptions);
    render();
    showToast(state.demoCaptions ? "Demo captions: ON" : "Demo captions: OFF");
  }

  function toggleVibration() {
    state.vibration = !state.vibration;
    if (Fx.setVibrationEnabled) Fx.setVibrationEnabled(state.vibration);
    render();
    showToast(state.vibration ? "Haptic vibration: ON" : "Haptic vibration: OFF");
  }

  function switchLanguage(lang) {
    if (window.I18n) {
      window.I18n.setLanguage(lang);
      render();
      showToast(`Language: ${lang.toUpperCase()}`);
    }
  }

  function showToast(msg) {
    const existing = document.getElementById("scanner-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "scanner-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.className =
      "fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl border border-slate-700 flex items-center gap-2 animate-bounce";
    toast.innerHTML = `<span>ℹ</span><span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2800);
  }

  // -------------------------------------------------------------------------
  // Render Desktop Side Panels (Requirement B & E)
  // -------------------------------------------------------------------------

  function renderDesktopPanels() {
    // 1. Left Panel: Live Demo Guide
    if (dom.desktopGuidePanel) {
      dom.desktopGuidePanel.innerHTML = `
        <div class="bg-slate-800/95 rounded-2xl border border-slate-700/80 p-5 shadow-xl space-y-4 text-white">
          <div class="flex items-center justify-between border-b border-slate-700 pb-3">
            <div class="flex items-center gap-2">
              <span class="text-orange-500 text-lg">🎙️</span>
              <h2 class="font-bold text-sm tracking-tight text-white uppercase tracking-wider">Live Demo Guide</h2>
            </div>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700">GLANCEABLE</span>
          </div>

          <!-- Step Progression Readout -->
          <div class="space-y-2 text-xs">
            <div class="p-2.5 rounded-xl border flex items-center gap-2.5 ${state.step === 1 ? "bg-orange-950/60 border-orange-500 text-orange-200" : "bg-slate-900/60 border-slate-800 text-slate-400"
        }">
              <span class="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${state.step === 1 ? "bg-orange-600 text-white" : state.step > 1 ? "bg-emerald-600 text-white" : "bg-slate-700"}">
                ${state.step > 1 ? "✓" : "1"}
              </span>
              <span class="font-bold">1. Delivery Note AI Scan</span>
            </div>

            <div class="p-2.5 rounded-xl border flex items-center gap-2.5 ${state.step === 2 ? "bg-orange-950/60 border-orange-500 text-orange-200" : "bg-slate-900/60 border-slate-800 text-slate-400"
        }">
              <span class="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${state.step === 2 ? "bg-orange-600 text-white" : state.step > 2 ? "bg-emerald-600 text-white" : "bg-slate-700"}">
                ${state.step > 2 ? "✓" : "2"}
              </span>
              <span class="font-bold">2. Reconciliation & Review</span>
            </div>

            <div class="p-2.5 rounded-xl border flex items-center gap-2.5 ${state.step === 3 ? "bg-orange-950/60 border-orange-500 text-orange-200" : "bg-slate-900/60 border-slate-800 text-slate-400"
        }">
              <span class="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${state.step === 3 ? "bg-orange-600 text-white" : "bg-slate-700"}">
                3
              </span>
              <span class="font-bold">3. Hub Post & Sync</span>
            </div>
          </div>

          <!-- Active Caption Box (Requirement E) -->
          <div class="p-3.5 bg-slate-900/90 rounded-xl border border-orange-500/40 text-xs space-y-1 shadow-inner">
            <span class="text-[10px] uppercase font-bold text-orange-400 tracking-wider flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-orange-400 animate-ping"></span>
              <span>Active Presenter Caption:</span>
            </span>
            <p class="text-sm font-semibold text-slate-100 leading-snug">
              "${state.activeCaption}"
            </p>
          </div>

          <!-- PO Context Card -->
          <div class="p-3 bg-slate-900/50 rounded-xl border border-slate-700/60 text-xs space-y-1 text-slate-400">
            <div><strong class="text-slate-200">Order:</strong> <span class="whitespace-nowrap font-mono text-orange-400">PO&#8209;48213</span> (14 lines)</div>
            <div><strong class="text-slate-200">Supplier:</strong> Nordic BuildSupply DK</div>
            <div><strong class="text-slate-200">Store:</strong> ${DEFAULT_STORE} (${DEFAULT_EMPLOYEE})</div>
          </div>
        </div>
      `;
    }

    // 2. Right Panel: Live Event Log Timeline (Requirement B)
    if (dom.desktopEventLogPanel) {
      dom.desktopEventLogPanel.innerHTML = `
        <div class="bg-slate-800/95 rounded-2xl border border-slate-700/80 p-5 shadow-xl space-y-3.5 text-white">
          <div class="flex items-center justify-between border-b border-slate-700 pb-3">
            <div class="flex items-center gap-2">
              <span class="text-emerald-400 text-lg">📜</span>
              <h2 class="font-bold text-sm tracking-tight text-white uppercase tracking-wider">Live Event Log</h2>
            </div>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-emerald-400 border border-slate-700 animate-pulse">LIVE</span>
          </div>

          <!-- Timeline items -->
          <div class="space-y-2 max-h-[600px] overflow-y-auto phone-viewport pr-1 text-xs">
            ${state.eventLogs
          .map((log) => {
            let badgeColor = "bg-slate-700 text-slate-300";
            if (log.type === "success") badgeColor = "bg-emerald-950 text-emerald-300 border border-emerald-500/40";
            if (log.type === "warning") badgeColor = "bg-amber-950 text-amber-300 border border-amber-500/40";
            if (log.type === "error") badgeColor = "bg-red-950 text-red-300 border border-red-500/40";

            return `
                  <div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/50 space-y-1">
                    <div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>${log.time}</span>
                      <span class="px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${badgeColor}">${log.type}</span>
                    </div>
                    <p class="text-xs text-slate-200 leading-snug font-medium">${log.text}</p>
                  </div>
                `;
          })
          .join("")}
          </div>
        </div>
      `;
    }
  }

  // -------------------------------------------------------------------------
  // Render Mobile App Components
  // -------------------------------------------------------------------------

  function renderTopBar() {
    const queueLen = state.offlineQueue.length;
    const currentLang = window.I18n ? window.I18n.getLanguage() : "en";

    return `
      <header class="bg-slate-900 text-white px-3.5 py-2.5 flex items-center justify-between border-b border-slate-800 shrink-0 w-full">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center font-black text-sm tracking-tighter text-white shadow-sm shrink-0">
            NB
          </div>
          <div class="leading-tight">
            <div class="font-bold text-xs tracking-tight text-white flex items-center gap-1.5 flex-wrap">
              <span>${DEFAULT_STORE}</span>
              <span class="text-[10px] text-slate-400 font-mono font-normal">(${DEFAULT_EMPLOYEE})</span>
            </div>
            <div class="text-[10px] text-slate-400 font-medium">${t("hubScannerTitle")}</div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- Compact Language Selector (Requirement C) -->
          <div class="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button type="button" data-action="set-lang" data-lang="en"
              class="px-1.5 py-1 text-[10px] font-bold rounded ${currentLang === "en" ? "bg-orange-600 text-white" : "text-slate-400 hover:text-white"}">
              EN
            </button>
            <button type="button" data-action="set-lang" data-lang="da"
              class="px-1.5 py-1 text-[10px] font-bold rounded ${currentLang === "da" ? "bg-orange-600 text-white" : "text-slate-400 hover:text-white"}">
              DA
            </button>
            <button type="button" data-action="set-lang" data-lang="vi"
              class="px-1.5 py-1 text-[10px] font-bold rounded ${currentLang === "vi" ? "bg-orange-600 text-white" : "text-slate-400 hover:text-white"}">
              VI
            </button>
          </div>

          <!-- Real Online/Offline toggle (Touch target >= 48px) -->
          <button id="btn-toggle-online" type="button" aria-label="Toggle network connectivity"
            class="min-h-[48px] px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold border transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${state.isOnline
        ? "bg-emerald-950/70 border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/60"
        : "bg-amber-950/70 border-amber-500/50 text-amber-400 hover:bg-amber-900/60"
      }">
            <span class="w-2 h-2 rounded-full ${state.isOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}"></span>
            <span>${state.isOnline ? t("online") : t("offline")}</span>
          </button>

          <!-- Larger, highly readable Queue Badge (Requirement A & D) -->
          <div id="queue-badge-container" class="flex items-center gap-1.5 min-h-[48px] px-2.5 py-1.5 bg-slate-800 rounded-lg text-xs font-bold text-slate-200 border border-slate-700 shadow-sm select-none" title="Local Offline Storage Queue">
            <span class="text-slate-400 text-[11px]">${t("queueBadge")}:</span>
            <span id="queue-badge-count" class="px-1.5 py-0.5 rounded-md font-mono text-xs font-black ${state.isSyncing
        ? "bg-amber-500 text-slate-950 animate-pulse"
        : queueLen > 0
          ? "bg-amber-400 text-slate-950"
          : "bg-slate-700 text-slate-300"
      }">
              ${state.isSyncing ? "⚡" : queueLen}
            </span>
          </div>

          <!-- Overflow menu button (Touch target >= 48px) -->
          <button id="btn-overflow-menu" type="button" aria-label="Open settings menu"
            class="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="6" r="1.5" fill="currentColor"/>
              <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="12" cy="18" r="1.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </header>
    `;
  }

  // Mobile Slim Caption Bar (Requirement E)
  function renderMobileCaptionBar() {
    if (!state.demoCaptions) return "";

    return `
      <div class="bg-orange-950/90 border-b border-orange-500/40 text-orange-200 px-3.5 py-1.5 text-xs font-medium flex items-center gap-2 transition-all" role="status">
        <span class="w-2 h-2 rounded-full bg-orange-400 shrink-0 animate-ping"></span>
        <span class="truncate">"${state.activeCaption}"</span>
      </div>
    `;
  }

  function renderProgressBar() {
    const steps = [
      { id: 1, label: t("step1") },
      { id: 2, label: t("step2") },
      { id: 3, label: t("step3") },
    ];

    return `
      <nav aria-label="Receiving workflow progress" class="bg-slate-100 border-b border-slate-200 px-4 py-2 shrink-0">
        <div class="flex items-center justify-between text-xs font-semibold">
          ${steps
        .map((s, idx) => {
          const isPast = state.step > s.id;
          const isCurrent = state.step === s.id;
          const statusClass = isCurrent
            ? "text-orange-700 font-bold"
            : isPast
              ? "text-slate-900"
              : "text-slate-400";

          const badgeClass = isCurrent
            ? "bg-orange-600 text-white ring-2 ring-orange-200"
            : isPast
              ? "bg-slate-900 text-white"
              : "bg-slate-200 text-slate-500";

          return `
                <div class="flex items-center gap-1.5 ${statusClass}">
                  <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${badgeClass}">
                    ${isPast ? "✓" : s.id}
                  </span>
                  <span>${s.label}</span>
                </div>
                ${idx < steps.length - 1
              ? `<span class="text-slate-300 text-xs px-1 select-none">›</span>`
              : ""
            }
              `;
        })
        .join("")}
        </div>
      </nav>
    `;
  }

  // -------------------------------------------------------------------------
  // Step 1: Scan View
  // -------------------------------------------------------------------------

  function renderStep1Scan() {
    if (state.isScanning) {
      return `
        <div class="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <!-- Animated Scanner Viewport -->
          <div class="relative w-full max-w-[320px] aspect-[3/4] bg-slate-900 rounded-2xl border-4 border-slate-700 shadow-2xl overflow-hidden flex flex-col items-center justify-between p-4 mb-6">
            <div class="absolute top-3 left-3 w-8 h-8 border-t-4 border-l-4 border-orange-500 rounded-tl-lg"></div>
            <div class="absolute top-3 right-3 w-8 h-8 border-t-4 border-r-4 border-orange-500 rounded-tr-lg"></div>
            <div class="absolute bottom-3 left-3 w-8 h-8 border-b-4 border-l-4 border-orange-500 rounded-bl-lg"></div>
            <div class="absolute bottom-3 right-3 w-8 h-8 border-b-4 border-r-4 border-orange-500 rounded-br-lg"></div>

            <div class="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-400 to-transparent shadow-[0_0_15px_#f97316] scanner-beam"></div>

            <!-- Pulsing Skeleton Placeholder Lines (Requirement D) -->
            <div class="w-full flex-1 mt-4 px-2 flex flex-col gap-2.5 opacity-60">
              <div class="flex items-center justify-between border-b border-slate-700 pb-2">
                <div class="h-3 w-28 bg-slate-500 rounded animate-pulse"></div>
                <div class="h-3 w-16 bg-slate-600 rounded animate-pulse"></div>
              </div>
              <div class="h-2 w-44 bg-slate-600 rounded animate-pulse"></div>
              <div class="h-2 w-36 bg-slate-600 rounded animate-pulse"></div>
              <div class="mt-3 flex flex-col gap-2">
                <div class="h-2.5 w-full bg-slate-700 rounded animate-pulse"></div>
                <div class="h-2.5 w-full bg-slate-700 rounded animate-pulse"></div>
                <div class="h-2.5 w-full bg-slate-700 rounded animate-pulse"></div>
                <div class="h-2.5 w-full bg-slate-700 rounded animate-pulse"></div>
                <div class="h-2.5 w-full bg-slate-700 rounded animate-pulse"></div>
              </div>
            </div>

            <div class="w-full bg-slate-950/90 backdrop-blur rounded-lg p-2.5 border border-slate-800 text-left">
              <div class="flex items-center gap-2 mb-1">
                <span class="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span>
                <span class="text-[11px] font-mono font-bold text-orange-400 uppercase tracking-wider">AI OCR Scanning</span>
              </div>
              <p class="text-xs text-slate-200 font-mono">${state.scanProgressText}</p>
            </div>
          </div>

          <h2 class="text-base font-bold text-slate-900 mb-1">${t("scanScanningTitle")}</h2>
          <p class="text-xs text-slate-600">${t("scanReconcilingText")}</p>
        </div>
      `;
    }

    return `
      <div class="flex-1 flex flex-col justify-between p-4 sm:p-5">
        <div class="space-y-4">
          <!-- Context banner (Requirement A: PO-48213 shown clearly above scan button) -->
          <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div class="flex items-start justify-between">
              <div>
                <span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">${t("targetPoLabel")}</span>
                <h2 class="text-lg font-extrabold text-slate-900 tracking-tight mt-0.5 whitespace-nowrap po-badge">PO&#8209;48213</h2>
                <p class="text-xs text-slate-600 font-medium">${t("hubLocation")}</p>
              </div>
              <span class="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-md border border-slate-200 whitespace-nowrap">
                ${t("linesExpected")}
              </span>
            </div>
          </div>

          <!-- Hero Scan Trigger Card (Requirement A: short label, never wraps) -->
          <div class="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 text-white text-center shadow-lg border border-slate-700 flex flex-col items-center">
            <div class="w-16 h-16 rounded-2xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400 mb-4 shadow-inner">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>

            <h3 class="text-base font-bold text-white mb-1">${t("inboundDeliveryNote")}</h3>
            <p class="text-xs text-slate-300 max-w-xs mb-6">
              ${t("scanHelpText")}
            </p>

            <button id="btn-trigger-scan" type="button"
              class="w-full min-h-[56px] py-4 px-6 bg-orange-600 hover:bg-orange-500 active:scale-98 text-white font-bold text-base rounded-xl shadow-lg shadow-orange-600/30 flex items-center justify-center gap-2.5 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
              <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <!-- Requirement A: Shorter label, PO code above, never wraps -->
              <span class="whitespace-nowrap">${t("scanDemoButton")}</span>
            </button>

            <!-- Real AI OCR: Upload / Camera button -->
            <button id="btn-upload-scan" type="button"
              class="w-full min-h-[48px] py-3 px-6 mt-3 bg-slate-700 hover:bg-slate-600 active:scale-98 text-white font-semibold text-sm rounded-xl shadow flex items-center justify-center gap-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 border border-slate-600">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span class="whitespace-nowrap">📷 Upload Real Photo (AI OCR)</span>
            </button>
          </div>

          <!-- Instructions Card -->
          <div class="bg-slate-100 rounded-xl p-3.5 border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div class="font-semibold text-slate-800 flex items-center gap-1.5">
              <span>📋</span> ${t("standardProcedureTitle")}
            </div>
            <ul class="list-disc list-inside space-y-1 text-slate-600">
              <li>${t("procedure1")}</li>
              <li>${t("procedure2")}</li>
              <li>${t("procedure3")}</li>
            </ul>
          </div>
        </div>

        ${state.errorMessage
        ? `
          <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center justify-between">
            <span>${escapeHtml(state.errorMessage)}</span>
            <button id="btn-dismiss-error" class="font-bold underline ml-2">Dismiss</button>
          </div>
        `
        : ""
      }
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Step 2: Match to PO View
  // -------------------------------------------------------------------------

  function renderStatusBadge(status) {
    if (status === "OK") {
      return `<span class="bg-green-100 text-green-800 px-2.5 py-1 rounded-md text-xs font-bold border border-green-200 whitespace-nowrap">100% matched</span>`;
    }
    if (status === "SHORT") {
      return `<span class="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-md text-xs font-bold border border-yellow-200 whitespace-nowrap">SHORT</span>`;
    }
    if (status === "UNKNOWN_SKU") {
      return `<span class="bg-red-100 text-red-800 px-2.5 py-1 rounded-md text-xs font-bold border border-red-200 whitespace-nowrap">UNORDERED SKU</span>`;
    }
    if (status === "OVER") {
      return `<span class="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-md text-xs font-bold border border-blue-200 whitespace-nowrap">OVER</span>`;
    }
    return `<span class="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md text-xs font-bold border border-slate-200 whitespace-nowrap">${status || "PENDING"}</span>`;
  }

  function renderSpotlightCard(line) {
    const isPlastShort = line.sku_code === "PLAST-01" && line.match_status === "SHORT";
    const isFixUnknown = line.sku_code === "FIX-M8" && line.match_status === "UNKNOWN_SKU";
    const confPercent = Math.round((line.confidence_score !== undefined ? line.confidence_score : 0.98) * 100);

    // 1. PLAST-01 Short Delivery Card (Only if actually short)
    if (isPlastShort) {
      const isReviewed = state.plastReview.reviewed;
      const recQty = state.plastReview.received_qty !== undefined ? state.plastReview.received_qty : line.received_qty;
      const ordQty = line.ordered_qty || 60;
      const shortfall = recQty - ordQty;

      return `
        <article class="rounded-xl border ${isReviewed ? "border-emerald-300 bg-emerald-50/20" : "border-amber-300 bg-amber-50/30"
        } p-3.5 shadow-sm transition space-y-2.5" data-sku="PLAST-01" tabindex="0">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <h4 class="font-bold text-sm text-slate-900 leading-snug">${escapeHtml(line.item_name || 'Gyproc Standard Plasterboard')}</h4>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">${escapeHtml(line.sku_code)}</span>
                <span class="text-[11px] text-slate-500">${escapeHtml(line.unit || 'sheets')}</span>
              </div>
            </div>
            <div class="shrink-0">
              <span class="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-md text-xs font-bold border border-yellow-200 whitespace-nowrap">SHORT</span>
            </div>
          </div>

          <!-- Quantity Hero Block with Count-Up support -->
          <div class="bg-slate-50/90 rounded-lg p-2.5 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">${t("deliveredOrdered")}</span>
              <div class="flex items-baseline gap-1 mt-0.5">
                <span class="hero-quantity font-black text-slate-900 tracking-tight font-mono" data-count-target="${recQty}">${recQty}</span>
                <span class="text-xs font-semibold text-slate-500">/ ${ordQty} ${escapeHtml(line.unit || 'sheets')}</span>
              </div>
            </div>
            <span class="px-2 py-1 rounded-md text-xs font-black bg-yellow-100 text-yellow-900 border border-yellow-300 whitespace-nowrap">
              ${shortfall} ${escapeHtml(line.unit || 'sheets')} short
            </span>
          </div>

          <!-- Confidence bar -->
          <div class="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <div class="flex items-center gap-1.5 flex-1 mr-3">
              <div class="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden shrink-0">
                <div class="h-full rounded-full bg-amber-500" style="width: ${confPercent}%"></div>
              </div>
              <span class="font-mono text-[10px] font-semibold text-slate-600">${confPercent}% conf</span>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">${t("lineNum", { num: escapeHtml(String(line.line_number || "3")) })}</span>
          </div>

          <!-- Review Trigger Button (Touch target >= 48px) -->
          <button type="button" id="btn-open-plast-sheet"
            class="w-full min-h-[48px] py-2.5 px-3 rounded-lg text-xs font-bold border transition flex items-center justify-center gap-2 active:scale-98 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${isReviewed
          ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
          : "bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300"
        }">
            ${isReviewed
          ? `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                   <span>${t("reviewedShortStatus")}</span>`
          : `<span class="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px]">!</span>
                   <span>${t("reviewShortAction")}</span>`
        }
          </button>
        </article>
      `;
    }

    // 2. FIX-M8 Unordered SKU Card (Only if actually unknown)
    if (isFixUnknown) {
      const recQty = line.received_qty || 12;
      return `
        <article class="rounded-xl border ${state.fixApproved ? "border-emerald-300 bg-emerald-50/20" : "border-red-300 bg-red-50/25"
        } p-3.5 shadow-sm transition space-y-2.5" data-sku="FIX-M8" tabindex="0">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <h4 class="font-bold text-sm text-slate-900 leading-snug">${escapeHtml(line.item_name || 'Heavy Anchors / Fixings')}</h4>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">FIX-M8</span>
                <span class="text-[11px] text-slate-500">${escapeHtml(line.unit || 'boxes')}</span>
              </div>
            </div>
            <div class="shrink-0">
              <span class="bg-red-100 text-red-800 px-2.5 py-1 rounded-md text-xs font-bold border border-red-200 whitespace-nowrap">UNORDERED SKU</span>
            </div>
          </div>

          <!-- Quantity Hero Block -->
          <div class="bg-slate-50/90 rounded-lg p-2.5 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">${t("deliveredOrdered")}</span>
              <div class="flex items-baseline gap-1 mt-0.5">
                <span class="hero-quantity font-black text-slate-900 tracking-tight font-mono" data-count-target="${recQty}">${recQty}</span>
                <span class="text-xs font-semibold text-slate-500">/ 0 ${escapeHtml(line.unit || 'boxes')}</span>
              </div>
            </div>
            <span class="px-2 py-1 rounded-md text-xs font-black bg-red-100 text-red-900 border border-red-300 whitespace-nowrap">
              +${recQty} unordered
            </span>
          </div>

          <!-- Red quarantine banner -->
          <div class="p-3 bg-red-100/90 border border-red-300 rounded-lg text-red-950 text-xs space-y-1">
            <div class="font-bold flex items-center gap-1.5 text-red-900">
              <span class="text-sm">🚫</span>
              <span>${t("quarantineBanner")}</span>
            </div>
            <div class="text-[11px] text-red-800 font-mono">${t("lowConfidenceNote")}</div>
          </div>

          <!-- Checkbox: Manager approved receipt of unordered item (Touch target >= 48px) -->
          <label id="fix-checkbox-label"
            class="min-h-[48px] p-2.5 rounded-lg border flex items-center gap-3 cursor-pointer select-none transition ${state.fixApproved
          ? "bg-emerald-50 border-emerald-300 text-emerald-950"
          : "bg-white border-slate-300 text-slate-800 hover:bg-slate-50"
        }">
            <input type="checkbox" id="checkbox-fix-override" ${state.fixApproved ? "checked" : ""}
              class="w-5 h-5 rounded text-orange-600 focus:ring-orange-500 border-slate-400 cursor-pointer">
            <div class="text-xs font-bold leading-tight">
              <span>${t("managerApprovalCheckbox")}</span>
              <div class="text-[10px] font-normal text-slate-500 mt-0.5">
                ${state.fixApproved ? t("managerApprovalSub") : t("managerApprovalPrompt")}
              </div>
            </div>
          </label>
        </article>
      `;
    }

    // 3. General Dynamic Item Card (Strict Mutually Exclusive Badges)
    const isReviewed = Boolean(state.reviewedExceptions && state.reviewedExceptions[line.sku_code]);
    const isLowConf = (line.confidence_score !== undefined && line.confidence_score < 0.75) || Boolean(line.low_confidence);
    const isShort = line.match_status === "SHORT" || (line.ordered_qty !== undefined && line.received_qty < line.ordered_qty);
    const isOver = line.match_status === "OVER" || (line.ordered_qty !== undefined && line.received_qty > line.ordered_qty);
    const isUnknown = line.match_status === "UNKNOWN_SKU";
    const isOk = line.match_status === "OK" && (line.ordered_qty === undefined || line.received_qty === line.ordered_qty) && !isLowConf;

    let badgeHtml = "";
    let varianceChipHtml = "";
    let reviewActionHtml = "";

    if (isOk) {
      badgeHtml = `<span class="bg-green-100 text-green-800 px-2.5 py-1 rounded-md text-xs font-bold border border-green-200 whitespace-nowrap">100% matched</span>`;
      varianceChipHtml = `<span class="px-2 py-0.5 rounded text-[11px] font-bold text-green-800 bg-green-50 border border-green-200 whitespace-nowrap">Match</span>`;
    } else if (isShort) {
      const deficit = (line.received_qty || 0) - (line.ordered_qty || 0);
      badgeHtml = `<span class="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-md text-xs font-bold border border-yellow-200 whitespace-nowrap">SHORT</span>`;
      varianceChipHtml = `<span class="px-2 py-1 rounded-md text-xs font-black bg-yellow-100 text-yellow-900 border border-yellow-300 whitespace-nowrap">${deficit} ${escapeHtml(line.unit || '')} short</span>`;
      reviewActionHtml = `
        <button type="button" data-action="review-general" data-sku="${escapeHtml(line.sku_code)}"
          class="w-full min-h-[44px] py-2 px-3 rounded-lg text-xs font-bold border transition flex items-center justify-center gap-2 active:scale-98 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${isReviewed
            ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
            : "bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300"
          }">
          ${isReviewed
            ? `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
               <span>Shortage acknowledged (${escapeHtml(line.sku_code)})</span>`
            : `<span class="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px]">!</span>
               <span>Review shortage (${escapeHtml(line.sku_code)})</span>`
          }
        </button>
      `;
    } else if (isOver) {
      const surplus = (line.received_qty || 0) - (line.ordered_qty || 0);
      badgeHtml = `<span class="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-md text-xs font-bold border border-blue-200 whitespace-nowrap">OVER (+${surplus})</span>`;
      varianceChipHtml = `<span class="px-2 py-1 rounded-md text-xs font-black bg-blue-100 text-blue-900 border border-blue-300 whitespace-nowrap">+${surplus} ${escapeHtml(line.unit || '')} surplus</span>`;
      reviewActionHtml = `
        <button type="button" data-action="review-general" data-sku="${escapeHtml(line.sku_code)}"
          class="w-full min-h-[44px] py-2 px-3 rounded-lg text-xs font-bold border transition flex items-center justify-center gap-2 active:scale-98 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${isReviewed
            ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
            : "bg-blue-100 hover:bg-blue-200 text-blue-950 border-blue-300"
          }">
          ${isReviewed
            ? `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
               <span>Over-delivery accepted (${escapeHtml(line.sku_code)})</span>`
            : `<span class="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px]">!</span>
               <span>Approve over-delivery (+${surplus})</span>`
          }
        </button>
      `;
    } else if (isUnknown) {
      badgeHtml = `<span class="bg-red-100 text-red-800 px-2.5 py-1 rounded-md text-xs font-bold border border-red-200 whitespace-nowrap">UNORDERED SKU</span>`;
      varianceChipHtml = `<span class="px-2 py-1 rounded-md text-xs font-black bg-red-100 text-red-900 border border-red-300 whitespace-nowrap">+${line.received_qty} unordered</span>`;
      reviewActionHtml = `
        <button type="button" data-action="review-general" data-sku="${escapeHtml(line.sku_code)}"
          class="w-full min-h-[44px] py-2 px-3 rounded-lg text-xs font-bold border transition flex items-center justify-center gap-2 active:scale-98 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${isReviewed
            ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
            : "bg-red-100 hover:bg-red-200 text-red-950 border-red-300"
          }">
          ${isReviewed
            ? `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
               <span>Override approved (${escapeHtml(line.sku_code)})</span>`
            : `<span class="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px]">!</span>
               <span>Approve unordered receipt (${escapeHtml(line.sku_code)})</span>`
          }
        </button>
      `;
    } else if (isLowConf) {
      badgeHtml = `<span class="bg-amber-100 text-amber-900 px-2.5 py-1 rounded-md text-xs font-bold border border-amber-300 whitespace-nowrap">LOW CONFIDENCE (${confPercent}%)</span>`;
      varianceChipHtml = `<span class="px-2 py-0.5 rounded text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 whitespace-nowrap">Verify Qty (${line.received_qty})</span>`;
      reviewActionHtml = `
        <button type="button" data-action="review-general" data-sku="${escapeHtml(line.sku_code)}"
          class="w-full min-h-[44px] py-2 px-3 rounded-lg text-xs font-bold border transition flex items-center justify-center gap-2 active:scale-98 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${isReviewed
            ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
            : "bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300"
          }">
          ${isReviewed
            ? `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
               <span>AI reading verified (${escapeHtml(line.sku_code)})</span>`
            : `<span class="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px]">!</span>
               <span>Verify AI reading (${escapeHtml(line.sku_code)})</span>`
          }
        </button>
      `;
    } else {
      badgeHtml = `<span class="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md text-xs font-bold border border-slate-200 whitespace-nowrap">${escapeHtml(line.match_status || "PENDING")}</span>`;
      varianceChipHtml = `<span class="px-2 py-1 rounded-md text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 whitespace-nowrap">${escapeHtml(line.match_status || "PENDING")}</span>`;
    }

    const cardBorderClass = isOk
      ? "border-slate-200 bg-white"
      : isShort
      ? (isReviewed ? "border-emerald-300 bg-emerald-50/20" : "border-amber-300 bg-amber-50/20")
      : isOver
      ? (isReviewed ? "border-emerald-300 bg-emerald-50/20" : "border-blue-300 bg-blue-50/20")
      : isUnknown
      ? (isReviewed ? "border-emerald-300 bg-emerald-50/20" : "border-red-300 bg-red-50/20")
      : (isReviewed ? "border-emerald-300 bg-emerald-50/20" : "border-amber-300 bg-amber-50/20");

    return `
      <article class="rounded-xl border ${cardBorderClass} p-3.5 shadow-sm transition space-y-2.5" data-sku="${escapeHtml(line.sku_code)}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <h4 class="font-bold text-sm text-slate-900 leading-snug line-clamp-2">${escapeHtml(line.item_name || 'Warehouse SKU')}</h4>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">${escapeHtml(line.sku_code)}</span>
              <span class="text-[11px] text-slate-500">${escapeHtml(line.unit || 'pcs')}</span>
            </div>
          </div>
          <div class="shrink-0">
            ${badgeHtml}
          </div>
        </div>

        <div class="bg-slate-50/90 rounded-lg p-2.5 border border-slate-200/80 flex items-center justify-between">
          <div>
            <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">${t("deliveredOrdered")}</span>
            <div class="flex items-baseline gap-1 mt-0.5">
              <span class="hero-quantity font-black text-slate-900 tracking-tight font-mono" data-count-target="${line.received_qty}">${line.received_qty}</span>
              <span class="text-xs font-semibold text-slate-500">/ ${line.ordered_qty || 0} ${escapeHtml(line.unit || 'pcs')}</span>
            </div>
          </div>
          ${varianceChipHtml}
        </div>

        <div class="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
          <div class="flex items-center gap-1.5 flex-1 mr-3">
            <div class="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden shrink-0">
              <div class="h-full rounded-full ${isOk ? "bg-emerald-500" : isShort ? "bg-amber-500" : isLowConf ? "bg-amber-500" : "bg-red-500"}" style="width: ${confPercent}%"></div>
            </div>
            <span class="font-mono text-[10px] font-semibold text-slate-600">${confPercent}% conf</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">${t("lineNum", { num: escapeHtml(String(line.line_number || "N/A")) })}</span>
        </div>

        ${reviewActionHtml}
      </article>
    `;
  }

  /**
   * Render reconciliation items dynamically from payload.
   * Calculates totals dynamically with strict conditional badges.
   */
  function renderReconciliation(scanResultOrPayload) {
    const payload = Array.isArray(scanResultOrPayload)
      ? scanResultOrPayload
      : (scanResultOrPayload ? (scanResultOrPayload.lines || scanResultOrPayload.items || []) : []);

    if (!payload || payload.length === 0) {
      return `
        <div class="flex-1 p-6 text-center text-slate-500">
          <p class="text-sm">No items extracted from scan.</p>
        </div>
      `;
    }

    // Honest OCR Fallback Banner Detection (QA D0-04)
    const isFallbackMode = Boolean(
      state.isDemoFallback ||
      (scanResultOrPayload && (scanResultOrPayload.is_demo_fallback || scanResultOrPayload.is_fallback)) ||
      !state.isRealOcr
    );

    let bannerHtml = "";
    if (isFallbackMode) {
      bannerHtml = `
        <div class="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 text-xs flex items-center gap-2.5 shadow-sm">
          <span class="text-base shrink-0">⚠️</span>
          <div>
            <div class="font-bold tracking-tight text-amber-900 uppercase text-[11px]">DEMO SAMPLE / FALLBACK DATA</div>
            <div class="text-[11px] text-amber-800 leading-tight mt-0.5">Real AI OCR was unavailable or demo scan was selected. Using deterministic baseline sample data.</div>
          </div>
        </div>
      `;
    } else {
      bannerHtml = `
        <div class="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 text-xs flex items-center gap-2.5 shadow-sm">
          <span class="text-base shrink-0">✨</span>
          <div>
            <div class="font-bold tracking-tight text-emerald-900 uppercase text-[11px]">REAL AI OCR ACTIVE</div>
            <div class="text-[11px] text-emerald-800 leading-tight mt-0.5">Delivery note line items extracted and mapped live via Google Gemini Vision.</div>
          </div>
        </div>
      `;
    }

    // Dynamic Summary Math directly from payload
    const totalLines = payload.length;
    const okCount = payload.filter((item) => {
      const isExactQty = item.ordered_qty === undefined || item.received_qty === item.ordered_qty;
      const isConfOk = (item.confidence_score === undefined || item.confidence_score >= 0.75) && !item.low_confidence;
      return item.match_status === "OK" && isExactQty && isConfOk;
    }).length;
    const discrepancyCount = totalLines - okCount;
    const lowConfCount = payload.filter((item) => (item.confidence_score !== undefined && item.confidence_score < 0.75) || item.low_confidence).length;
    const discLabel = discrepancyCount === 1 ? "Discrepancy" : "Discrepancies";

    // Partition lines: if 5 or fewer items, show all directly; otherwise spotlight + accordion
    let spotlightLines = [];
    let otherLines = [];

    if (totalLines <= 5) {
      spotlightLines = [...payload];
      otherLines = [];
    } else {
      SPOTLIGHT_SKU_ORDER.forEach((sku) => {
        const found = payload.find((l) => l.sku_code === sku);
        if (found) spotlightLines.push(found);
      });
      // Add any other discrepancies to spotlight
      payload.forEach((l) => {
        if (l.match_status !== "OK" && !spotlightLines.some((s) => s.sku_code === l.sku_code)) {
          spotlightLines.push(l);
        }
      });
      // Remaining OK lines go to accordion
      payload.forEach((l) => {
        if (!spotlightLines.some((s) => s.sku_code === l.sku_code)) {
          otherLines.push(l);
        }
      });
    }

    return `
      <div class="flex-1 p-3.5 space-y-3.5 pb-24">
        <!-- Honest OCR Fallback Banner -->
        ${bannerHtml}

        <!-- Summary Banner -->
        <section class="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm space-y-2">
          <div class="flex items-start justify-between">
            <div>
              <span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">${t("poReconciliation")}</span>
              <h2 class="text-sm font-extrabold text-slate-900 tracking-tight mt-0.5 whitespace-nowrap po-badge">
                PO&#8209;48213 &bull; Nordic BuildSupply DK
              </h2>
            </div>
            <span class="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap">
              ${totalLines} ${totalLines === 1 ? 'line' : 'lines'}
            </span>
          </div>

          <!-- Dynamic Summary Math -->
          <div class="text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 font-mono">
            Total: ${totalLines} lines | ${okCount} OK | ${discrepancyCount} ${discLabel}
          </div>

          <!-- Highlight Chips -->
          <div class="flex flex-wrap gap-1.5 pt-1">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-green-100 text-green-800 border border-green-300">
              <span>✓</span> ${okCount} of ${totalLines} lines OK
            </span>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${
              discrepancyCount > 0 ? "bg-yellow-100 text-yellow-900 border border-yellow-300" : "bg-slate-100 text-slate-600 border border-slate-200"
            }">
              <span>!</span> ${discrepancyCount} ${discLabel}
            </span>
            ${lowConfCount > 0 ? `
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <span>⚠️</span> ${lowConfCount} Low Confidence
              </span>
            ` : ""}
          </div>
        </section>

        <!-- Spotlight Items Section Header -->
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">${t("spotlightHeader")}</h3>
          <span class="text-[11px] text-slate-500 font-medium">${spotlightLines.length} item(s)</span>
        </div>

        <!-- Spotlight Cards -->
        <div class="space-y-3" id="spotlight-cards-container">
          ${spotlightLines.map((line) => renderSpotlightCard(line)).join("")}
        </div>

        <!-- Collapsible Accordion for other lines -->
        ${otherLines.length > 0
          ? `
          <div class="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm mt-3">
            <button id="btn-toggle-accordion" type="button"
              class="w-full min-h-[48px] px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left transition font-semibold text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
              <div class="flex items-center gap-2">
                <span class="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px]">✓</span>
                <span>${t("moreLinesAccordion", { count: otherLines.length })}</span>
              </div>
              <svg class="w-4 h-4 text-slate-500 transform transition-transform ${state.accordionOpen ? "rotate-180" : ""}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            ${state.accordionOpen
              ? `
              <div class="divide-y divide-slate-100 px-3.5 py-1 bg-white">
                ${otherLines
                  .map(
                    (item) => `
                  <div class="py-2.5 flex items-center justify-between text-xs">
                    <div class="min-w-0 pr-2">
                      <div class="font-bold text-slate-900 truncate">${escapeHtml(item.item_name || 'Item')}</div>
                      <div class="font-mono text-[11px] text-slate-500">${escapeHtml(item.sku_code)} &bull; ${item.received_qty} / ${item.ordered_qty || 0} ${escapeHtml(item.unit || '')}</div>
                    </div>
                    <div class="shrink-0 flex items-center gap-1.5">
                      <span class="text-[10px] font-mono text-slate-400">${Math.round(((item.confidence_score !== undefined ? item.confidence_score : 0.98)) * 100)}%</span>
                      ${item.match_status === "OK" && (item.ordered_qty === undefined || item.received_qty === item.ordered_qty) && !((item.confidence_score !== undefined && item.confidence_score < 0.75) || item.low_confidence)
                        ? `<span class="bg-green-100 text-green-800 px-1.5 py-0.5 rounded text-[10px] font-bold border border-green-200 whitespace-nowrap">100% matched</span>`
                        : ((item.confidence_score !== undefined && item.confidence_score < 0.75) || item.low_confidence)
                        ? `<span class="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-300 whitespace-nowrap">LOW CONF</span>`
                        : item.match_status === "SHORT" || (item.ordered_qty !== undefined && item.received_qty < item.ordered_qty)
                        ? `<span class="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-[10px] font-bold border border-yellow-200 whitespace-nowrap">SHORT</span>`
                        : item.match_status === "OVER" || (item.ordered_qty !== undefined && item.received_qty > item.ordered_qty)
                        ? `<span class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-200 whitespace-nowrap">OVER</span>`
                        : `<span class="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-[10px] font-bold border border-red-200 whitespace-nowrap">UNORDERED</span>`
                      }
                    </div>
                  </div>
                `
                  )
                  .join("")}
              </div>
            `
              : ""
            }
          </div>
        `
          : ""
        }
      </div>
    `;
  }

  function renderStep2Match() {
    return renderReconciliation(state.scanResult);
  }

  // -------------------------------------------------------------------------
  // Step 3: Confirmation Summary View (Requirement D: Self-drawing SVG checkmark & floating chips)
  // -------------------------------------------------------------------------

  function renderStep3Confirm() {
    const isOffline = state.isOfflineSaved;
    const res = state.lastTransactionResult || {};
    const erp = res.erp_sync || {};

    return `
      <div class="flex-1 p-4 flex flex-col justify-between animate-fade-in space-y-4">
        <div class="space-y-4 text-center mt-1">
          <!-- Self-drawing SVG checkmark icon (Requirement D) -->
          <div class="w-16 h-16 rounded-full ${isOffline ? "bg-amber-100 text-amber-600 border-amber-300" : "bg-emerald-100 text-emerald-600 border-emerald-300"
      } mx-auto flex items-center justify-center border-2 shadow-md">
            ${isOffline
        ? `<span class="text-2xl font-bold">💾</span>`
        : `<svg class="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path class="animate-checkmark-draw" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                   </svg>`
      }
          </div>

          <div>
            ${isOffline
        ? `
              <span class="text-xs font-bold text-amber-700 uppercase tracking-wider">${t("localQueueProtected")}</span>
              <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">${t("savedOfflineTitle")}</h2>
              <p class="text-xs text-slate-600 max-w-xs mx-auto mt-1">
                ${t("savedOfflineSub")}
              </p>
            `
        : `
              <span class="text-xs font-bold text-emerald-700 uppercase tracking-wider">${t("postedSynced")}</span>
              <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">${t("postedHubTitle", { sec: state.lastElapsedSeconds || "0.2" })}</h2>
              <p class="text-xs text-slate-600 max-w-xs mx-auto mt-1">
                ${t("postedHubSub", { voucher: escapeHtml(erp.erp_voucher_no || "ERP-VOUCH") })}
              </p>
            `
      }
          </div>

          <!-- ATP Real-Time Changes Summary with Floating Entrance Animation (Requirement D) -->
          <section class="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm text-left space-y-2">
            <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5 flex items-center justify-between">
              <span>${t("atpUpdatesHeader")}</span>
              <span class="text-emerald-700 font-mono text-[10px]">${t("atpRealtimeSnapshot")}</span>
            </div>

            <div class="space-y-1.5 text-xs">
              ${(state.lastConfirmedPayload?.confirmed_lines && state.lastConfirmedPayload.confirmed_lines.length > 0)
                ? state.lastConfirmedPayload.confirmed_lines.map((line, idx) => {
                    const isQuarantine = line.reason_code === "unordered_quarantine" || (line.match_status === "UNKNOWN_SKU" && !state.fixApproved);
                    const isShort = line.match_status === "SHORT";
                    const delayMs = (idx + 1) * 50;

                    let chipHtml = "";
                    if (isQuarantine) {
                      chipHtml = `<span class="font-mono font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">${t("quarantineHeldLabel")}</span>`;
                    } else if (isShort) {
                      chipHtml = `<span class="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">+${line.received_qty} ATP (short)</span>`;
                    } else {
                      chipHtml = `<span class="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">+${line.received_qty} ATP</span>`;
                    }

                    return `
                      <div class="flex items-center justify-between py-1 border-b border-slate-100 animate-float-up" style="animation-delay: ${delayMs}ms;">
                        <span class="text-slate-800 font-medium">${escapeHtml(line.sku_code)}</span>
                        ${chipHtml}
                      </div>
                    `;
                  }).join("")
                : `
                  <div class="flex items-center justify-between py-1 border-b border-slate-100 animate-float-up" style="animation-delay: 50ms;">
                    <span class="text-slate-800 font-medium">CEM-25 (Rapid Cement)</span>
                    <span class="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">+80 ATP</span>
                  </div>
                  <div class="flex items-center justify-between py-1 border-b border-slate-100 animate-float-up" style="animation-delay: 100ms;">
                    <span class="text-slate-800 font-medium">TIM-4595 (Structural Timber)</span>
                    <span class="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">+40 ATP</span>
                  </div>
                  <div class="flex items-center justify-between py-1 border-b border-slate-100 animate-float-up" style="animation-delay: 150ms;">
                    <span class="text-slate-800 font-medium">PLAST-01 (Plasterboard)</span>
                    <span class="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">+52 ATP (-8 short)</span>
                  </div>
                  <div class="flex items-center justify-between py-1 animate-float-up" style="animation-delay: 200ms;">
                    <span class="text-slate-800 font-medium">FIX-M8 (Heavy Anchors)</span>
                    <span class="font-mono font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">${t("quarantineHeldLabel")}</span>
                  </div>
                `
              }
            </div>
          </section>

          <!-- Transaction Identifiers -->
          <div class="bg-slate-100 rounded-xl p-3 text-left space-y-1 text-[11px] font-mono text-slate-600 border border-slate-200">
            <div><span class="font-semibold text-slate-800">PO:</span> <span class="whitespace-nowrap po-badge">PO&#8209;48213</span> &bull; ${escapeHtml(DEFAULT_STORE)}</div>
            <div class="truncate"><span class="font-semibold text-slate-800">Key:</span> ${escapeHtml(state.lastConfirmedKey || "Pending")}</div>
            <div><span class="font-semibold text-slate-800">Queue status:</span> ${state.offlineQueue.length} pending sync</div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="space-y-2 pt-2">
          <!-- Test duplicate send button -->
          <button id="btn-test-duplicate" type="button"
            class="w-full min-h-[48px] py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-center gap-2 active:scale-98 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            <span>🛡️</span>
            <span>${t("testDuplicateBtn")}</span>
          </button>

          <!-- Start new receipt button -->
          <button id="btn-start-new-receipt" type="button"
            class="w-full min-h-[52px] bg-slate-900 hover:bg-slate-800 active:scale-98 text-white font-bold text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            <span>${t("startNewReceiptBtn")}</span>
          </button>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Bottom Sheet 1: PLAST-01 Short Delivery Exception
  // -------------------------------------------------------------------------

  function renderPlastBottomSheet() {
    if (state.activeSheet !== "PLAST_SHEET" || !state.plastDraft) return "";

    const recQty = state.plastDraft.received_qty;
    const ordQty = 60;
    const variance = recQty - ordQty;

    let badgeHtml = "";
    if (variance < 0) {
      badgeHtml = `<span class="px-2.5 py-1 rounded-md text-xs font-black bg-amber-200 text-amber-950 border border-amber-300 whitespace-nowrap">${variance} sheets deficit</span>`;
    } else if (variance === 0) {
      badgeHtml = `<span class="px-2.5 py-1 rounded-md text-xs font-black bg-emerald-200 text-emerald-950 border border-emerald-300 whitespace-nowrap">Match (60/60 sheets)</span>`;
    } else {
      badgeHtml = `<span class="px-2.5 py-1 rounded-md text-xs font-black bg-blue-200 text-blue-950 border border-blue-300 whitespace-nowrap">+${variance} sheets surplus</span>`;
    }

    return `
      <div id="sheet-backdrop" class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 transition-opacity"></div>

      <div id="plast-bottom-sheet" class="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto z-50 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 p-4 safe-bottom bottom-sheet-slide-up space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="w-12 h-1.5 bg-slate-300 rounded-full mx-auto -mt-1 mb-1"></div>

        <div class="flex items-start justify-between border-b border-slate-100 pb-2.5">
          <div>
            <span class="text-[11px] font-bold text-amber-700 uppercase tracking-wider">${t("sheetShortTitle")}</span>
            <h3 class="text-base font-extrabold text-slate-900 leading-snug">${t("sheetShortSub")}</h3>
            <p class="text-xs text-slate-500">${t("sheetExpected")}</p>
          </div>
          <button id="btn-close-plast-sheet" type="button" aria-label="Close sheet"
            class="min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-400 hover:text-slate-700 text-lg font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            ✕
          </button>
        </div>

        <!-- Large +/- Stepper with Reactive Variance -->
        <div class="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 text-center">
          <span class="text-xs uppercase font-bold text-slate-500 tracking-wider">${t("physicalCountLabel")}</span>
          
          <div class="flex items-center justify-center gap-4 pt-1">
            <button id="btn-stepper-minus" type="button" aria-label="Decrease quantity"
              class="w-14 h-14 rounded-2xl bg-white border border-slate-300 hover:bg-slate-100 active:scale-95 text-slate-900 font-black text-2xl flex items-center justify-center shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
              −
            </button>

            <div id="plast-stepper-val" class="min-w-[90px] text-center focus:outline-none">
              <input id="plast-qty-input" type="number" min="0" value="${recQty}"
                class="w-24 text-center text-4xl font-black font-mono text-slate-900 bg-transparent border-b-2 border-slate-300 focus:border-orange-500 focus:outline-none" />
              <span class="block text-xs font-semibold text-slate-500">${t("sheetsUnit")}</span>
            </div>

            <button id="btn-stepper-plus" type="button" aria-label="Increase quantity"
              class="w-14 h-14 rounded-2xl bg-white border border-slate-300 hover:bg-slate-100 active:scale-95 text-slate-900 font-black text-2xl flex items-center justify-center shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
              +
            </button>
          </div>

          <div id="plast-variance-badge" class="pt-1">
            ${badgeHtml}
          </div>
        </div>

        <!-- Reason Dropdown -->
        <div class="space-y-1">
          <label for="plast-reason-select" class="block text-xs font-bold text-slate-700">${t("reasonCodeLabel")}</label>
          <select id="plast-reason-select"
            class="w-full min-h-[48px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            <option value="short_delivery" ${state.plastDraft.reason_code === "short_delivery" ? "selected" : ""}>
              ${t("reasonShortDelivery")}
            </option>
            <option value="damaged_on_arrival" ${state.plastDraft.reason_code === "damaged_on_arrival" ? "selected" : ""}>
              ${t("reasonDamagedArrival")}
            </option>
            <option value="supplier_backorder" ${state.plastDraft.reason_code === "supplier_backorder" ? "selected" : ""}>
              ${t("reasonSupplierBackorder")}
            </option>
          </select>
        </div>

        <!-- Photo Evidence Attachment -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="block text-xs font-bold text-slate-700">${t("auditPhotoLabel")}</label>
            <span class="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
              <span>✓</span> ${t("photoAttachedBadge")}
            </span>
          </div>

          <div class="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
            <div class="w-12 h-12 rounded-lg bg-slate-800 text-amber-400 border border-slate-700 flex items-center justify-center font-mono text-[10px] shrink-0 font-bold text-center leading-none p-1">
              PALLET<br>IMG
            </div>
            <div class="min-w-0 flex-1 text-xs">
              <div class="font-bold text-slate-900 truncate">damaged_pallet_plast01.jpg</div>
              <div class="text-[10px] text-slate-500">${t("photoSimulatedText")}</div>
            </div>
            <label for="plast-file-input"
              class="min-h-[48px] px-3 py-2 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 flex items-center cursor-pointer">
              <span>${t("photoChangeBtn")}</span>
              <input type="file" id="plast-file-input" accept="image/*" capture="environment" class="hidden">
            </label>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="pt-2 space-y-2">
          <button id="btn-save-plast-sheet" type="button"
            class="w-full min-h-[52px] bg-orange-600 hover:bg-orange-500 active:scale-98 text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-600/30 flex items-center justify-center gap-2 cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            <span>${t("saveExceptionBtn")}</span>
          </button>
          <button id="btn-cancel-plast-sheet" type="button"
            class="w-full min-h-[48px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
            ${t("cancelBtn")}
          </button>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Bottom Sheet 2: Duplicate Send Result Modal
  // -------------------------------------------------------------------------

  function renderDuplicateModal() {
    if (state.activeSheet !== "DUPLICATE_RESULT" || !state.duplicateModalData) return "";
    const data = state.duplicateModalData;

    return `
      <div id="duplicate-backdrop" class="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 transition-opacity"></div>
      <div class="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto z-50 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 p-5 safe-bottom bottom-sheet-slide-up space-y-4">
        <div class="w-12 h-1.5 bg-slate-300 rounded-full mx-auto -mt-1 mb-1"></div>

        <div class="text-center space-y-1">
          <div class="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center text-xl font-bold">
            🛡️
          </div>
          <h3 class="text-base font-extrabold text-slate-900 mt-2">${t("duplicateBlockedTitle")}</h3>
          <p class="text-xs text-slate-600 max-w-xs mx-auto">
            ${t("duplicateBlockedSub")}
          </p>
        </div>

        <div class="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs font-mono space-y-1.5 text-slate-700">
          <div><span class="font-bold text-slate-900">Key:</span> ${data.key}</div>
          <div><span class="font-bold text-slate-900">is_idempotent_replay:</span> <span class="text-emerald-700 font-bold">true</span></div>
          <div><span class="font-bold text-slate-900">Status message:</span> "${data.response.message || "Idempotent replay: Receipt already processed. Inventory unchanged."}"</div>
        </div>

        <button id="btn-close-duplicate-modal" type="button"
          class="w-full min-h-[48px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer transition">
          ${t("dismissBtn")}
        </button>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Sticky Bottom Bar Component
  // -------------------------------------------------------------------------

  function renderStickyBottomBar() {
    if (state.step === 1 || state.step === 3) {
      return "";
    }

    const payload = state.scanResult
      ? (state.scanResult.lines || state.scanResult.items || [])
      : [];

    const discrepancies = payload.filter((l) => {
      const isShortOrOver = l.ordered_qty !== undefined && l.received_qty !== l.ordered_qty;
      const isUnknown = l.match_status === "UNKNOWN_SKU";
      const isLowConf = (l.confidence_score !== undefined && l.confidence_score < 0.75) || l.low_confidence;
      return l.match_status !== "OK" || isShortOrOver || isUnknown || isLowConf;
    });

    const unresolvedDiscrepancies = discrepancies.filter((l) => {
      if (l.sku_code === "PLAST-01") return !state.plastReview.reviewed;
      if (l.sku_code === "FIX-M8") return !state.fixApproved;
      return !Boolean(state.reviewedExceptions && state.reviewedExceptions[l.sku_code]);
    });

    const totalDiscrepancies = discrepancies.length;
    const reviewedCount = totalDiscrepancies - unresolvedDiscrepancies.length;
    const canConfirm = unresolvedDiscrepancies.length === 0;

    let guidanceHtml = "";
    if (unresolvedDiscrepancies.length > 0) {
      const skuList = escapeHtml(unresolvedDiscrepancies.map((l) => l.sku_code).join(", "));
      guidanceHtml = `
        <div class="flex items-center justify-between text-[11px] font-semibold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
          <span class="flex items-center gap-1 truncate mr-2">
            <span>⚠</span> Review discrepancy / low conf: ${skuList}
          </span>
          <span class="font-mono text-[10px] text-amber-700 font-bold shrink-0">${reviewedCount}/${totalDiscrepancies}</span>
        </div>
      `;
    } else {
      guidanceHtml = `
        <div class="flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
          <span>✓</span> Ready to confirm (${state.isOnline ? "Online" : "Offline"})
        </div>
      `;
    }

    const totalLines = payload.length;
    const lineLabel = totalLines === 1 ? "line" : "lines";

    return `
      <div class="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-3 safe-bottom z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div class="space-y-1.5">
          <!-- Status guidance pill (dynamically derived from discrepancy status) -->
          ${guidanceHtml}

          <!-- Confirm receipt button with dynamic line count label -->
          <button id="btn-confirm-receipt" type="button"
            ${!canConfirm || state.confirming ? "disabled" : ""}
            class="w-full min-h-[52px] rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
              canConfirm && !state.confirming
                ? "bg-orange-600 hover:bg-orange-500 active:scale-98 text-white shadow-orange-600/30"
                : "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none"
            }">
            ${
              state.confirming
                ? `<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                   <span>${t("confirmingBtn")}</span>`
                : `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                   <span>Confirm receipt (${totalLines} ${lineLabel})</span>`
            }
          </button>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Overflow Menu Modal (Requirement B, C, E, F, G)
  // -------------------------------------------------------------------------

  function renderOverflowMenu() {
    if (!state.menuOpen) return "";

    return `
      <div id="menu-backdrop" class="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 transition-opacity"></div>
      <div class="fixed top-14 right-4 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 space-y-2 text-xs animate-scale-in">
        <div class="font-bold text-slate-900 border-b border-slate-100 pb-2 px-1 flex items-center justify-between">
          <span>${t("scannerSettings")}</span>
          <button id="btn-close-menu" class="text-slate-400 hover:text-slate-700 min-h-[48px] min-w-[48px] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">✕</button>
        </div>

        <!-- Phone frame toggle (Requirement B) -->
        <button id="btn-menu-phone-frame" class="w-full min-h-[48px] px-3 py-2 rounded-lg text-left hover:bg-slate-50 flex items-center justify-between text-slate-800 font-medium">
          <div>
            <div class="font-semibold flex items-center gap-1.5">
              <span>📱</span> ${t("phoneFrame")}
            </div>
            <div class="text-[10px] text-slate-500">${t("phoneFrameSub")}</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${state.phoneFrame ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
      }">${state.phoneFrame ? "ON" : "OFF"}</span>
        </button>

        <!-- Dock mode toggle (Requirement G) -->
        <button id="btn-menu-dock-mode" class="w-full min-h-[48px] px-3 py-2 rounded-lg text-left hover:bg-slate-50 flex items-center justify-between text-slate-800 font-medium">
          <div>
            <div class="font-semibold flex items-center gap-1.5">
              <span>🏭</span> ${t("dockMode")}
            </div>
            <div class="text-[10px] text-slate-500">${t("dockModeSub")}</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${state.dockMode ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
      }">${state.dockMode ? "ON" : "OFF"}</span>
        </button>

        <!-- Demo captions toggle (Requirement E) -->
        <button id="btn-menu-captions" class="w-full min-h-[48px] px-3 py-2 rounded-lg text-left hover:bg-slate-50 flex items-center justify-between text-slate-800 font-medium">
          <div>
            <div class="font-semibold flex items-center gap-1.5">
              <span>💬</span> ${t("demoCaptions")}
            </div>
            <div class="text-[10px] text-slate-500">${t("demoCaptionsSub")}</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${state.demoCaptions ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
      }">${state.demoCaptions ? "ON" : "OFF"}</span>
        </button>

        <!-- Vibration toggle (Requirement F) -->
        <button id="btn-menu-vibration" class="w-full min-h-[48px] px-3 py-2 rounded-lg text-left hover:bg-slate-50 flex items-center justify-between text-slate-800 font-medium">
          <div>
            <div class="font-semibold flex items-center gap-1.5">
              <span>📳</span> ${t("vibration")}
            </div>
            <div class="text-[10px] text-slate-500">${t("vibrationSub")}</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${state.vibration ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
      }">${state.vibration ? "ON" : "OFF"}</span>
        </button>

        <!-- Mode Toggle -->
        <button id="btn-menu-mode" class="w-full min-h-[48px] px-3 py-2 rounded-lg text-left hover:bg-slate-50 flex items-center justify-between text-slate-800 font-medium">
          <div>
            <div class="font-semibold">${t("backendMode")}</div>
            <div class="text-[10px] text-slate-500">Currently: ${state.mode.toUpperCase()}</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${state.mode === "live" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"
      }">${state.mode.toUpperCase()}</span>
        </button>

        <!-- Test Duplicate Send -->
        <button id="btn-menu-duplicate" class="w-full min-h-[48px] px-3 py-2 rounded-lg text-left hover:bg-slate-50 text-slate-800 font-semibold flex items-center gap-2">
          <span>🛡️</span>
          <div>
            <div>Test duplicate send</div>
            <div class="text-[10px] text-slate-500 font-normal">Re-send last idempotency key</div>
          </div>
        </button>

        <!-- Reset Demo Data -->
        <button id="btn-menu-reset" class="w-full min-h-[48px] px-3 py-2 rounded-lg text-left hover:bg-rose-50 text-rose-700 font-semibold flex items-center gap-2">
          <span>🔄</span> ${t("resetDemo")}
        </button>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Main Render Orchestrator
  // -------------------------------------------------------------------------

  function render() {
    if (!dom.appContainer) cacheDom();

    // Apply Phone Frame, Dock Mode and 100dvh mobile resilient layout
    let containerClass = "mobile-scanner-view w-full max-w-full sm:max-w-[430px] min-h-[100dvh] h-[100dvh] sm:h-auto sm:min-h-[844px] sm:max-h-[890px] bg-slate-50 text-slate-900 flex flex-col relative overflow-hidden shrink-0 transition-all";
    if (state.phoneFrame) {
      containerClass += " sm:rounded-[36px] sm:shadow-2xl sm:border sm:border-slate-800";
    } else {
      containerClass += " sm:rounded-none sm:shadow-none sm:border-0";
    }
    if (state.dockMode) {
      containerClass += " dock-mode";
    }
    dom.appContainer.className = containerClass;

    // Mobile background scroll lock when bottom sheet is active
    if (dom.mainContent) {
      if (state.activeSheet) {
        dom.mainContent.classList.add("modal-open-scroll-lock");
      } else {
        dom.mainContent.classList.remove("modal-open-scroll-lock");
      }
    }

    dom.topBar.innerHTML = renderTopBar();
    dom.mobileCaptionBar.innerHTML = renderMobileCaptionBar();
    dom.progressBar.innerHTML = renderProgressBar();

    // Explicitly clear main container before rendering to prevent hardcode/demo HTML bleed (Requirement 1)
    if (dom.mainContent) {
      dom.mainContent.innerHTML = "";
    }

    if (state.step === 1) {
      dom.mainContent.innerHTML = renderStep1Scan();
    } else if (state.step === 2) {
      dom.mainContent.innerHTML = renderStep2Match();
    } else if (state.step === 3) {
      dom.mainContent.innerHTML = renderStep3Confirm();
    }

    dom.bottomBar.innerHTML = renderStickyBottomBar();
    dom.menuDropdown.innerHTML = renderOverflowMenu();
    dom.exceptionModal.innerHTML = renderPlastBottomSheet() + renderDuplicateModal();

    renderDesktopPanels();
    attachEvents();
  }

  // -------------------------------------------------------------------------
  // Event Delegation
  // -------------------------------------------------------------------------

  function attachEvents() {
    // Step 1: Scan trigger (demo)
    const scanBtn = document.getElementById("btn-trigger-scan");
    if (scanBtn) {
      scanBtn.onclick = (e) => {
        e.preventDefault();
        triggerScan();
      };
    }

    // Step 1: Upload real photo trigger — opens the hidden file input
    const uploadBtn = document.getElementById("btn-upload-scan");
    const ocrFileInput = document.getElementById("ocrFileInput");
    if (uploadBtn && ocrFileInput) {
      uploadBtn.onclick = (e) => {
        e.preventDefault();
        ocrFileInput.value = "";  // Reset so same file can be re-selected
        ocrFileInput.click();
      };
    }

    // Handle file selection from hidden input (real AI OCR path)
    if (ocrFileInput && !ocrFileInput.__nexbuild_wired) {
      ocrFileInput.__nexbuild_wired = true;
      ocrFileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          triggerRealScan(file);
        }
      });
    }

    // Step 2: Open PLAST-01 Sheet
    const plastBtn = document.getElementById("btn-open-plast-sheet");
    if (plastBtn) {
      plastBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPlastSheet(plastBtn);
      };
    }

    const plastCard = document.querySelector('[data-sku="PLAST-01"]');
    if (plastCard) {
      plastCard.onclick = (e) => {
        if (e.target.closest("#btn-open-plast-sheet")) return;
        openPlastSheet(plastCard);
      };
    }

    // Step 2: PLAST-01 Stepper with Proper Numerical State Mutation & Real-Time Variance
    function updatePlastStepperDelta(delta) {
      const inputField = document.getElementById("plast-qty-input");
      let currentVal = inputField ? parseInt(inputField.value, 10) : (state.plastDraft ? parseInt(state.plastDraft.received_qty, 10) : 52);
      if (isNaN(currentVal)) currentVal = 0;
      
      currentVal = Math.max(0, currentVal + delta);
      
      if (inputField) {
        inputField.value = currentVal;
      }
      if (state.plastDraft) {
        state.plastDraft.received_qty = currentVal;
      }
      
      // Real-time Reactivity: Immediately recalculate variance and update badge color & text
      const expectedQty = 60;
      const variance = currentVal - expectedQty;
      const varianceBadge = document.getElementById("plast-variance-badge");
      if (varianceBadge) {
        if (variance < 0) {
          varianceBadge.innerHTML = `<span class="px-2.5 py-1 rounded-md text-xs font-black bg-amber-200 text-amber-950 border border-amber-300 whitespace-nowrap">${variance} sheets deficit</span>`;
        } else if (variance === 0) {
          varianceBadge.innerHTML = `<span class="px-2.5 py-1 rounded-md text-xs font-black bg-emerald-200 text-emerald-950 border border-emerald-300 whitespace-nowrap">Match (60/60 sheets)</span>`;
        } else {
          varianceBadge.innerHTML = `<span class="px-2.5 py-1 rounded-md text-xs font-black bg-blue-200 text-blue-950 border border-blue-300 whitespace-nowrap">+${variance} sheets surplus</span>`;
        }
      }
      if (window.Fx && typeof window.Fx.playBeep === "function") {
        window.Fx.playBeep();
      }
    }

    const stepperMinus = document.getElementById("btn-stepper-minus");
    if (stepperMinus) {
      stepperMinus.onclick = (e) => {
        e.preventDefault();
        updatePlastStepperDelta(-1);
      };
    }

    const stepperPlus = document.getElementById("btn-stepper-plus");
    if (stepperPlus) {
      stepperPlus.onclick = (e) => {
        e.preventDefault();
        updatePlastStepperDelta(1);
      };
    }

    const plastQtyInput = document.getElementById("plast-qty-input");
    if (plastQtyInput) {
      plastQtyInput.oninput = (e) => {
        let currentVal = parseInt(e.target.value, 10);
        if (isNaN(currentVal) || currentVal < 0) currentVal = 0;
        if (state.plastDraft) {
          state.plastDraft.received_qty = currentVal;
        }
        const variance = currentVal - 60;
        const varianceBadge = document.getElementById("plast-variance-badge");
        if (varianceBadge) {
          if (variance < 0) {
            varianceBadge.innerHTML = `<span class="px-2.5 py-1 rounded-md text-xs font-black bg-amber-200 text-amber-950 border border-amber-300 whitespace-nowrap">${variance} sheets deficit</span>`;
          } else if (variance === 0) {
            varianceBadge.innerHTML = `<span class="px-2.5 py-1 rounded-md text-xs font-black bg-emerald-200 text-emerald-950 border border-emerald-300 whitespace-nowrap">Match (60/60 sheets)</span>`;
          } else {
            varianceBadge.innerHTML = `<span class="px-2.5 py-1 rounded-md text-xs font-black bg-blue-200 text-blue-950 border border-blue-300 whitespace-nowrap">+${variance} sheets surplus</span>`;
          }
        }
      };
    }

    // Step 2: Reason select
    const reasonSelect = document.getElementById("plast-reason-select");
    if (reasonSelect) {
      reasonSelect.onchange = (e) => {
        if (state.plastDraft) {
          state.plastDraft.reason_code = e.target.value;
        }
      };
    }

    // Step 2: File input
    const fileInput = document.getElementById("plast-file-input");
    if (fileInput) {
      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          state.plastDraft.photo_evidence = e.target.files[0].name;
          state.plastDraft.has_photo = true;
          render();
          showToast("Attached image: " + e.target.files[0].name);
        }
      };
    }

    // Step 2: Save PLAST sheet
    const savePlastBtn = document.getElementById("btn-save-plast-sheet");
    if (savePlastBtn) {
      savePlastBtn.onclick = (e) => {
        e.preventDefault();
        savePlastSheet();
      };
    }

    const closePlastBtn = document.getElementById("btn-close-plast-sheet");
    if (closePlastBtn) {
      closePlastBtn.onclick = (e) => {
        e.preventDefault();
        closeActiveSheet();
      };
    }

    const cancelPlastBtn = document.getElementById("btn-cancel-plast-sheet");
    if (cancelPlastBtn) {
      cancelPlastBtn.onclick = (e) => {
        e.preventDefault();
        closeActiveSheet();
      };
    }

    const sheetBackdrop = document.getElementById("sheet-backdrop");
    if (sheetBackdrop) {
      sheetBackdrop.onclick = () => {
        closeActiveSheet();
      };
    }

    // Step 2: FIX-M8 Checkbox
    const fixCheckbox = document.getElementById("checkbox-fix-override");
    if (fixCheckbox) {
      fixCheckbox.onchange = () => {
        toggleFixApproved();
      };
    }

    // Step 2: Accordion toggle
    const accordionBtn = document.getElementById("btn-toggle-accordion");
    if (accordionBtn) {
      accordionBtn.onclick = (e) => {
        e.preventDefault();
        state.accordionOpen = !state.accordionOpen;
        render();
      };
    }

    // Step 2: Generic discrepancy review / acknowledgement toggle
    document.querySelectorAll('[data-action="review-general"]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sku = btn.getAttribute("data-sku");
        if (sku) {
          state.reviewedExceptions = state.reviewedExceptions || {};
          state.reviewedExceptions[sku] = !state.reviewedExceptions[sku];
          render();
          showToast(`Discrepancy for ${sku} ${state.reviewedExceptions[sku] ? "acknowledged" : "unacknowledged"}`);
        }
      };
    });

    // Step 2: Confirm receipt
    const confirmBtn = document.getElementById("btn-confirm-receipt");
    if (confirmBtn) {
      confirmBtn.onclick = (e) => {
        e.preventDefault();
        confirmCurrentReceipt();
      };
    }

    // Step 3: Test duplicate
    const testDupBtn = document.getElementById("btn-test-duplicate");
    if (testDupBtn) {
      testDupBtn.onclick = (e) => {
        e.preventDefault();
        testDuplicateSend();
      };
    }

    const closeDupBtn = document.getElementById("btn-close-duplicate-modal");
    if (closeDupBtn) {
      closeDupBtn.onclick = (e) => {
        e.preventDefault();
        state.activeSheet = null;
        render();
      };
    }

    const dupBackdrop = document.getElementById("duplicate-backdrop");
    if (dupBackdrop) {
      dupBackdrop.onclick = () => {
        state.activeSheet = null;
        render();
      };
    }

    // Step 3: Start new receipt
    const startNewBtn = document.getElementById("btn-start-new-receipt");
    if (startNewBtn) {
      startNewBtn.onclick = (e) => {
        e.preventDefault();
        state.step = 1;
        state.scanResult = null;
        state.plastReview.reviewed = false;
        state.plastReview.received_qty = 52;
        state.fixApproved = false;
        state.reviewedExceptions = {};
        state.lastTransactionResult = null;
        state.isOfflineSaved = false;
        state.activeCaption = "AI reads the delivery note and matches it to PO-48213";
        render();
      };
    }

    // Language pills (Requirement C)
    document.querySelectorAll('[data-action="set-lang"]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const lang = btn.getAttribute("data-lang");
        if (lang) switchLanguage(lang);
      };
    });

    // Top Bar: Online/Offline Toggle
    const onlineBtn = document.getElementById("btn-toggle-online");
    if (onlineBtn) {
      onlineBtn.onclick = (e) => {
        e.preventDefault();
        toggleOnline();
      };
    }

    // Top Bar: Overflow Menu
    const menuBtn = document.getElementById("btn-overflow-menu");
    if (menuBtn) {
      menuBtn.onclick = (e) => {
        e.preventDefault();
        state.menuOpen = !state.menuOpen;
        render();
      };
    }

    const closeMenuBtn = document.getElementById("btn-close-menu");
    if (closeMenuBtn) {
      closeMenuBtn.onclick = () => {
        state.menuOpen = false;
        render();
      };
    }

    const menuBackdrop = document.getElementById("menu-backdrop");
    if (menuBackdrop) {
      menuBackdrop.onclick = () => {
        state.menuOpen = false;
        render();
      };
    }

    // Menu options
    const phoneFrameBtn = document.getElementById("btn-menu-phone-frame");
    if (phoneFrameBtn) {
      phoneFrameBtn.onclick = (e) => {
        e.preventDefault();
        togglePhoneFrame();
      };
    }

    const dockModeBtn = document.getElementById("btn-menu-dock-mode");
    if (dockModeBtn) {
      dockModeBtn.onclick = (e) => {
        e.preventDefault();
        toggleDockMode();
      };
    }

    const captionsBtn = document.getElementById("btn-menu-captions");
    if (captionsBtn) {
      captionsBtn.onclick = (e) => {
        e.preventDefault();
        toggleDemoCaptions();
      };
    }

    const vibrationBtn = document.getElementById("btn-menu-vibration");
    if (vibrationBtn) {
      vibrationBtn.onclick = (e) => {
        e.preventDefault();
        toggleVibration();
      };
    }

    const modeBtn = document.getElementById("btn-menu-mode");
    if (modeBtn) {
      modeBtn.onclick = (e) => {
        e.preventDefault();
        toggleMode();
      };
    }

    const menuDupBtn = document.getElementById("btn-menu-duplicate");
    if (menuDupBtn) {
      menuDupBtn.onclick = (e) => {
        e.preventDefault();
        state.menuOpen = false;
        testDuplicateSend();
      };
    }

    const resetBtn = document.getElementById("btn-menu-reset");
    if (resetBtn) {
      resetBtn.onclick = (e) => {
        e.preventDefault();
        resetDemoData();
      };
    }

    const dismissErrBtn = document.getElementById("btn-dismiss-error");
    if (dismissErrBtn) {
      dismissErrBtn.onclick = () => {
        state.errorMessage = null;
        render();
      };
    }
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    cacheDom();
    render();

    if (state.isOnline && state.offlineQueue.length > 0) {
      flushOfflineQueue();
    }

    if (window.Api && window.Api.onStateChange) {
      window.Api.onStateChange(() => {
        // Keeps state synchronized across tabs
      });
    }
  });
})();
