"""
NexBuild Cloud Hub - AI OCR Service (Phase 2 Locked)
Extracts Delivery Note line items from scanned images.

Strategy:
- If use_demo_sample=True OR no valid image bytes / missing API key:
  Immediately return deterministic mock for PO-48213 (14 scanned lines, matching
  the Slide 4 spec with deliberate SHORT on PLAST-01 and UNKNOWN_SKU for FIX-M8).
- If use_demo_sample=False AND image_bytes provided AND GEMINI_API_KEY is set:
  Attempt a live Gemini Vision call, falling back to mock on any failure.

Output schema per line (snake_case):
    sku_code        str   - Barcode / printed SKU reference on delivery note
    item_name       str   - Printed item description
    received_qty    float - Physical count scanned from paper
    unit            str   - Unit of measure as printed
    confidence_score float - OCR / model confidence 0.0-1.0

Compatible with Python 3.9+.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

# ---------------------------------------------------------------------------
# Deterministic mock data — EXACTLY matches Phase 1 seed + challenge spec
# ---------------------------------------------------------------------------
# 14 lines: 4 "interesting" lines that drive the demo scenario + 10 standard
# full-match lines covering the remaining PO-48213 SKUs.

_MOCK_SCANNED_LINES: List[Dict[str, Any]] = [
    # --- Core demo lines (Slide 4) ---
    {
        "sku_code":        "CEM-25",
        "item_name":       "Aalborg Portland Rapid Cement 25kg",
        "received_qty":    80.0,
        "unit":            "bags",
        "confidence_score": 0.985,
    },
    {
        "sku_code":        "TIM-4595",
        "item_name":       "C24 Structural Timber 45x95mm 4.2m",
        "received_qty":    40.0,
        "unit":            "pcs",
        "confidence_score": 0.978,
    },
    {
        # Deliberate short delivery: 52 received vs 60 ordered → SHORT
        "sku_code":        "PLAST-01",
        "item_name":       "Gyproc Standard Plasterboard 13x1200x2400",
        "received_qty":    52.0,
        "unit":            "sheets",
        "confidence_score": 0.942,
    },
    {
        # Not on PO → UNKNOWN_SKU, low confidence (explicit challenge requirement)
        "sku_code":        "FIX-M8",
        "item_name":       "Fixings M8 Stainless Through-Bolt Anchors",
        "received_qty":    12.0,
        "unit":            "boxes",
        "confidence_score": 0.680,
    },
    # --- 10 standard full-match lines (all received == ordered) ---
    {
        "sku_code":        "INSUL-100",
        "item_name":       "Rockwool Flexi Acoustic Insulation 100mm",
        "received_qty":    50.0,
        "unit":            "packs",
        "confidence_score": 0.971,
    },
    {
        "sku_code":        "BRICK-RED",
        "item_name":       "Danish Red Facing Bricks RT 475",
        "received_qty":    1200.0,
        "unit":            "pcs",
        "confidence_score": 0.963,
    },
    {
        "sku_code":        "SAND-04",
        "item_name":       "Fine Grain Washed Sharp Sand 0-4mm 25kg",
        "received_qty":    100.0,
        "unit":            "bags",
        "confidence_score": 0.981,
    },
    {
        "sku_code":        "GRAV-1020",
        "item_name":       "Pea Shingle Drainage Gravel 10-20mm 25kg",
        "received_qty":    60.0,
        "unit":            "bags",
        "confidence_score": 0.975,
    },
    {
        "sku_code":        "REBAR-12",
        "item_name":       "High Yield Deformed Rebar Steel 12mm x 6m",
        "received_qty":    30.0,
        "unit":            "pcs",
        "confidence_score": 0.969,
    },
    {
        "sku_code":        "PLY-18",
        "item_name":       "Nordic Structural Birch Plywood 18mm",
        "received_qty":    25.0,
        "unit":            "sheets",
        "confidence_score": 0.977,
    },
    {
        "sku_code":        "SCREW-550",
        "item_name":       "Spax Stainless Torx Wood Screws 5.0x50mm (200pk)",
        "received_qty":    35.0,
        "unit":            "boxes",
        "confidence_score": 0.982,
    },
    {
        "sku_code":        "ROOF-FELT",
        "item_name":       "Icopal Top SBS Bitumen Roofing Felt 10m",
        "received_qty":    20.0,
        "unit":            "rolls",
        "confidence_score": 0.974,
    },
    {
        "sku_code":        "MORTAR-MIX",
        "item_name":       "Weber Premix Masonry Mortar M5 25kg",
        "received_qty":    75.0,
        "unit":            "bags",
        "confidence_score": 0.966,
    },
    {
        "sku_code":        "SEAL-SIL",
        "item_name":       "Dana Lim Sanitary Construction Silicone 310ml",
        "received_qty":    45.0,
        "unit":            "tubes",
        "confidence_score": 0.973,
    },
]

# Delivery note envelope metadata used by main.py to build the API response
MOCK_DELIVERY_METADATA: Dict[str, str] = {
    "delivery_note_id":     "DN-DK-2026-94821",
    "delivery_note_number": "DN-DK-2026-94821",
    "carrier":              "DSV Freight Denmark",
    "truck_plate":          "DK-88-TXP",
    "ocr_engine":           "NexBuild-Gemini-Vision-v2.5 (Demo Fallback)",
}


def _get_demo_lines() -> List[Dict[str, Any]]:
    """Return a deep copy of the deterministic 14-line mock dataset."""
    import copy
    return copy.deepcopy(_MOCK_SCANNED_LINES)


async def extract_delivery_note(
    image_bytes: Optional[bytes] = None,
    use_demo_sample: bool = True,
) -> List[Dict[str, Any]]:
    """
    Primary async entry point for Delivery Note extraction.

    Parameters
    ----------
    image_bytes:
        Raw bytes of the uploaded delivery-note image (JPEG / PNG / PDF-page).
        Ignored when use_demo_sample=True.
    use_demo_sample:
        When True (default), skip all external I/O and return the deterministic
        14-line mock for PO-48213.  Also forced to True when image_bytes is
        absent or GEMINI_API_KEY is not configured.

    Returns
    -------
    List of dicts, each representing one scanned line on the delivery note with
    keys: sku_code, item_name, received_qty, unit, confidence_score.
    """
    force_mock = use_demo_sample or not image_bytes or not GEMINI_API_KEY.strip()

    if not force_mock:
        try:
            return await _call_gemini_vision(image_bytes)  # type: ignore[arg-type]
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Gemini Vision call failed (%s). Falling back to demo mock.", exc
            )

    logger.info("ai_ocr_service: returning deterministic demo mock (14 lines).")
    return _get_demo_lines()


async def _call_gemini_vision(image_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Placeholder: calls Google Gemini Vision to parse a delivery-note image.

    In a real deployment this would use the `google-genai` SDK:

        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-2.5-flash")
        ...

    For now it is intentionally left as a stub that raises NotImplementedError
    so the caller's except block triggers graceful fallback to the mock.
    """
    raise NotImplementedError(
        "Live Gemini Vision call is not yet wired in this MVP build. "
        "Set use_demo_sample=True or omit image_bytes to use the demo mock."
    )


# ---------------------------------------------------------------------------
# Legacy synchronous shim kept for backwards-compat with any existing callers
# ---------------------------------------------------------------------------

def get_mock_delivery_note_scan(po_number: str = "PO-48213") -> Dict[str, Any]:
    """Synchronous wrapper — returns the full OCR envelope including metadata."""
    return {
        "status":               "success",
        "po_number":            po_number,
        "supplier":             "Nordic BuildSupply DK",
        "supplier_name":        "Nordic BuildSupply DK",
        "delivery_note_number": MOCK_DELIVERY_METADATA["delivery_note_number"],
        "delivery_note_id":     MOCK_DELIVERY_METADATA["delivery_note_id"],
        "delivery_date":        datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "carrier":              MOCK_DELIVERY_METADATA["carrier"],
        "truck_plate":          MOCK_DELIVERY_METADATA["truck_plate"],
        "ocr_engine":           MOCK_DELIVERY_METADATA["ocr_engine"],
        "scanned_raw_lines":    _get_demo_lines(),
    }


def process_delivery_note(
    po_number: str = "PO-48213",
    file_bytes: Optional[bytes] = None,
    simulated_text: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Legacy synchronous entry point.  Always returns the deterministic mock in
    Phase 1/2.  Kept for any existing call sites in main.py.
    """
    return get_mock_delivery_note_scan(po_number=po_number)
