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
    updatedSkus: new Set(), // Set of sku_code updated in current session
    updatedDeltas: {},      // sku_code -> delta (+amount)
    searchQuery: "",
    selectedCategory: "",
    lastSyncTime: new Date(),
    mode: window.Api ? window.Api.getMode() : "mock",
    loading: false,
  };

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

  // DOM Mount Points
  let dom = {};

  function cacheDom() {
    dom = {
      tbody: document.getElementById("inventory-tbody"),
      searchInput: document.getElementById("search-input"),
      btnClearSearch: document.getElementById("btn-clear-search"),
      skuCountBadge: document.getElementById("sku-count-badge"),
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
        // Detect SKUs that received stock increases for real-time row flash
        const newUpdated = new Set();
        const newDeltas = {};

        if (state.items.length > 0) {
          resp.items.forEach((newItem) => {
            const old = state.items.find((i) => i.sku_code === newItem.sku_code);
            if (old && newItem.atp_qty > old.atp_qty) {
              const delta = Math.round((newItem.atp_qty - old.atp_qty) * 10) / 10;
              newUpdated.add(newItem.sku_code);
              newDeltas[newItem.sku_code] = delta;
            }
          });
        }

        if (newUpdated.size > 0) {
          state.updatedSkus = newUpdated;
          state.updatedDeltas = newDeltas;
          // Clear flash animation after 3.2s
          setTimeout(() => {
            state.updatedSkus = new Set();
            state.updatedDeltas = {};
            renderTable();
          }, 3200);
        }

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

    // Zero CLS: Show structured skeleton rows while initial fetch is loading
    if (state.loading && state.items.length === 0) {
      dom.tbody.innerHTML = Array.from({ length: 6 })
        .map(
          () => `
          <tr class="skeleton-shimmer border-b border-slate-800">
            <td class="py-3 px-4"><div class="h-6 w-20 bg-slate-700/60 rounded"></div></td>
            <td class="py-3 px-4"><div class="h-4 w-48 bg-slate-700/60 rounded mb-1"></div><div class="h-3 w-24 bg-slate-800 rounded"></div></td>
            <td class="py-3 px-3"><div class="h-4 w-28 bg-slate-700/50 rounded"></div></td>
            <td class="py-3 px-3 text-right"><div class="h-4 w-14 bg-slate-700/50 rounded ml-auto"></div></td>
            <td class="py-3 px-4 text-right"><div class="h-6 w-16 bg-emerald-950/60 rounded ml-auto"></div></td>
            <td class="py-3 px-3 text-right"><div class="h-4 w-10 bg-slate-800 rounded ml-auto"></div></td>
            <td class="py-3 px-3 text-center"><div class="h-5 w-20 bg-slate-800 rounded mx-auto"></div></td>
            <td class="py-3 px-4 text-right"><div class="h-4 w-16 bg-slate-800 rounded ml-auto"></div></td>
          </tr>
        `
        )
        .join("");
      return;
    }

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

    // Update SKU Count Badge & Clear Search Button
    if (dom.skuCountBadge) {
      const filterSuffix = state.selectedCategory ? ` (${state.selectedCategory})` : "";
      dom.skuCountBadge.textContent = `Showing ${filtered.length} of ${state.items.length} SKUs${filterSuffix}`;
    }

    if (dom.btnClearSearch) {
      dom.btnClearSearch.style.display = state.searchQuery ? "flex" : "none";
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
        // Did quantity increase recently from scanner tab?
        const isRecentlyUpdated = state.updatedSkus && state.updatedSkus.has(item.sku_code);
        const flashClass = isRecentlyUpdated ? "row-updated-flash" : "";
        const delta = state.updatedDeltas ? state.updatedDeltas[item.sku_code] : null;

        return `
          <tr class="hover:bg-slate-700/40 transition-colors ${flashClass}" data-sku="${escapeHtml(item.sku_code)}">
            <!-- SKU Code -->
            <td class="py-3 px-4 font-mono font-bold text-xs text-white">
              <span class="bg-slate-900 px-2.5 py-1 rounded-md border border-slate-700 inline-block">${escapeHtml(item.sku_code)}</span>
            </td>

            <!-- Item Name & Category -->
            <td class="py-3 px-4">
              <div class="font-bold text-white leading-snug">${escapeHtml(item.item_name)}</div>
              <div class="text-[11px] text-slate-400 font-medium">${escapeHtml(item.category || "General")}</div>
            </td>

            <!-- Location -->
            <td class="py-3 px-3 text-xs text-slate-300 font-mono">
              ${escapeHtml(item.location || "Receiving Staging")}
            </td>

            <!-- Physical On-Hand -->
            <td class="py-3 px-3 text-right font-mono font-bold text-slate-200">
              ${item.physical_on_hand} <span class="text-[10px] text-slate-400 font-normal">${escapeHtml(item.unit || "pcs")}</span>
            </td>

            <!-- Available-To-Promise (ATP) - HERO COLUMN -->
            <td class="py-3 px-4 text-right">
              <div class="flex items-center justify-end gap-1.5 flex-wrap">
                ${
                  delta
                    ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-black font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">+${delta} PO</span>`
                    : ""
                }
                <span class="text-base sm:text-lg font-black font-mono text-emerald-400 tracking-tight">
                  ${item.atp_qty}
                </span>
              </div>
              <span class="text-[10px] text-emerald-500/80 block font-semibold leading-none">${escapeHtml(item.unit || "pcs")} ATP</span>
            </td>

            <!-- Quarantine -->
            <td class="py-3 px-3 text-right font-mono">
              ${
                item.quarantine_qty > 0
                  ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-500/50" title="Held in Bay GL-DK-9900">${item.quarantine_qty} ${escapeHtml(item.unit || "pcs")}</span>`
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

    if (dom.btnClearSearch) {
      dom.btnClearSearch.onclick = () => {
        state.searchQuery = "";
        if (dom.searchInput) {
          dom.searchInput.value = "";
          dom.searchInput.focus();
        }
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

    // Language Toggle Buttons in Counter Header
    document.querySelectorAll('[data-action="set-lang"]').forEach((btn) => {
      btn.onclick = () => {
        const lang = btn.getAttribute("data-lang");
        if (lang && window.I18n && typeof window.I18n.setLanguage === "function") {
          window.I18n.setLanguage(lang);
        }
      };
    });

    // Keyboard Shortcuts (Press '/' to search, 'Esc' to clear, 'r' to refresh)
    document.addEventListener("keydown", (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      if (e.key === "/" && activeTag !== "input" && activeTag !== "textarea" && activeTag !== "select") {
        e.preventDefault();
        if (dom.searchInput) {
          dom.searchInput.focus();
          dom.searchInput.select();
        }
      } else if (e.key === "Escape" && activeTag === "input") {
        if (dom.searchInput) {
          dom.searchInput.value = "";
          dom.searchInput.blur();
        }
        state.searchQuery = "";
        renderTable();
      } else if ((e.key === "r" || e.key === "R") && activeTag !== "input" && activeTag !== "textarea") {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          fetchInventory();
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Initialization & Real-Time Live Sync
  // -------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    cacheDom();
    attachEvents();
    fetchInventory();

    // Re-render when language switches
    if (window.I18n && typeof window.I18n.onLanguageChange === "function") {
      window.I18n.onLanguageChange(() => {
        renderTable();
      });
    }

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

