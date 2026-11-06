/**
 * NexBuild Cloud Hub - Store Counter Read-Only ATP Lookup
 * Denmark Phase 1 MVP (Desktop Counter View)
 *
 * Capabilities:
 * - Real-time Live Sync via BroadcastChannel & LocalStorage (Api.onStateChange)
 * - Row flash animation when goods receipt increases stock from scanner tab
 * - Search by SKU code, item name, and aisle location
 * - Category filtering and trust status verification (<15m = GREEN)
 * - Counter KPI metric calculations
 */

(function () {
  "use strict";

  // Application State
  const state = {
    items: [],
    previousCounts: {}, // sku_code -> atp_qty (to detect deltas)
    searchQuery: "",
    selectedCategory: "",
    lastSyncTime: new Date(),
    mode: window.Api ? window.Api.getMode() : "mock",
    loading: false,
  };

  // DOM Mount Points
  let dom = {};

  function cacheDom() {
    dom = {
      tbody: document.getElementById("inventory-tbody"),
      searchInput: document.getElementById("search-input"),
      categoryFilter: document.getElementById("category-filter"),
      btnRefresh: document.getElementById("btn-refresh"),
      btnModeToggle: document.getElementById("btn-mode-toggle"),
      btnResetDemo: document.getElementById("btn-reset-demo"),
      metricTotalSkus: document.getElementById("metric-total-skus"),
      metricTotalAtp: document.getElementById("metric-total-atp"),
      metricQuarantine: document.getElementById("metric-quarantine"),
      metricTrustHealth: document.getElementById("metric-trust-health"),
      lastSyncTime: document.getElementById("last-sync-time"),
      liveIndicator: document.getElementById("live-indicator"),
    };
  }

  // -------------------------------------------------------------------------
  // Data Fetching & Calculations
  // -------------------------------------------------------------------------

  async function fetchInventory() {
    state.loading = true;
    try {
      const resp = await window.Api.getATP();
      if (resp && resp.items) {
        // Record previous counts before updating
        const oldCounts = {};
        state.items.forEach((item) => {
          oldCounts[item.sku_code] = item.atp_qty;
        });
        state.previousCounts = oldCounts;

        state.items = resp.items;
        state.lastSyncTime = new Date();
      }
    } catch (err) {
      console.error("[Counter] Failed to fetch inventory ATP:", err);
    } finally {
      state.loading = false;
      render();
    }
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return "Just now";
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return "Just now";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      return `${diffHr}h ago`;
    } catch {
      return "Recent";
    }
  }

  function renderTrustBadge(trustStatus) {
    if (trustStatus === "GREEN") {
      return `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/50" title="Updated within last 15 minutes">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Live (&lt;15m)</span>
        </span>
      `;
    }
    if (trustStatus === "AMBER") {
      return `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-400 border border-amber-500/50" title="Updated within last 2 hours">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          <span>Recent (&lt;2h)</span>
        </span>
      `;
    }
    return `
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-950/80 text-red-400 border border-red-500/50" title="Older than 2 hours">
        <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
        <span>Stale (&gt;2h)</span>
      </span>
    `;
  }

  // -------------------------------------------------------------------------
  // Render Orchestration
  // -------------------------------------------------------------------------

  function renderMetrics() {
    let totalAtp = 0;
    let totalQuarantine = 0;
    let greenCount = 0;

    state.items.forEach((i) => {
      totalAtp += parseFloat(i.atp_qty || 0);
      totalQuarantine += parseFloat(i.quarantine_qty || 0);
      if (i.trust_status === "GREEN") greenCount++;
    });

    if (dom.metricTotalSkus) dom.metricTotalSkus.textContent = state.items.length;
    if (dom.metricTotalAtp) dom.metricTotalAtp.textContent = Math.round(totalAtp).toLocaleString();
    if (dom.metricQuarantine) dom.metricQuarantine.textContent = Math.round(totalQuarantine).toLocaleString();

    const healthPct = state.items.length > 0 ? Math.round((greenCount / state.items.length) * 100) : 100;
    if (dom.metricTrustHealth) dom.metricTrustHealth.textContent = `${healthPct}%`;

    if (dom.lastSyncTime) {
      dom.lastSyncTime.textContent = `Last Synced: ${state.lastSyncTime.toLocaleTimeString()}`;
    }

    if (dom.btnModeToggle) {
      dom.btnModeToggle.textContent = `Mode: ${state.mode.toUpperCase()}`;
    }
  }

  function renderTable() {
    if (!dom.tbody) return;

    // Filter items
    let filtered = state.items;

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (i) =>
          (i.sku_code && i.sku_code.toLowerCase().includes(q)) ||
          (i.item_name && i.item_name.toLowerCase().includes(q)) ||
          (i.category && i.category.toLowerCase().includes(q)) ||
          (i.location && i.location.toLowerCase().includes(q))
      );
    }

    if (state.selectedCategory) {
      filtered = filtered.filter((i) => i.category === state.selectedCategory);
    }

    if (filtered.length === 0) {
      dom.tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-12 text-slate-400">
            <div class="text-2xl mb-1">🔍</div>
            <div class="font-bold text-slate-300">No matching SKUs found</div>
            <div class="text-xs text-slate-500 mt-1">Try adjusting your search query or category filter</div>
          </td>
        </tr>
      `;
      return;
    }

    dom.tbody.innerHTML = filtered
      .map((item) => {
        // Did quantity increase recently?
        const prevAtp = state.previousCounts[item.sku_code];
        const isRecentlyUpdated =
          prevAtp !== undefined && item.atp_qty > prevAtp && state.previousCounts !== {};
        const flashClass = isRecentlyUpdated ? "row-updated-flash" : "";

        return `
          <tr class="hover:bg-slate-700/40 transition-colors ${flashClass}" data-sku="${item.sku_code}">
            <!-- SKU Code -->
            <td class="py-3 px-4 font-mono font-bold text-xs text-white">
              <span class="bg-slate-900 px-2 py-1 rounded border border-slate-700">${item.sku_code}</span>
            </td>

            <!-- Item Name & Category -->
            <td class="py-3 px-4">
              <div class="font-bold text-white leading-snug">${item.item_name}</div>
              <div class="text-[11px] text-slate-400 font-medium">${item.category || "General"}</div>
            </td>

            <!-- Location -->
            <td class="py-3 px-3 text-xs text-slate-300 font-mono">
              ${item.location || "Receiving Staging"}
            </td>

            <!-- Physical On-Hand -->
            <td class="py-3 px-3 text-right font-mono font-bold text-slate-200">
              ${item.physical_on_hand} <span class="text-[10px] text-slate-400 font-normal">${item.unit || "pcs"}</span>
            </td>

            <!-- Available-To-Promise (ATP) - HERO COLUMN -->
            <td class="py-3 px-4 text-right">
              <span class="text-base sm:text-lg font-black font-mono text-emerald-400 tracking-tight">
                ${item.atp_qty}
              </span>
              <span class="text-[10px] text-emerald-500/80 block font-semibold leading-none">${item.unit || "pcs"} ATP</span>
            </td>

            <!-- Quarantine -->
            <td class="py-3 px-3 text-right font-mono">
              ${
                item.quarantine_qty > 0
                  ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-500/50">${item.quarantine_qty} ${item.unit}</span>`
                  : `<span class="text-slate-500 text-xs">0</span>`
              }
            </td>

            <!-- Trust Status Badge -->
            <td class="py-3 px-3 text-center">
              ${renderTrustBadge(item.trust_status)}
            </td>

            <!-- Last Updated Relative Time -->
            <td class="py-3 px-4 text-right text-xs text-slate-400 font-mono">
              ${formatRelativeTime(item.last_updated)}
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function render() {
    renderMetrics();
    renderTable();
  }

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  function attachEvents() {
    if (dom.searchInput) {
      dom.searchInput.oninput = (e) => {
        state.searchQuery = e.target.value;
        renderTable();
      };
    }

    if (dom.categoryFilter) {
      dom.categoryFilter.onchange = (e) => {
        state.selectedCategory = e.target.value;
        renderTable();
      };
    }

    if (dom.btnRefresh) {
      dom.btnRefresh.onclick = () => {
        fetchInventory();
      };
    }

    if (dom.btnModeToggle) {
      dom.btnModeToggle.onclick = () => {
        const next = state.mode === "mock" ? "live" : "mock";
        window.Api.setMode(next);
        state.mode = next;
        fetchInventory();
      };
    }

    if (dom.btnResetDemo) {
      dom.btnResetDemo.onclick = async () => {
        if (confirm("Reset demo database back to clean baseline?")) {
          await window.Api.resetDemo();
          fetchInventory();
        }
      };
    }
  }

  // -------------------------------------------------------------------------
  // Initialization & Real-Time Live Sync
  // -------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    cacheDom();
    attachEvents();
    fetchInventory();

    // Cross-tab broadcast channel listener: Auto-updates when goods are confirmed in scanner tab!
    if (window.Api && window.Api.onStateChange) {
      window.Api.onStateChange(() => {
        console.log("[Counter] Reactive state change detected from scanner tab. Refreshing ATP...");
        fetchInventory();
      });
    }

    // Auto-refresh poll every 30 seconds as safeguard
    setInterval(fetchInventory, 30000);
  });
})();

