"""PaddleX layout detection + formula recognition server for LiteParse."""

from __future__ import annotations

import gc
import io
import logging
import tempfile
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.param_functions import File, Form
from PIL import Image
from pydantic import BaseModel

from paddlex import create_pipeline

from normalize import normalize

CONFIG_PATH = str(Path(__file__).parent / "my_config" / "formula_recognition.yaml")
logger = logging.getLogger(__name__)


class LayoutResponse(BaseModel):
    image_width: int
    image_height: int
    layout: list[dict[str, Any]]


class StatusResponse(BaseModel):
    status: str


class PaddleXLayoutServer:
    def __init__(self) -> None:
        logger.info("Loading PaddleX formula_recognition pipeline...")
        self.pipeline = create_pipeline(pipeline=CONFIG_PATH)
        logger.info("Pipeline loaded.")

    def _create_app(self) -> FastAPI:
        app = FastAPI()

        @app.post("/layout")
        async def layout_endpoint(
            file: UploadFile = File(...),
            threshold: float = Form(default=0.5),
        ) -> LayoutResponse:
            tmp_path: str | None = None
            try:
                image_data = await file.read()
                image = Image.open(io.BytesIO(image_data))
                if image.mode != "RGB":
                    image = image.convert("RGB")
                width, height = image.size

                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    image.save(tmp, format="PNG")
                    tmp_path = tmp.name

                results = self.pipeline.predict(
                    input=tmp_path,
                    use_layout_detection=True,
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                )

                items: list[dict[str, Any]] = []
                for res in results:
                    items.extend(normalize(res))

                # Release pipeline results before cleanup
                del results, res, image, image_data
            except Exception as e:
                logger.error("Pipeline error: %s", e)
                raise HTTPException(status_code=500, detail=str(e))
            finally:
                if tmp_path:
                    Path(tmp_path).unlink(missing_ok=True)
                gc.collect()

            # items = [it for it in items if it.get("confidence", 0) >= threshold]
            logger.info(
                "Layout: %dx%d image, %d elements (threshold=%.2f)",
                width, height, len(items), threshold,
            )

            return LayoutResponse(
                image_width=width,
                image_height=height,
                layout=items,
            )

        @app.get("/health")
        def health() -> StatusResponse:
            return StatusResponse(status="healthy")

        return app

    def serve(self) -> None:
        app = self._create_app()
        uvicorn.run(app, host="0.0.0.0", port=8830)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logging.info("Starting PaddleX layout server on port 8830")
    server = PaddleXLayoutServer()
    server.serve()
