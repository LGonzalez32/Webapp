import json
import logging
import os
import time
import uuid
from typing import Any, AsyncIterator, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

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


async def get_http_client(request: Request) -> httpx.AsyncClient:
    """Dependency: surface the singleton built in main.py:lifespan.

    Explicit injection (not request.app.state.http_client direct access)
    keeps handlers testable via app.dependency_overrides.
    """
    return request.app.state.http_client


@router.post("/chat")
async def proxy_chat(
    body: ChatRequest,
    http: httpx.AsyncClient = Depends(get_http_client),
):
    api_key = _get_api_key()
    payload = body.model_dump(exclude_none=True)

    try:
        resp = await http.post(
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
#
# Note on instrumentation (QW3): backend is a pure proxy — it does NOT build
# the prompt; the frontend sends the full messages array. So `t_prompt_built`
# is intentionally omitted from the timing dict.


def _build_timing(
    request_id: str,
    t_request_received: float,
    t_upstream_connect: float,
    t_first_byte_upstream: Optional[float],
    t_first_byte_client: Optional[float],
    t_last_byte: Optional[float],
    chunks_received: int,
    last_chunk_data: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Build the per-request timing dict.

    Distinguishes null (no usage info from upstream) from 0 (real cache miss).
    """
    usage = (last_chunk_data or {}).get("usage") if last_chunk_data else None
    model_used = (last_chunk_data or {}).get("model") if last_chunk_data else None

    def _delta_ms(a: Optional[float], b: Optional[float]) -> Optional[float]:
        if a is None or b is None:
            return None
        return round((b - a) * 1000.0, 2)

    if usage:
        cache_hit = usage.get("prompt_cache_hit_tokens")
        cache_miss = usage.get("prompt_cache_miss_tokens")
        prompt_tokens = usage.get("prompt_tokens")
        completion_tokens = usage.get("completion_tokens")
    else:
        cache_hit = None
        cache_miss = None
        prompt_tokens = None
        completion_tokens = None

    return {
        "request_id": request_id,
        "ttft_upstream_ms": _delta_ms(t_upstream_connect, t_first_byte_upstream),
        "proxy_overhead_ms": _delta_ms(t_first_byte_upstream, t_first_byte_client),
        "generation_ms": _delta_ms(t_first_byte_upstream, t_last_byte),
        "total_handler_ms": _delta_ms(t_request_received, time.perf_counter()),
        "chunks": chunks_received,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cache_hit_tokens": cache_hit,
        "cache_miss_tokens": cache_miss,
        "model": model_used,
    }


async def _stream_deepseek(
    http: httpx.AsyncClient,
    api_key: str,
    payload: dict[str, Any],
    request_id: str,
    t_request_received: float,
) -> AsyncIterator[str]:
    """Proxy DeepSeek stream → SSE events for the frontend."""
    payload["stream"] = True
    # OpenAI-compatible: ask provider to emit usage in final chunk.
    payload.setdefault("stream_options", {"include_usage": True})

    t_first_byte_upstream: Optional[float] = None
    t_first_byte_client: Optional[float] = None
    last_chunk_data: Optional[dict[str, Any]] = None
    chunks_received = 0
    t_upstream_connect = time.perf_counter()

    try:
        async with http.stream(
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
                    break

                if t_first_byte_upstream is None:
                    t_first_byte_upstream = time.perf_counter()

                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue

                last_chunk_data = chunk
                chunks_received += 1

                choices = chunk.get("choices") or []
                if choices:
                    delta = choices[0].get("delta") or {}
                    token = delta.get("content")
                    if token:
                        if t_first_byte_client is None:
                            t_first_byte_client = time.perf_counter()
                        yield f"data: {json.dumps({'token': token})}\n\n"

        t_last_byte = time.perf_counter()

        timing = _build_timing(
            request_id=request_id,
            t_request_received=t_request_received,
            t_upstream_connect=t_upstream_connect,
            t_first_byte_upstream=t_first_byte_upstream,
            t_first_byte_client=t_first_byte_client,
            t_last_byte=t_last_byte,
            chunks_received=chunks_received,
            last_chunk_data=last_chunk_data,
        )

        # Structured log line (one JSON per request, parseable from Render logs).
        logger.info(json.dumps({"evt": "chat_timing", **timing}))

        # Named SSE event so the existing frontend parser (which only handles
        # `data: {token: ...}` and `data: [DONE]`) ignores it silently.
        yield f"event: timing\ndata: {json.dumps(timing)}\n\n"
        yield "data: [DONE]\n\n"

    except HTTPException:
        raise
    except httpx.TimeoutException:
        logger.warning(json.dumps({
            "evt": "chat_error", "request_id": request_id, "error": "timeout",
        }))
        yield f"data: {json.dumps({'error': 'API_ERROR'})}\n\n"
    except Exception as e:
        logger.warning(json.dumps({
            "evt": "chat_error", "request_id": request_id,
            "error": type(e).__name__,
        }))
        yield f"data: {json.dumps({'error': 'API_ERROR'})}\n\n"


@router.post("/chat/stream")
async def proxy_chat_stream(
    body: ChatRequest,
    http: httpx.AsyncClient = Depends(get_http_client),
):
    api_key = _get_api_key()
    payload = body.model_dump(exclude_none=True)
    request_id = uuid.uuid4().hex[:8]
    t_request_received = time.perf_counter()

    return StreamingResponse(
        _stream_deepseek(http, api_key, payload, request_id, t_request_received),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Request-Id": request_id,
        },
    )
