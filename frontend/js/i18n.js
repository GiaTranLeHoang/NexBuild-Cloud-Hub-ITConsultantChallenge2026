/**
 * NexBuild Cloud Hub - Internationalization (i18n) Module
 * Natural warehouse terminology for English, Dansk, and Tiếng Việt.
 * Fallback to English for any missing keys.
 * SKU codes, PO numbers, quantities, and API field names stay untranslated.
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
      // Top bar & Nav
      hubScannerTitle: "Denmark Receiving Scanner",
      online: "Online",
      offline: "Offline",
      queueBadge: "Queue",
      queueCount: "{count} queued",
      openScanner: "Open Scanner",
      language: "Language",

      // Workflow Steps
      step1: "Scan",
      step2: "Match to PO",
      step3: "Confirm",

      // Step 1: Scan
      targetPoLabel: "Target purchase order",
      hubLocation: "Nordic BuildSupply DK &bull; Denmark Hub",
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
      reviewedShortStatus: "Reviewed (-8 short &bull; photo attached)",

      // FIX-M8 Quarantine
      quarantineBanner: "Not on PO. 12 units will be held in quarantine (GL-DK-9900) and will NOT be added to sellable stock.",
      lowConfidenceNote: "Low AI confidence: 68%",
      managerApprovalCheckbox: "Manager approved receipt of unordered item",
      managerApprovalSub: "Approved &bull; Sends accept_unordered_override",
      managerApprovalPrompt: "Check to authorize receipt onto inventory",

      // Bottom Bar
      guideReviewBoth: "Review PLAST-01 & approve FIX-M8",
      guideReviewPlast: "Review PLAST-01 shortage",
      guideApproveFix: "Approve FIX-M8 quarantine override",
      guideReady: "Ready to confirm receipt ({mode})",
      confirmReceiptBtn: "Confirm receipt (14 lines)",
      confirmingBtn: "Posting to Hub...",

      // Bottom Sheet (PLAST-01)
      sheetShortTitle: "Short Delivery Review",
      sheetShortSub: "PLAST-01 &bull; Gyproc Plasterboard",
      sheetExpected: "Expected: 60 sheets &bull; Supplier: Nordic BuildSupply DK",
      physicalCountLabel: "Verified Physical Count",
      sheetsUnit: "sheets",
      deficitLabel: "{count} sheets deficit",
      reasonCodeLabel: "Reason code (exact API value)",
      reasonShortDelivery: "short_delivery (Under-delivered on pallet)",
      reasonDamagedArrival: "damaged_on_arrival (Damaged at dock)",
      reasonSupplierBackorder: "supplier_backorder (Split supplier shipment)",
      auditPhotoLabel: "Audit photo evidence",
      photoAttachedBadge: "Photo attached",
      photoSimulatedText: "Simulated dock capture &bull; 842 KB",
      photoChangeBtn: "Change",
      saveExceptionBtn: "Save exception (-8 short)",
      cancelBtn: "Cancel",

      // Step 3: Success & Offline
      receiptPostedTitle: "Receipt posted",
      savedOnDeviceTitle: "Saved on this device",
      matchesPoLabel: "Matches PO (60 / 60)",
      shortUnitsLabel: "short",
      postedHubTitle: "Posted. Hub updated in {sec} s",
      postedHubSub: "Receipt confirmed and synced to Denmark ERP ({voucher}).",
      savedOfflineTitle: "Saved on this device.",
      savedOfflineSub: "Will sync when you are back online. Idempotency key preserved safely.",
      localQueueProtected: "Local Queue Protected",
      postedSynced: "Posted & Synchronized",
      atpUpdatesHeader: "ATP Inventory Updates",
      atpRealtimeSnapshot: "Real-Time Snapshot",
      quarantineHeldLabel: "12 held in quarantine",
      testDuplicateBtn: "Test duplicate send (Idempotency Guard)",
      startNewReceiptBtn: "Start new receipt",
      duplicateBlockedTitle: "Duplicate blocked. Nothing was posted twice.",
      duplicateBlockedSub: "Idempotent replay verified. The Hub detected the duplicate key and returned the cached receipt without altering inventory quantities.",
      dismissBtn: "Dismiss",

      // Menu & Settings
      scannerSettings: "Scanner Settings",
      backendMode: "Backend Mode",
      dockMode: "Dock mode (High Contrast)",
      dockModeSub: "Large touch targets & elevated contrast",
      phoneFrame: "Phone frame (390×844)",
      phoneFrameSub: "Centered mobile recording frame",
      demoCaptions: "Demo captions",
      demoCaptionsSub: "Display presenter guide notes",
      vibration: "Haptic vibration",
      vibrationSub: "Tactile pulse on events",
      resetDemo: "Reset demo data & clear queue",

      // Event Log Lines
      eventScanComplete: "Delivery note scanned: 14 lines reconciled with PO-48213",
      eventPlastReviewed: "PLAST-01 reviewed: count set to 52, reason 'short_delivery' & photo logged",
      eventQuarantineApproved: "FIX-M8 manager override approved (accept_unordered_override)",
      eventQuarantineHeld: "FIX-M8 routed to quarantine bay GL-DK-9900",
      eventConfirmPosted: "Goods receipt confirmed online: Hub ATP updated in {sec} s",
      eventConfirmQueued: "Goods receipt queued locally in offline storage ({key})",
      eventQueueSyncStart: "Flushing offline queue ({count} pending)...",
      eventQueueSynced: "Offline queue synced successfully: 0 pending",
      eventDuplicateBlocked: "Duplicate send prevented: Server returned is_idempotent_replay: true",
      eventDemoReset: "Demo data reset: SQLite baseline restored & queue cleared",

      // Captions (English baseline per requirements)
      captionScan: "AI reads the delivery note and matches it to PO-48213",
      captionShortage: "Plasterboard is short by 8: reason and photo are logged",
      captionQuarantine: "Unknown item goes to quarantine, not sellable stock",
      captionOffline: "Offline: saved on the device with a unique key",
      captionSync: "Back online: synced automatically, duplicates are blocked",
    },

    da: {
      // Top bar & Nav
      hubScannerTitle: "Danmark Varemodtagelse Scanner",
      online: "Online",
      offline: "Offline",
      queueBadge: "Kø",
      queueCount: "{count} i kø",
      openScanner: "Åbn Scanner",
      language: "Sprog",

      // Workflow Steps
      step1: "Scan",
      step2: "Afstem PO",
      step3: "Bekræft",

      // Step 1: Scan
      targetPoLabel: "Aktiv indkøbsordre",
      hubLocation: "Nordic BuildSupply DK &bull; Danmark Hub",
      linesExpected: "14 linjer forventet",
      inboundDeliveryNote: "Indgående følgeseddel",
      scanHelpText: "Hold den fysiske følgeseddel foran kameraet for automatisk udtræk af varenumre, enheder og modtaget antal.",
      scanDemoButton: "Scan demo følgeseddel",
      scanScanningTitle: "Scanner følgeseddel...",
      scanReconcilingText: "Afstemmer med indkøbsordre PO-48213",
      standardProcedureTitle: "Standard modtageprocedure:",
      procedure1: "Scan leverandørens følgeseddel ved aflæsningsrampen",
      procedure2: "Afstem scannede linjer mod ERP-indkøbsordren",
      procedure3: "Dokumentér afvigelser før opdatering af disponibel ATP",

      // Step 2: Match to PO
      poReconciliation: "Afstemning af indkøbsordre",
      linesCount: "{count} linjer",
      linesOkChip: "{ok} af {total} linjer OK",
      discrepanciesChip: "{count} afvigelser",
      lowConfidenceChip: "{count} lav konfidens",
      spotlightHeader: "Udvælgelseslinjer (4)",
      spotlightSub: "Afvigelser kræver godkendelse før bogføring",
      deliveredOrdered: "Leveret / Bestilt",
      matchedOk: "100% afstemt",
      aiConfidence: "{percent}% AI konfidens",
      lineNum: "Linje {num}",
      moreLinesAccordion: "{count} linjer mere matcher PO (100% OK)",

      // Discrepancy & Status
      statusOk: "OK",
      statusShort: "MANGLER",
      statusUnknown: "UKENDT VARE",
      shortDeficitChip: "{count} mangler",
      unorderedChip: "+{count} ubestilt",
      shortWarningTitle: "Underlevering (-8 plader)",
      shortWarningText: "Fysisk optalt 52 er mindre end de bestilte 60. Fotodokumentation påkrævet.",
      reviewShortAction: "Gennemgå afvigelse for underlevering",
      reviewedShortStatus: "Gennemgået (-8 mangler &bull; foto vedhæftet)",

      // FIX-M8 Quarantine
      quarantineBanner: "Ikke på PO. 12 enheder tilbageholdes i karantæne (GL-DK-9900) og tilføjes IKKE til salgbar lagerbeholdning.",
      lowConfidenceNote: "Lav AI konfidens: 68%",
      managerApprovalCheckbox: "Leder har godkendt modtagelse af ubestilt vare",
      managerApprovalSub: "Godkendt &bull; Sender accept_unordered_override",
      managerApprovalPrompt: "Afkryds for at godkende varemodtagelse til lager",

      // Bottom Bar
      guideReviewBoth: "Gennemgå PLAST-01 & godkend FIX-M8",
      guideReviewPlast: "Gennemgå mangel på PLAST-01",
      guideApproveFix: "Godkend karantæneoverride for FIX-M8",
      guideReady: "Klar til at bekræfte modtagelse ({mode})",
      confirmReceiptBtn: "Bekræft modtagelse (14 linjer)",
      confirmingBtn: "BogfResumeerer til Hub...",

      // Bottom Sheet (PLAST-01)
      sheetShortTitle: "Gennemgang af underlevering",
      sheetShortSub: "PLAST-01 &bull; Gyproc Standard Gipsplade",
      sheetExpected: "Forventet: 60 plader &bull; Leverandør: Nordic BuildSupply DK",
      physicalCountLabel: "Fysisk bekræftet antal",
      sheetsUnit: "plader",
      deficitLabel: "{count} plader difference",
      reasonCodeLabel: "Årsagskode (API-værdi)",
      reasonShortDelivery: "short_delivery (Underleveret på palle)",
      reasonDamagedArrival: "damaged_on_arrival (Beskadiget ved modtagelse)",
      reasonSupplierBackorder: "supplier_backorder (Dellevering fra leverandør)",
      auditPhotoLabel: "Fotodokumentation",
      photoAttachedBadge: "Foto vedhæftet",
      photoSimulatedText: "Simuleret modtagefoto &bull; 842 KB",
      photoChangeBtn: "Skift",
      saveExceptionBtn: "Gem afvigelse (-8 mangler)",
      cancelBtn: "Annuller",

      // Step 3: Success & Offline
      receiptPostedTitle: "Varemodtagelse bogført",
      savedOnDeviceTitle: "Gemt på denne enhed",
      matchesPoLabel: "Matcher PO (60 / 60)",
      shortUnitsLabel: "mangler",
      postedHubTitle: "Bogført. Hub opdateret på {sec} s",
      postedHubSub: "Modtagelse bekræftet og synkroniseret med Danmark ERP ({voucher}).",
      savedOfflineTitle: "Gemt lokalt på denne enhed.",
      savedOfflineSub: "Synkroniseres automatisk, når du er online igen. Idempotensnøgle bevaret.",
      localQueueProtected: "Lokal kø sikret",
      postedSynced: "Bogført & Synkroniseret",
      atpUpdatesHeader: "ATP lageropdateringer",
      atpRealtimeSnapshot: "Realtids oversigt",
      quarantineHeldLabel: "12 tilbageholdt i karantæne",
      testDuplicateBtn: "Test duplikatblokering (Idempotens)",
      startNewReceiptBtn: "Start ny modtagelse",
      duplicateBlockedTitle: "Duplikat blokeret. Intet blev bogført to gange.",
      duplicateBlockedSub: "Idempotent genspilning bekræftet. Hubben registrerede den gentagne nøgle og returnerede gemt kvittering uden at ændre lageret.",
      dismissBtn: "Luk",

      // Menu & Settings
      scannerSettings: "Scanner Indstillinger",
      backendMode: "Backend tilstand",
      dockMode: "Rampe tilstand (Høj kontrast)",
      dockModeSub: "Ekstra store knapper og markant kontrast",
      phoneFrame: "Telefonramme (390×844)",
      phoneFrameSub: "Centreret mobiloptagelse",
      demoCaptions: "Demo billedtekster",
      demoCaptionsSub: "Vis hjælpetekster til præsentation",
      vibration: "Haptisk vibration",
      vibrationSub: "Mærkbare impulser ved handlinger",
      resetDemo: "Nulstil demo & ryd kø",

      // Event Log Lines
      eventScanComplete: "Følgeseddel scannet: 14 linjer afstemt med PO-48213",
      eventPlastReviewed: "PLAST-01 gennemgået: antal sat til 52, årsag 'short_delivery' & foto logget",
      eventQuarantineApproved: "FIX-M8 lederoverride godkendt (accept_unordered_override)",
      eventQuarantineHeld: "FIX-M8 placeret i karantænezone GL-DK-9900",
      eventConfirmPosted: "Varemodtagelse bogført online: Hub ATP opdateret på {sec} s",
      eventConfirmQueued: "Varemodtagelse gemt i lokal offlinekø ({key})",
      eventQueueSyncStart: "Synkroniserer offlinekø ({count} ventende)...",
      eventQueueSynced: "Offlinekø synkroniseret: 0 ventende",
      eventDuplicateBlocked: "Duplikat afsendelse forhindret: Server returnerede is_idempotent_replay: true",
      eventDemoReset: "Demo nulstillet: SQLite baseline gendannet og kø ryddet",

      // Captions stay in English per challenge spec
      captionScan: "AI reads the delivery note and matches it to PO-48213",
      captionShortage: "Plasterboard is short by 8: reason and photo are logged",
      captionQuarantine: "Unknown item goes to quarantine, not sellable stock",
      captionOffline: "Offline: saved on the device with a unique key",
      captionSync: "Back online: synced automatically, duplicates are blocked",
    },

    vi: {
      // Top bar & Nav
      hubScannerTitle: "Máy Quét Nhập Kho Đan Mạch",
      online: "Trực tuyến",
      offline: "Ngoại tuyến",
      queueBadge: "Hàng đợi",
      queueCount: "{count} đang chờ",
      openScanner: "Mở máy quét",
      language: "Ngôn ngữ",

      // Workflow Steps
      step1: "Quét",
      step2: "Đối soát PO",
      step3: "Xác nhận",

      // Step 1: Scan
      targetPoLabel: "Đơn mua hàng mục tiêu",
      hubLocation: "Nordic BuildSupply DK &bull; Tổng kho Đan Mạch",
      linesExpected: "Dự kiến 14 dòng",
      inboundDeliveryNote: "Phiếu Giao Hàng Đến",
      scanHelpText: "Giữ phiếu giao hàng giấy trước camera để AI tự động trích xuất mã hàng, đơn vị và số lượng giao.",
      scanDemoButton: "Quét phiếu giao hàng mẫu",
      scanScanningTitle: "Đang quét phiếu giao hàng...",
      scanReconcilingText: "Đang đối soát với đơn hàng PO-48213",
      standardProcedureTitle: "Quy trình nhận hàng tiêu chuẩn:",
      procedure1: "Quét phiếu giao hàng của nhà cung cấp tại cửa nhập kho",
      procedure2: "Đối chiếu số lượng thực tế với đơn đặt hàng ERP",
      procedure3: "Ghi nhận sai lệch trước khi cập nhật tồn kho ATP",

      // Step 2: Match to PO
      poReconciliation: "Đối Soát Đơn Hàng PO",
      linesCount: "{count} dòng",
      linesOkChip: "{ok}/{total} dòng khớp OK",
      discrepanciesChip: "{count} sai lệch",
      lowConfidenceChip: "{count} độ tin cậy thấp",
      spotlightHeader: "Mục Tiêu Điểm (4)",
      spotlightSub: "Cần kiểm duyệt các mục sai lệch trước khi ghi nhận",
      deliveredOrdered: "Đã giao / Đặt hàng",
      matchedOk: "Khớp 100%",
      aiConfidence: "{percent}% tin cậy AI",
      lineNum: "Dòng {num}",
      moreLinesAccordion: "Thêm {count} dòng khớp 100% với đơn PO",

      // Discrepancy & Status
      statusOk: "ĐẠT",
      statusShort: "THIẾU",
      statusUnknown: "MÃ LẠ",
      shortDeficitChip: "Thiếu {count}",
      unorderedChip: "+{count} ngoài đơn",
      shortWarningTitle: "Giao thiếu (-8 tấm)",
      shortWarningText: "Số lượng thực tế 52 tấm ít hơn 60 tấm theo đơn. Bắt buộc chụp ảnh kiểm toán.",
      reviewShortAction: "Xử lý sai lệch giao thiếu",
      reviewedShortStatus: "Đã duyệt (thiếu -8 &bull; đã đính kèm ảnh)",

      // FIX-M8 Quarantine
      quarantineBanner: "Không có trên đơn PO. 12 hộp sẽ được chuyển vào khu cách ly (GL-DK-9900) và KHÔNG cộng vào tồn kho bán.",
      lowConfidenceNote: "Độ tin cậy AI thấp: 68%",
      managerApprovalCheckbox: "Quản lý kho đã duyệt nhận mặt hàng ngoài đơn",
      managerApprovalSub: "Đã duyệt &bull; Gửi mã accept_unordered_override",
      managerApprovalPrompt: "Đánh dấu để cho phép nhập kho mặt hàng này",

      // Bottom Bar
      guideReviewBoth: "Duyệt PLAST-01 & phê duyệt FIX-M8",
      guideReviewPlast: "Duyệt xử lý thiếu PLAST-01",
      guideApproveFix: "Phê duyệt cách ly FIX-M8",
      guideReady: "Sẵn sàng xác nhận nhập kho ({mode})",
      confirmReceiptBtn: "Xác nhận nhập kho (14 dòng)",
      confirmingBtn: "Đang ghi nhận vào hệ thống...",

      // Bottom Sheet (PLAST-01)
      sheetShortTitle: "Xử Lý Hàng Giao Thiếu",
      sheetShortSub: "PLAST-01 &bull; Tấm Thạch Cao Gyproc",
      sheetExpected: "Đơn đặt: 60 tấm &bull; Nhà cung cấp: Nordic BuildSupply DK",
      physicalCountLabel: "Số Lượng Đếm Thực Tế",
      sheetsUnit: "tấm",
      deficitLabel: "Thiếu {count} tấm",
      reasonCodeLabel: "Mã lý do (chuẩn API)",
      reasonShortDelivery: "short_delivery (Nhà cung cấp giao thiếu trên pallet)",
      reasonDamagedArrival: "damaged_on_arrival (Hàng hỏng tại cửa nhập)",
      reasonSupplierBackorder: "supplier_backorder (Giao hàng nhiều đợt)",
      auditPhotoLabel: "Ảnh chụp chứng từ kiểm toán",
      photoAttachedBadge: "Đã đính kèm ảnh",
      photoSimulatedText: "Ảnh chụp thực địa kho &bull; 842 KB",
      photoChangeBtn: "Thay đổi",
      saveExceptionBtn: "Lưu sai lệch (thiếu -8 tấm)",
      cancelBtn: "Hủy bỏ",

      // Step 3: Success & Offline
      receiptPostedTitle: "Đã ghi nhận phiếu nhập",
      savedOnDeviceTitle: "Đã lưu trên thiết bị",
      matchesPoLabel: "Khớp đơn hàng (60 / 60)",
      shortUnitsLabel: "thiếu",
      postedHubTitle: "Đã Nhập Kho. Cập nhật hệ thống trong {sec} giây",
      postedHubSub: "Đã xác nhận nhập kho và đồng bộ với ERP Đan Mạch ({voucher}).",
      savedOfflineTitle: "Đã lưu an toàn trên thiết bị.",
      savedOfflineSub: "Sẽ tự động đồng bộ khi có mạng trở lại. Mã khóa giao dịch được bảo vệ.",
      localQueueProtected: "Bảo Vệ Hàng Đợi Cục Bộ",
      postedSynced: "Đã Ghi Nhận & Đồng Bộ",
      atpUpdatesHeader: "Cập Nhật Tồn Kho ATP",
      atpRealtimeSnapshot: "Dữ Liệu Thời Gian Thực",
      quarantineHeldLabel: "12 hộp giữ trong khu cách ly",
      testDuplicateBtn: "Kiểm tra chặn gửi trùng (Bảo vệ Idempotency)",
      startNewReceiptBtn: "Quét phiếu giao hàng mới",
      duplicateBlockedTitle: "Đã chặn gửi trùng. Không có giao dịch nào bị lặp lại.",
      duplicateBlockedSub: "Đã xác minh tính toàn vẹn (idempotent replay). Hệ thống phát hiện khóa trùng và trả về kết quả đã lưu mà không cộng dồn tồn kho.",
      dismissBtn: "Đóng",

      // Menu & Settings
      scannerSettings: "Cài Đặt Máy Quét",
      backendMode: "Chế độ máy chủ",
      dockMode: "Chế độ kho bãi (Tương phản cao)",
      dockModeSub: "Nút bấm cực lớn & độ tương phản rõ nét",
      phoneFrame: "Khung điện thoại (390×844)",
      phoneFrameSub: "Hiển thị khung mô phỏng để quay video",
      demoCaptions: "Phụ đề thuyết trình",
      demoCaptionsSub: "Hiển thị chú thích quy trình",
      vibration: "Rung phản hồi",
      vibrationSub: "Phản hồi xúc giác khi thao tác",
      resetDemo: "Đặt lại dữ liệu demo & xóa hàng đợi",

      // Event Log Lines
      eventScanComplete: "Đã quét phiếu giao hàng: 14 dòng đã đối soát với PO-48213",
      eventPlastReviewed: "Đã duyệt PLAST-01: số lượng thực nhận 52, lý do 'short_delivery' & đã lưu ảnh",
      eventQuarantineApproved: "Đã phê duyệt ngoại lệ FIX-M8 (accept_unordered_override)",
      eventQuarantineHeld: "Đã chuyển FIX-M8 vào khu vực cách ly GL-DK-9900",
      eventConfirmPosted: "Đã xác nhận nhập kho trực tuyến: Cập nhật ATP Hub trong {sec} s",
      eventConfirmQueued: "Đã lưu phiếu nhập vào hàng đợi ngoại tuyến ({key})",
      eventQueueSyncStart: "Đang đồng bộ hàng đợi ngoại tuyến ({count} phiếu)...",
      eventQueueSynced: "Đã đồng bộ xong toàn bộ hàng đợi ngoại tuyến: 0 phiếu chờ",
      eventDuplicateBlocked: "Đã ngăn chặn gửi trùng: Máy chủ trả về is_idempotent_replay: true",
      eventDemoReset: "Đã đặt lại dữ liệu: Khôi phục cơ sở dữ liệu SQLite ban đầu",

      // Captions stay in English per challenge spec
      captionScan: "AI reads the delivery note and matches it to PO-48213",
      captionShortage: "Plasterboard is short by 8: reason and photo are logged",
      captionQuarantine: "Unknown item goes to quarantine, not sellable stock",
      captionOffline: "Offline: saved on the device with a unique key",
      captionSync: "Back online: synced automatically, duplicates are blocked",
    },
  };

  let currentLang = DEFAULT_LANG;

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
    }
    return currentLang;
  }

  function getLanguage() {
    return currentLang;
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

  return {
    t,
    setLanguage,
    getLanguage,
    SUPPORTED_LANGS,
  };
});

