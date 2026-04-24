"""Tests for PaddleX layout server."""

from __future__ import annotations

import io
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image


def _make_test_png() -> bytes:
    img = Image.new("RGB", (200, 300), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class MockBox:
    def __init__(self, label: str, coordinate: list[float], score: float):
        self.label = label
        self.coordinate = coordinate
        self.score = score

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)


class MockLayoutRes:
    def __init__(self):
        self.boxes = [
            MockBox("formula", [10, 20, 100, 50], 0.95),
            MockBox("table", [10, 100, 180, 200], 0.88),
        ]


class MockResult:
    layout_det_res = MockLayoutRes()
    formula_res_list: list[Any] = []


def _create_test_client():
    with patch("server.create_pipeline"):
        from server import PaddleXLayoutServer

        srv = PaddleXLayoutServer()
        srv.pipeline.predict = MagicMock(
            return_value=iter([MockResult()])
        )
        # Attach mock for formula latex
        from normalize import correlate_formula_latex

        patched_normalize = normalize
        return TestClient(srv._create_app()), srv


@pytest.fixture
def client():
    tc, _ = _create_test_client()
    yield tc


def test_health(client: TestClient):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


def test_layout_endpoint_returns_normalized(client: TestClient):
    png_bytes = _make_test_png()
    resp = client.post(
        "/layout",
        files={"file": ("test.png", png_bytes, "image/png")},
        data={"threshold": "0.5"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["image_width"] == 200
    assert body["image_height"] == 300
    assert len(body["layout"]) == 2
    assert body["layout"][0]["type"] == "formula"
    assert body["layout"][1]["type"] == "table"


def test_threshold_filter(client: TestClient):
    png_bytes = _make_test_png()
    resp = client.post(
        "/layout",
        files={"file": ("test.png", png_bytes, "image/png")},
        data={"threshold": "0.9"},
    )
    assert resp.status_code == 200
    body = resp.json()
    # Only the formula box (0.95) passes 0.9 threshold
    assert len(body["layout"]) == 1
    assert body["layout"][0]["type"] == "formula"


def test_rejects_non_image(client: TestClient):
    resp = client.post(
        "/layout",
        files={"file": ("test.txt", b"not an image", "text/plain")},
        data={"threshold": "0.5"},
    )
    assert resp.status_code == 500
