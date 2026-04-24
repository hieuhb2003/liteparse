"""Normalize PaddleX pipeline output into LiteParse layout API response."""

from __future__ import annotations

from typing import Any


def _get(data: Any, key: str, default: Any = None) -> Any:
    """Unified accessor for dict-like and attribute-based objects."""
    if isinstance(data, dict):
        return data.get(key, default)
    return getattr(data, key, default)


def normalize(pipeline_result: Any) -> list[dict[str, Any]]:
    """Convert PaddleX pipeline result to layout item dicts.

    PaddleX predict() yields result objects where the actual data is
    nested under a 'res' key:

        {'res': {
            'layout_det_res': {
                'boxes': [
                    {'cls_id': 8, 'label': 'table',
                     'score': 0.959, 'coordinate': [x1, y1, x2, y2]},
                    ...
                ]
            },
            'formula_res_list': [
                {'rec_formula': '$LaTeX$',
                 'formula_region_id': N,
                 'dt_polys': ([x1, y1, x2, y2],)},
                ...
            ]
        }}

    formula_region_id is NOT a reliable index into boxes.
    Instead, match formulas to boxes by comparing dt_polys coordinates
    with layout box coordinates (they should be identical).
    """
    items: list[dict[str, Any]] = []

    res = _get(pipeline_result, "res", pipeline_result)

    layout_res = _get(res, "layout_det_res")
    if not layout_res:
        return items

    boxes = _get(layout_res, "boxes", [])
    if not boxes:
        return items

    # Build formula map: match by coordinate proximity
    # dt_polys format: ([x1, y1, x2, y2],) — tuple containing a list
    formula_map: dict[int, str] = {}
    formula_list = _get(res, "formula_res_list") or []
    for f_res in formula_list:
        latex = _get(f_res, "rec_formula")
        if not latex:
            continue

        dt_polys = _get(f_res, "dt_polys")
        if not dt_polys:
            continue

        # Extract coordinate list from dt_polys tuple
        poly_coord = dt_polys[0] if isinstance(dt_polys, tuple) and dt_polys else dt_polys
        if not poly_coord or len(poly_coord) < 4:
            continue

        poly_vals = [float(v) for v in poly_coord[:4]]

        # Match against layout boxes by coordinate proximity
        best_idx = -1
        best_dist = float("inf")
        for i, box in enumerate(boxes):
            coord = _get(box, "coordinate", [])
            if not coord or len(coord) < 4:
                continue
            box_vals = [float(v) for v in coord[:4]]
            dist = sum(abs(a - b) for a, b in zip(poly_vals, box_vals))
            if dist < best_dist:
                best_dist = dist
                best_idx = i

        # Tolerance: coordinates should be nearly identical (< 5px total drift)
        if best_idx >= 0 and best_dist < 5.0:
            formula_map[best_idx] = latex

    for i, box in enumerate(boxes):
        label = _get(box, "label", "")
        coord = _get(box, "coordinate", [])
        score = _get(box, "score", 0.0)

        bbox = [float(v) for v in coord]

        item: dict[str, Any] = {
            "type": label.lower() if label else "unknown",
            "bbox": bbox,
            "confidence": float(score),
        }
        if i in formula_map:
            item["latex"] = formula_map[i]
        items.append(item)

    return items
