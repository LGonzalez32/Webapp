import json
import os
from typing import Any, AsyncIterator

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
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


def _get_api_key() -> str:
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="CONFIG_MISSING")
    return api_key


def _check_status(status_code: int) -> None:
    if status_code == 401:
        raise HTTPException(status_code=401, detail="INVALID_KEY")
    if status_code == 429:
        raise HTTPException(status_code=429, detail="RATE_LIMIT")
    if status_code >= 400:
        raise HTTPException(status_code=502, detail="API_ERROR")


@router.post("/chat")
async def proxy_chat(body: ChatRequest):
    api_key = _get_api_key()
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

    _check_status(resp.status_code)
    return resp.json()


# ─── SSE streaming endpoint ──────────────────────────────────────────────────


async def _stream_deepseek(api_key: str, payload: dict[str, Any]) -> AsyncIterator[str]:
    """Proxy DeepSeek stream → SSE events for the frontend."""
    payload["stream"] = True

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                DEEPSEEK_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json=payload,
            ) as resp:
                _check_status(resp.status_code)

                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data.strip() == "[DONE]":
                        yield "data: [DONE]\n\n"
                        return
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0].get("delta", {})
                        token = delta.get("content")
                        if token:
                            yield f"data: {json.dumps({'token': token})}\n\n"
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

    except httpx.TimeoutException:
        yield f"data: {json.dumps({'error': 'API_ERROR'})}\n\n"
    except Exception:
        yield f"data: {json.dumps({'error': 'API_ERROR'})}\n\n"


@router.post("/chat/stream")
async def proxy_chat_stream(body: ChatRequest):
    api_key = _get_api_key()
    payload = body.model_dump(exclude_none=True)

    return StreamingResponse(
        _stream_deepseek(api_key, payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
