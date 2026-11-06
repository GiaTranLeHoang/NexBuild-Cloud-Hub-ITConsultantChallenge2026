/**
 * NexBuild Cloud Hub - Effects, Haptics & Micro-Interactions (fx.js)
 * Lightweight helpers for haptics (navigator.vibrate) and smooth numeric count-ups.
 * Honors prefers-reduced-motion and user vibration toggle.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Fx = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_VIBRATION = "nbx_vibration";

  function isVibrationEnabled() {
    try {
      const stored = localStorage.getItem(STORAGE_VIBRATION);
      return stored !== "false"; // default ON
    } catch {
      return true;
    }
  }

  function setVibrationEnabled(enabled) {
    try {
      localStorage.setItem(STORAGE_VIBRATION, enabled ? "true" : "false");
    } catch (e) {
      console.warn("[Fx] Could not save vibration preference", e);
    }
  }

  function prefersReducedMotion() {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Haptic Feedback Patterns
  function vibrate(pattern) {
    if (!isVibrationEnabled()) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(pattern);
      } catch (err) {
        // Silently ignore if blocked by browser policy
      }
    }
  }

  // Short pulse on scan complete (40ms)
  function vibrateScanComplete() {
    vibrate(40);
  }

  // Double pulse on confirm success (50ms on, 60ms pause, 50ms on)
  function vibrateConfirmSuccess() {
    vibrate([50, 60, 50]);
  }

  // Long pulse on error (120ms)
  function vibrateError() {
    vibrate(120);
  }

  // Number count-up animation over 200-300ms
  function animateCountUp(element, endVal, duration = 250) {
    if (!element) return;
    if (prefersReducedMotion() || isNaN(endVal)) {
      element.textContent = endVal;
      return;
    }

    const startVal = 0;
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const current = Math.round(startVal + (endVal - startVal) * (1 - Math.pow(1 - progress, 3)));
      element.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = endVal;
      }
    }

    requestAnimationFrame(update);
  }

  return {
    isVibrationEnabled,
    setVibrationEnabled,
    prefersReducedMotion,
    vibrateScanComplete,
    vibrateConfirmSuccess,
    vibrateDoublePulse: vibrateConfirmSuccess,
    vibrateError,
    animateCountUp,
  };
});

