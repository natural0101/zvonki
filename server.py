from fastapi import FastAPI
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import requests
import os
from urllib.parse import urlparse
import uvicorn

app = FastAPI()

# Разрешаем запросы с любых origin (удобно для тестов)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Каталог для хранения mp3.
# В Railway лучше примонтировать Volume в /data
DATA_DIR = os.getenv("DATA_DIR", "data")
os.makedirs(DATA_DIR, exist_ok=True)


def extract_talk_id(url: str) -> str:
    """
    Извлекаем audXXXXX из presigned URL
    .../audqdmn635tp58l3ugmf?X-Amz-...
    -> audqdmn635tp58l3ugmf
    """
    parsed = urlparse(url)
    base = os.path.basename(parsed.path)
    base = base.split(".")[0]
    return base or "unknown"


def download_and_save(talk_id: str, url: str) -> str:
    """
    Качаем mp3 по presigned URL и кладём в DATA_DIR/{talk_id}.mp3.
    Возвращаем публичную ссылку на файл.
    """
    filename = f"{talk_id}.mp3"
    path = os.path.join(DATA_DIR, filename)

    r = requests.get(url, timeout=60)
    r.raise_for_status()

    with open(path, "wb") as f:
        f.write(r.content)

    public_url = f"/files/{filename}"
    return public_url


@app.post("/upload_urls")
def upload_urls(urls: list[str]):
    """
    Тело запроса:
    [
      "https://storage.yandexcloud.net/...audXXXX...?X-Amz-...",
      ...
    ]
    """
    result = []

    for url in urls:
        talk_id = extract_talk_id(url)
        try:
            public_path = download_and_save(talk_id, url)
            result.append(
                {
                    "talkId": talk_id,
                    # Railway сам подставит домен, важно только путь
                    "publicUrl": public_path,
                }
            )
        except Exception as e:
            result.append({"talkId": talk_id, "error": str(e)})

    return JSONResponse(result)


@app.get("/files/{filename}")
def serve_file(filename: str):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        return FileResponse(path, media_type="audio/mpeg")
    return JSONResponse({"error": "not found"}, status_code=404)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
