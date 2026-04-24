"""LiteParse + PaddleX layout service. Single API to parse PDF/DOCX to text."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.param_functions import File
from pydantic import BaseModel

LAYOUT_SERVER_URL = os.getenv("LAYOUT_SERVER_URL", "http://localhost:8830/layout")
LIT_BIN = os.getenv("LIT_BIN", "lit")
logger = logging.getLogger(__name__)


class ParseResponse(BaseModel):
    text: str
    pages: list[dict[str, Any]]


class HealthResponse(BaseModel):
    status: str
    layout_server: str


app = FastAPI(title="LiteParse Service")


@app.post("/parse", response_model=ParseResponse)
async def parse(file: UploadFile = File(...)) -> ParseResponse:
    tmp_path: str | None = None
    out_path: str | None = None
    try:
        suffix = Path(file.filename or "doc.pdf").suffix
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        out_path = tmp_path + ".json"
        cmd = [
            LIT_BIN, "parse", tmp_path,
            "--format", "json",
            "-o", out_path,
        ]
        if LAYOUT_SERVER_URL:
            cmd += ["--layout-server-url", LAYOUT_SERVER_URL]
        # if OCR_SERVER_URL:
        #     cmd += ["--ocr-server-url", OCR_SERVER_URL]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Parse failed: {result.stderr[:500]}")

        with open(out_path, encoding="utf-8") as f:
            data = json.load(f)

        pages = [
            {"page": p.get("page"), "text": p.get("text", "")}
            for p in data.get("pages", [])
        ]

        return ParseResponse(text=data.get("text", ""), pages=pages)

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Parse timed out (300s)")
    finally:
        for p in (tmp_path, out_path):
            if p:
                Path(p).unlink(missing_ok=True)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="healthy", layout_server=LAYOUT_SERVER_URL)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8080)
