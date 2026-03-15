import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    model: str = "deepseek-chat"
    max_tokens: int = 1024
    temperature: float | None = None
    top_p: float | None = None
    frequency_penalty: float | None = None
    stream: bool = False


@router.post("/chat")
async def proxy_chat(body: ChatRequest):
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="CONFIG_MISSING")

    payload = body.model_dump(exclude_none=True)

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                DEEPSEEK_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json=payload,
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="API_ERROR")
    except Exception:
        raise HTTPException(status_code=502, detail="API_ERROR")

    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="INVALID_KEY")
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="RATE_LIMIT")
    if not resp.is_success:
        raise HTTPException(status_code=502, detail="API_ERROR")

    data = resp.json()
    return {"content": data["choices"][0]["message"]["content"]}
