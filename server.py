import os
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import PlainTextResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI()

# Папка для сохранения mp3
STORAGE_DIR = os.getenv("STORAGE_DIR", str(BASE_DIR / "files"))
os.makedirs(STORAGE_DIR, exist_ok=True)

# Отдаём mp3 как статику по /files/*
app.mount("/files", StaticFiles(directory=STORAGE_DIR), name="files")

# Статика фронта (JS/CSS) по /static/*
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# Шаблоны HTML
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/", include_in_schema=False)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


class UploadedFile(BaseModel):
    talkId: str
    publicUrl: str


async def process_urls(raw: str, request: Request) -> list[UploadedFile]:
    # raw — всё тело запроса, как есть (text/plain)
    urls = [part.strip() for part in raw.split() if part.strip()]

    if not urls:
        raise HTTPException(status_code=400, detail="No URLs provided")

    results: list[UploadedFile] = []

    async with httpx.AsyncClient(timeout=60.0) as client:
        for url in urls:
            parsed = urlparse(url)

            # Берём последний сегмент пути как talkId
            filename_part = parsed.path.rstrip("/").split("/")[-1]
            if not filename_part:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot extract talkId from URL: {url}",
                )

            talk_id = filename_part
            target_filename = f"{talk_id}.mp3"
            target_path = os.path.join(STORAGE_DIR, target_filename)

            # Скачиваем файл по presigned URL
            resp = await client.get(url)
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to download {url}: {e}",
                )

            with open(target_path, "wb") as f:
                f.write(resp.content)

            base_url = str(request.base_url).rstrip("/")
            public_url = f"{base_url}/files/{target_filename}"

            results.append(
                UploadedFile(
                    talkId=talk_id,
                    publicUrl=public_url,
                )
            )

    return results


# 1) JSON-ответ
@app.post("/upload_urls", response_model=list[UploadedFile])
async def upload_urls(
    request: Request,
    raw: str = Body(..., media_type="text/plain"),
):
    return await process_urls(raw, request)


# 2) Чистые ссылки (под TSV/копипасту) — одна ссылка на строку
@app.post("/upload_urls_tsv", response_class=PlainTextResponse)
async def upload_urls_tsv(
    request: Request,
    raw: str = Body(..., media_type="text/plain"),
):
    files = await process_urls(raw, request)
    lines = [f.publicUrl for f in files]
    return "\n".join(lines)

