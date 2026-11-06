/**
 * NexBuild Cloud Hub - Internationalization (i18n) Module
 * Seamless, zero-reload translation across English, Dansk, and Tiếng Việt.
 * Supports DOM attribute 'data-i18n' for automatic element translation,
 * template variable interpolation '{var}', and localStorage persistence.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.I18n = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "nbx_lang";
  const DEFAULT_LANG = "en";
  const SUPPORTED_LANGS = ["en", "da", "vi"];

  const translations = {
    en: {
      // Common & Navigation
      scan: "Scan",
      confirm: "Confirm",
      refresh: "Refresh",
      resetDemo: "Reset Demo",
      live: "LIVE",
      online: "Online",
      offline: "Offline",
      mode: "Mode",
      hubScannerTitle: "Denmark Receiving Scanner",
      storeCounterTitle: "DK-Aarhus-01 • Store Counter",
      storeCounterSub: "Real-Time Available-To-Promise (ATP) & On-Hand Inventory Lookup",
      salesDesk: "Sales Desk 01",
      liveHubSync: "Live Hub Sync",
      openScannerTab: "Open Scanner Tab",
      catalogSkus: "Catalog SKUs",
      activeInHub: "Active in Hub",
      sellableAtpStock: "Sellable ATP Stock",
      available: "Available",
      quarantinedUnits: "Quarantined Units",
      heldInBay: "Held in Bay GL-DK-9900",
      dataFreshness: "Data Freshness",
      subSecondFresh: "Sub-Second Fresh",
      searchPlaceholder: "Search by SKU, description, category, or aisle...",
      allCategories: "All Categories",
      colSku: "SKU Code",
      colDescription: "Description",
      colCategory: "Category",
      colLocation: "Location",
      colPhysical: "Physical On-Hand",
      colAtp: "Available-To-Promise (ATP)",
      colQuarantine: "Quarantine",
      colTrust: "Trust Status",
      colLastUpdated: "Last Updated",
      loadingInventory: "Loading real-time Denmark Hub inventory...",
      queueBadge: "Queue",
      queueCount: "{count} queued",

      // Workflow Steps
      step1: "Scan",
      step2: "Match to PO",
      step3: "Confirm",

      // Step 1: Scan
      targetPoLabel: "Target purchase order",
      hubLocation: "Nordic BuildSupply DK • Denmark Hub",
      linesExpected: "14 lines expected",
      inboundDeliveryNote: "Inbound Delivery Note",
      scanHelpText: "Hold physical paper note in camera view to auto-extract SKUs, units, and delivered quantities.",
      scanDemoButton: "Scan demo delivery note",
      scanScanningTitle: "Scanning delivery note...",
      scanReconcilingText: "Reconciling with purchase order PO-48213",
      standardProcedureTitle: "Standard Receiving Procedure:",
      procedure1: "Scan supplier delivery note at unloading dock",
      procedure2: "Reconcile scanned line counts against ERP purchase order",
      procedure3: "Document exceptions before updating sellable ATP",

      // Step 2: Match to PO
      poReconciliation: "Purchase Order Reconciliation",
      linesCount: "{count} lines",
      linesOkChip: "{ok} of {total} lines OK",
      discrepanciesChip: "{count} discrepancies",
      lowConfidenceChip: "{count} low confidence",
      spotlightHeader: "Spotlight Items (4)",
      spotlightSub: "Exceptions require review before posting",
      deliveredOrdered: "Delivered / Ordered",
      matchedOk: "100% matched",
      aiConfidence: "{percent}% AI confidence",
      lineNum: "Line {num}",
      moreLinesAccordion: "{count} more lines match the PO (100% OK)",

      // Discrepancy & Status
      statusOk: "OK",
      statusShort: "SHORT",
      statusUnknown: "UNKNOWN SKU",
      shortDeficitChip: "{count} short",
      unorderedChip: "+{count} unordered",
      shortWarningTitle: "Short delivery (-8 sheets)",
      shortWarningText: "Physical count 52 is less than expected 60. Photo audit required.",
      reviewShortAction: "Review short delivery exception",
      reviewedShortStatus: "Reviewed (-8 short • photo attached)",

      // FIX-M8 Quarantine
      quarantineBanner: "Not on PO. 12 units will be held in quarantine (GL-DK-9900) and will NOT be added to sellable stock.",
      lowConfidenceNote: "Low AI confidence: 68%",
      managerApprovalCheckbox: "Manager approved receipt of unordered item",
      managerApprovalSub: "Approved • Sends accept_unordered_override",
      managerApprovalPrompt: "Check to authorize receipt onto inventory",

      // Bottom Bar
      guideReviewBoth: "Review PLAST-01 & approve FIX-M8",
      guideReviewPlast: "Review PLAST-01 shortage",
      guideApproveFix: "Approve FIX-M8 quarantine override",
      guideReady: "Ready to confirm receipt ({mode})",
      confirmReceiptBtn: "Confirm receipt (14 lines)",
      confirmingBtn: "Posting to Hub...",

      // Bottom Sheet (PLAST-01 Stepper Modal)
      sheetShortTitle: "Short Delivery Review",
      sheetShortSub: "PLAST-01 • Gyproc Plasterboard",
      sheetExpected: "Expected: 60 sheets • Supplier: Nordic BuildSupply DK",
      physicalCountLabel: "Verified Physical Count",
      sheetsUnit: "sheets",
      deficitLabel: "{count} sheets deficit",
      surplusLabel: "+{count} sheets surplus",
      matchLabel: "Match (60/60 sheets)",
      reasonCodeLabel: "Reason code (exact API value)",
      reasonShortDelivery: "short_delivery - Supplier under-shipped",
      reasonDamagedArrival: "damaged_on_arrival - Destroyed in transit",
      reasonSupplierBackorder: "supplier_backorder - Split consignment",
      auditPhotoLabel: "Damaged packaging photo",
      photoAttachedBadge: "Photo attached & verified",
      photoSimulatedText: "Simulated warehouse camera capture (1080p)",
      photoChangeBtn: "Retake",
      notesLabel: "Receiving notes (optional)",
      saveExceptionBtn: "Save exception & continue",

      // Event Logs (Minimalist Data Badges)
      eventScanComplete: "[SCAN] PO-48213 Reconciled (14 lines: 12 OK, 2 variances)",
      eventPlastReviewed: "[EXCEPTION] PLAST-01 Verified (52 sheets, photo logged)",
      eventQuarantineApproved: "[OVERRIDE] FIX-M8 Manager Override Approved",
      eventQuarantineHeld: "[QUARANTINE] FIX-M8 Routed to Bay GL-DK-9900",
      eventConfirmPosted: "[SUCCESS] ATP Updated (<15ms) • ERP Synced",
      eventConfirmQueued: "[OFFLINE] Receipt Queued ({key})",
      eventQueueSyncStart: "[SYNC] Flushing offline queue ({count} pending)...",
      eventQueueSynced: "[SYNC] Offline queue synced: 0 pending",
      eventDuplicateBlocked: "[IDEMPOTENT] Replay Sealed (0 duplicate stock)",
      eventDemoReset: "[RESET] Baseline Seeded (<15ms)",
    },

    da: {
      // Common & Navigation
      scan: "Scan",
      confirm: "Bekræft",
      refresh: "Opdater",
      resetDemo: "Nulstil Demo",
      live: "LIVE",
      online: "Online",
      offline: "Offline",
      mode: "Tilstand",
      hubScannerTitle: "Danmark Varemodtagelse Scanner",
      storeCounterTitle: "DK-Aarhus-01 • Butiksskranke",
      storeCounterSub: "Realtids Available-To-Promise (ATP) & Lagerbeholdning Opslag",
      salesDesk: "Salgsdisk 01",
      liveHubSync: "Live Hub Synkronisering",
      openScannerTab: "Åbn Scanner Fane",
      catalogSkus: "Varenumre (SKU)",
      activeInHub: "Aktive i Hub",
      sellableAtpStock: "Salgbart ATP Lager",
      available: "Tilgængelig",
      quarantinedUnits: "Karantæne Enheder",
      heldInBay: "Tilbageholdt i GL-DK-9900",
      dataFreshness: "Data Friskhed",
      subSecondFresh: "Under-Sekund Frisk",
      searchPlaceholder: "Søg på varenummer, beskrivelse, kategori...",
      allCategories: "Alle Kategorier",
      colSku: "Varenummer",
      colDescription: "Varebeskrivelse",
      colCategory: "Kategori",
      colLocation: "Placering",
      colPhysical: "Fysisk Beholdning",
      colAtp: "Available-To-Promise (ATP)",
      colQuarantine: "Karantæne",
      colTrust: "Troværdighed",
      colLastUpdated: "Sidst Opdateret",
      loadingInventory: "Indlæser lagerdata fra Danmark Hub...",
      queueBadge: "Kø",
      queueCount: "{count} i kø",

      // Workflow Steps
      step1: "Scan",
      step2: "Afstem PO",
      step3: "Bekræft",

      // Step 1: Scan
      targetPoLabel: "Målindkøbsordre",
      hubLocation: "Nordic BuildSupply DK • Danmark Hub",
      linesExpected: "14 linjer forventet",
      inboundDeliveryNote: "Indgående Følgeseddel",
      scanHelpText: "Hold den fysiske følgeseddel foran kameraet for automatisk at udtrække varer og antal.",
      scanDemoButton: "Scan demo følgeseddel",
      scanScanningTitle: "Scanner følgeseddel...",
      scanReconcilingText: "Afstemmer med indkøbsordre PO-48213",
      standardProcedureTitle: "Standard Modtagelsesprocedure:",
      procedure1: "Scan leverandørfølgeseddel ved aflæsningsrampen",
      procedure2: "Afstem scannede linjer mod ERP-indkøbsordren",
      procedure3: "Registrer afvigelser før opdatering af salgbar ATP",

      // Step 2: Match to PO
      poReconciliation: "Afstemning af Indkøbsordre",
      linesCount: "{count} linjer",
      linesOkChip: "{ok} af {total} linjer OK",
      discrepanciesChip: "{count} afvigelser",
      lowConfidenceChip: "{count} lav konfidens",
      spotlightHeader: "Fokusvarer (4)",
      spotlightSub: "Afvigelser kræver godkendelse før bogføring",
      deliveredOrdered: "Leveret / Bestilt",
      matchedOk: "100% matchet",
      aiConfidence: "{percent}% AI konfidens",
      lineNum: "Linje {num}",
      moreLinesAccordion: "{count} øvrige linjer matcher ordren (100% OK)",

      // Discrepancy & Status
      statusOk: "OK",
      statusShort: "MANGLER",
      statusUnknown: "UKENDT VARE",
      shortDeficitChip: "{count} mangler",
      unorderedChip: "+{count} ubestilt",
      shortWarningTitle: "Underlevering (-8 plader)",
      shortWarningText: "Fysisk antal 52 er mindre end forventet 60. Fotodokumentation påkrævet.",
      reviewShortAction: "Gennemgå afvigelse for underlevering",
      reviewedShortStatus: "Gennemgået (-8 mangler • foto vedhæftet)",

      // FIX-M8 Quarantine
      quarantineBanner: "Ikke på PO. 12 enheder placeres i karantæne (GL-DK-9900) og tilføjes IKKE til salgslager.",
      lowConfidenceNote: "Lav AI-konfidens: 68%",
      managerApprovalCheckbox: "Leder har godkendt modtagelse af ubestilt vare",
      managerApprovalSub: "Godkendt • Sender accept_unordered_override",
      managerApprovalPrompt: "Marker for at tillade modtagelse i lager",

      // Bottom Bar
      guideReviewBoth: "Gennemgå PLAST-01 & godkend FIX-M8",
      guideReviewPlast: "Gennemgå PLAST-01 manko",
      guideApproveFix: "Godkend FIX-M8 karantæneoverride",
      guideReady: "Klar til at bekræfte modtagelse ({mode})",
      confirmReceiptBtn: "Bekræft modtagelse (14 linjer)",
      confirmingBtn: "BogfResumeerer til Hub...",

      // Bottom Sheet (PLAST-01 Stepper Modal)
      sheetShortTitle: "Gennemgang af Underlevering",
      sheetShortSub: "PLAST-01 • Gyproc Gipsplade",
      sheetExpected: "Forventet: 60 plader • Leverandør: Nordic BuildSupply DK",
      physicalCountLabel: "Verificeret Fysisk Antal",
      sheetsUnit: "plader",
      deficitLabel: "{count} plader mangler",
      surplusLabel: "+{count} plader for meget",
      matchLabel: "Matcher ordren (60/60 plader)",
      reasonCodeLabel: "Årsagskode (API-værdi)",
      reasonShortDelivery: "short_delivery - Leverandør underleverede",
      reasonDamagedArrival: "damaged_on_arrival - Beskadiget under transport",
      reasonSupplierBackorder: "supplier_backorder - Restordre hos leverandør",
      auditPhotoLabel: "Foto af beskadiget emballage",
      photoAttachedBadge: "Foto vedhæftet & bekræftet",
      photoSimulatedText: "Simuleret optagelse fra lagerkamera (1080p)",
      photoChangeBtn: "Tag nyt",
      notesLabel: "Modtagelsesnotater (valgfrit)",
      saveExceptionBtn: "Gem afvigelse og fortsæt",

      // Event Logs (Minimalist Data Badges)
      eventScanComplete: "[SCAN] PO-48213 Afstemt (14 linjer: 12 OK, 2 afvigelser)",
      eventPlastReviewed: "[EXCEPTION] PLAST-01 Verificeret (52 plader, foto logget)",
      eventQuarantineApproved: "[OVERRIDE] FIX-M8 Ledergodkendelse Modtaget",
      eventQuarantineHeld: "[QUARANTINE] FIX-M8 Placeret i Karantænezone GL-DK-9900",
      eventConfirmPosted: "[SUCCESS] ATP Opdateret (<15ms) • ERP Synkroniseret",
      eventConfirmQueued: "[OFFLINE] Varemodtagelse Gemt i Lokal Kø ({key})",
      eventQueueSyncStart: "[SYNC] Sender offlinekø ({count} ventende)...",
      eventQueueSynced: "[SYNC] Offlinekø synkroniseret: 0 ventende",
      eventDuplicateBlocked: "[IDEMPOTENT] Duplikat Blokeret (0 ekstra lager)",
      eventDemoReset: "[RESET] Baseline Gendannet (<15ms)",
    },

    vi: {
      // Common & Navigation
      scan: "Quét",
      confirm: "Xác nhận",
      refresh: "Làm mới",
      resetDemo: "Đặt lại Demo",
      live: "TRỰC TIẾP",
      online: "Trực tuyến",
      offline: "Ngoại tuyến",
      mode: "Chế độ",
      hubScannerTitle: "Máy Quét Nhập Kho Đan Mạch",
      storeCounterTitle: "DK-Aarhus-01 • Quầy Bán Hàng",
      storeCounterSub: "Tra Cứu Tồn Kho Khả Dụng (ATP) & Hàng Thực Tế Thời Gian Thực",
      salesDesk: "Bàn Bán Hàng 01",
      liveHubSync: "Đồng Bộ Hub Trực Tiếp",
      openScannerTab: "Mở Tab Máy Quét",
      catalogSkus: "Mã Hàng (SKU)",
      activeInHub: "Đang Hoạt Động",
      sellableAtpStock: "Tồn Kho Khả Dụng (ATP)",
      available: "Khả Dụng",
      quarantinedUnits: "Hàng Cách Ly",
      heldInBay: "Lưu giữ tại GL-DK-9900",
      dataFreshness: "Độ Mới Dữ Liệu",
      subSecondFresh: "Cập Nhật Tức Thì (<2s)",
      searchPlaceholder: "Tìm kiếm theo mã SKU, tên vật liệu, kệ hàng...",
      allCategories: "Tất Cả Danh Mục",
      colSku: "Mã SKU",
      colDescription: "Tên Sản Phẩm",
      colCategory: "Danh Mục",
      colLocation: "Vị Trí Kệ",
      colPhysical: "Tồn Kho Thực Tế",
      colAtp: "Khả Dụng (ATP)",
      colQuarantine: "Cách Ly",
      colTrust: "Độ Tin Cậy",
      colLastUpdated: "Cập Nhật Lần Cuối",
      loadingInventory: "Đang tải dữ liệu tồn kho từ Hub Đan Mạch...",
      queueBadge: "Hàng đợi",
      queueCount: "{count} phiếu",

      // Workflow Steps
      step1: "Quét Đơn",
      step2: "Đối Soát PO",
      step3: "Xác Nhận",

      // Step 1: Scan
      targetPoLabel: "Đơn mua hàng mục tiêu",
      hubLocation: "Nordic BuildSupply DK • Hub Đan Mạch",
      linesExpected: "14 dòng dự kiến",
      inboundDeliveryNote: "Phiếu Giao Hàng Nhà Cung Cấp",
      scanHelpText: "Đặt phiếu giao hàng giấy trước camera để hệ thống AI tự động trích xuất mã hàng và số lượng.",
      scanDemoButton: "Quét phiếu giao hàng mẫu",
      scanScanningTitle: "Đang quét phiếu giao hàng...",
      scanReconcilingText: "Đang đối chiếu với đơn đặt hàng PO-48213",
      standardProcedureTitle: "Quy trình Nhận Hàng Chuẩn:",
      procedure1: "Quét phiếu giao hàng tại cầu dỡ hàng kho",
      procedure2: "Đối chiếu số lượng thực tế với đơn hàng ERP",
      procedure3: "Ghi nhận ngoại lệ trước khi cập nhật tồn khả dụng",

      // Step 2: Match to PO
      poReconciliation: "Đối Soát Đơn Hàng PO",
      linesCount: "{count} mặt hàng",
      linesOkChip: "{ok}/{total} mặt hàng ĐẠT",
      discrepanciesChip: "{count} sai lệch",
      lowConfidenceChip: "{count} độ tin cậy thấp",
      spotlightHeader: "Mặt Hàng Trọng Điểm (4)",
      spotlightSub: "Cần kiểm tra ngoại lệ trước khi xác nhận nhập",
      deliveredOrdered: "Thực nhận / Đặt mua",
      matchedOk: "Khớp 100%",
      aiConfidence: "{percent}% độ tin cậy AI",
      lineNum: "Dòng {num}",
      moreLinesAccordion: "{count} mặt hàng khác khớp 100% với đơn",

      // Discrepancy & Status
      statusOk: "ĐẠT",
      statusShort: "THIẾU",
      statusUnknown: "HÀNG NGOÀI ĐƠN",
      shortDeficitChip: "Thiếu {count}",
      unorderedChip: "+{count} ngoài đơn",
      shortWarningTitle: "Giao thiếu hàng (-8 tấm)",
      shortWarningText: "Số lượng quét được 52 ít hơn 60 theo đơn. Yêu cầu đính kèm ảnh kiểm kê.",
      reviewShortAction: "Kiểm tra xử lý ngoại lệ giao thiếu",
      reviewedShortStatus: "Đã xử lý (thiếu -8 • đã đính kèm ảnh)",

      // FIX-M8 Quarantine
      quarantineBanner: "Mặt hàng ngoài đơn. 12 hộp sẽ được giữ cách ly (GL-DK-9900) và KHÔNG cộng vào tồn bán.",
      lowConfidenceNote: "Độ tin cậy AI thấp: 68%",
      managerApprovalCheckbox: "Quản lý đã phê duyệt tiếp nhận hàng ngoài đơn",
      managerApprovalSub: "Đã duyệt • Gửi cờ accept_unordered_override",
      managerApprovalPrompt: "Đánh dấu để cho phép nhập kho bán",

      // Bottom Bar
      guideReviewBoth: "Xem lại PLAST-01 & duyệt FIX-M8",
      guideReviewPlast: "Xử lý hàng thiếu PLAST-01",
      guideApproveFix: "Duyệt nhập kho ngoài đơn FIX-M8",
      guideReady: "Sẵn sàng xác nhận nhập kho ({mode})",
      confirmReceiptBtn: "Xác nhận nhập kho (14 mặt hàng)",
      confirmingBtn: "Đang lưu vào Hub...",

      // Bottom Sheet (PLAST-01 Stepper Modal)
      sheetShortTitle: "Xử Lý Hàng Giao Thiếu",
      sheetShortSub: "PLAST-01 • Tấm Thạch Cao Gyproc",
      sheetExpected: "Đơn đặt: 60 tấm • Nhà cung cấp: Nordic BuildSupply DK",
      physicalCountLabel: "Số Lượng Thực Nhận Kiểm Đếm",
      sheetsUnit: "tấm",
      deficitLabel: "Thiếu {count} tấm",
      surplusLabel: "Thừa +{count} tấm",
      matchLabel: "Khớp chuẩn (60/60 tấm)",
      reasonCodeLabel: "Mã lý do (chuẩn mã API)",
      reasonShortDelivery: "short_delivery - Nhà cung cấp giao thiếu",
      reasonDamagedArrival: "damaged_on_arrival - Hỏng trong quá trình vận chuyển",
      reasonSupplierBackorder: "supplier_backorder - Nhà cung cấp giao đợt sau",
      auditPhotoLabel: "Ảnh chụp kiện hàng lỗi / thiếu",
      photoAttachedBadge: "Ảnh đã đính kèm & xác minh",
      photoSimulatedText: "Ảnh chụp kiểm kê camera kho (1080p)",
      photoChangeBtn: "Chụp lại",
      notesLabel: "Ghi chú kiểm kho (tùy chọn)",
      saveExceptionBtn: "Lưu ngoại lệ & tiếp tục",

      // Event Logs (Minimalist Data Badges)
      eventScanComplete: "[SCAN] PO-48213 Đã Đối Soát (14 dòng: 12 ĐẠT, 2 sai lệch)",
      eventPlastReviewed: "[EXCEPTION] PLAST-01 Đã Kiểm (52 tấm, ảnh đã lưu)",
      eventQuarantineApproved: "[OVERRIDE] FIX-M8 Quản Lý Đã Phê Duyệt",
      eventQuarantineHeld: "[QUARANTINE] FIX-M8 Đã Chuyển Kho Cách Ly GL-DK-9900",
      eventConfirmPosted: "[SUCCESS] ATP Đã Cập Nhật (<15ms) • ERP Đã Đồng Bộ",
      eventConfirmQueued: "[OFFLINE] Đã Lưu Phiếu Vào Hàng Đợi ({key})",
      eventQueueSyncStart: "[SYNC] Đang đồng bộ hàng đợi ({count} phiếu)...",
      eventQueueSynced: "[SYNC] Đã đồng bộ xong hàng đợi: 0 phiếu chờ",
      eventDuplicateBlocked: "[IDEMPOTENT] Đã Ngăn Trùng Lặp (0 tăng trùng tồn kho)",
      eventDemoReset: "[RESET] Dữ Liệu Đã Đặt Lại (<15ms)",
    },
  };

  let currentLang = DEFAULT_LANG;
  const listeners = new Set();

  function initLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED_LANGS.includes(saved)) {
        currentLang = saved;
      }
    } catch {
      currentLang = DEFAULT_LANG;
    }
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.lang = currentLang;
    }
  }

  function applyDOMTranslations(root = document) {
    if (typeof document === "undefined" || !root) return;
    const elements = root.querySelectorAll("[data-i18n]");
    elements.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) {
        const text = t(key);
        if (el.tagName === "INPUT" && (el.type === "button" || el.type === "submit")) {
          el.value = text;
        } else if (el.placeholder !== undefined && el.hasAttribute("data-i18n-placeholder")) {
          el.placeholder = text;
        } else {
          el.textContent = text;
        }
      }
    });

    // Update active language indicator buttons
    const langButtons = root.querySelectorAll('[data-action="set-lang"], [data-lang-btn]');
    langButtons.forEach((btn) => {
      const btnLang = btn.getAttribute("data-lang") || btn.getAttribute("data-lang-btn");
      if (btnLang === currentLang) {
        btn.classList.add("bg-orange-600", "text-white");
        btn.classList.remove("text-slate-400");
      } else {
        btn.classList.remove("bg-orange-600", "text-white");
        btn.classList.add("text-slate-400");
      }
    });
  }

  function setLanguage(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return currentLang;
    currentLang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      console.warn("[I18n] Could not persist language", e);
    }
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.lang = lang;
      applyDOMTranslations();
    }
    listeners.forEach((fn) => {
      try {
        fn(currentLang);
      } catch (err) {
        console.error("[I18n] Listener error:", err);
      }
    });
    return currentLang;
  }

  function getLanguage() {
    return currentLang;
  }

  function onLanguageChange(fn) {
    if (typeof fn === "function") {
      listeners.add(fn);
    }
  }

  function t(key, params = {}) {
    const dict = translations[currentLang] || translations[DEFAULT_LANG];
    let val = dict[key] || translations[DEFAULT_LANG][key] || key;

    if (typeof val === "string") {
      Object.keys(params).forEach((p) => {
        val = val.replace(new RegExp(`\\{${p}\\}`, "g"), params[p]);
      });
    }
    return val;
  }

  initLang();

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => applyDOMTranslations());
    } else {
      setTimeout(() => applyDOMTranslations(), 0);
    }
  }

  return {
    t,
    setLanguage,
    getLanguage,
    onLanguageChange,
    applyDOMTranslations,
    SUPPORTED_LANGS,
  };
});
