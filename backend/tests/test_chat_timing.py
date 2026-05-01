"""QW3 — verify timing instrumentation on /api/v1/chat/stream.

The instrumentation must:
  * Emit a final SSE `event: timing` with per-stage ms + DeepSeek usage fields.
  * Distinguish null cache_hit_tokens (no usage from upstream) from 0 (real miss).
  * Log a structured JSON line `evt: chat_timing` for stdout/Render capture.

Without this test, future refactors of the handler can silently break the
instrumentation (the timing event would just stop emitting).
"""

from __future__ import annotations

import json
from typing import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient


def _sse_bytes(lines: list[str]) -> bytes:
    return ("".join(line + "\n" for line in lines)).encode()


def _mock_handler_full_usage(request: httpx.Request) -> httpx.Response:
    """Simulate DeepSeek emitting 3 content chunks + a final chunk with usage."""
    body = _sse_bytes([
        'data: {"choices":[{"delta":{"content":"Hola"}}],"model":"deepseek-chat"}',
        "",
        'data: {"choices":[{"delta":{"content":" "}}],"model":"deepseek-chat"}',
        "",
        'data: {"choices":[{"delta":{"content":"mundo"}}],"model":"deepseek-chat"}',
        "",
        'data: {"choices":[],"model":"deepseek-chat","usage":{'
        '"prompt_tokens":1234,"completion_tokens":3,'
        '"prompt_cache_hit_tokens":1024,"prompt_cache_miss_tokens":210}}',
        "",
        "data: [DONE]",
        "",
    ])
    return httpx.Response(
        200, content=body, headers={"content-type": "text/event-stream"},
    )


def _mock_handler_no_usage(request: httpx.Request) -> httpx.Response:
    """Simulate upstream that does NOT emit usage (timeout, partial, old API)."""
    body = _sse_bytes([
        'data: {"choices":[{"delta":{"content":"hi"}}],"model":"deepseek-chat"}',
        "",
        "data: [DONE]",
        "",
    ])
    return httpx.Response(
        200, content=body, headers={"content-type": "text/event-stream"},
    )


@pytest.fixture
def patch_deepseek(monkeypatch):
    """Replace httpx.AsyncClient inside the chat module with a MockTransport.

    This is the simplest injection that does not require refactoring the
    handler in this commit. QW1 (singleton + Depends) will switch to
    `app.dependency_overrides` for cleaner overrides.
    """
    import app.api.routes.chat as chat_mod

    real_async_client = chat_mod.httpx.AsyncClient
    handler_holder: dict[str, object] = {"handler": _mock_handler_full_usage}

    def factory(*args, **kwargs):
        kwargs.pop("http2", None)
        return real_async_client(
            transport=httpx.MockTransport(handler_holder["handler"]), **kwargs,
        )

    monkeypatch.setattr(chat_mod.httpx, "AsyncClient", factory)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")

    return handler_holder


def _client() -> TestClient:
    from main import app
    return TestClient(app)


def _read_full(stream: Iterator[bytes]) -> str:
    return b"".join(stream).decode("utf-8", errors="replace")


def _extract_timing(body: str) -> dict:
    lines = body.split("\n")
    for i, line in enumerate(lines):
        if line.strip() == "event: timing":
            for j in range(i + 1, min(i + 5, len(lines))):
                if lines[j].startswith("data: "):
                    return json.loads(lines[j][6:])
    raise AssertionError(f"no `event: timing` in body:\n{body[:500]}")


def test_timing_event_emitted_with_full_usage(patch_deepseek):
    client = _client()
    with client.stream(
        "POST", "/api/v1/chat/stream",
        json={"messages": [{"role": "user", "content": "hola"}]},
    ) as resp:
        assert resp.status_code == 200
        body = _read_full(resp.iter_bytes())

    assert "data: [DONE]" in body, "missing terminating [DONE]"
    assert "Hola" in body and "mundo" in body, "tokens not forwarded"

    timing = _extract_timing(body)
    assert timing["prompt_tokens"] == 1234
    assert timing["completion_tokens"] == 3
    assert timing["cache_hit_tokens"] == 1024
    assert timing["cache_miss_tokens"] == 210
    assert timing["model"] == "deepseek-chat"
    assert timing["chunks"] >= 3
    assert isinstance(timing["request_id"], str) and len(timing["request_id"]) == 8

    for k in ("ttft_upstream_ms", "generation_ms", "total_handler_ms"):
        assert timing[k] is not None and timing[k] >= 0, f"{k} should be set"


def test_timing_event_emits_null_when_usage_missing(patch_deepseek):
    """null vs 0 distinction: if upstream omits 'usage', we must report null,
    not 0 (which would mean a real cache miss).
    """
    patch_deepseek["handler"] = _mock_handler_no_usage

    client = _client()
    with client.stream(
        "POST", "/api/v1/chat/stream",
        json={"messages": [{"role": "user", "content": "hi"}]},
    ) as resp:
        body = _read_full(resp.iter_bytes())

    timing = _extract_timing(body)
    assert timing["cache_hit_tokens"] is None
    assert timing["cache_miss_tokens"] is None
    assert timing["prompt_tokens"] is None
    assert timing["completion_tokens"] is None


def test_timing_logs_structured_json(patch_deepseek, caplog):
    import logging
    caplog.set_level(logging.INFO, logger="app.api.routes.chat")

    client = _client()
    with client.stream(
        "POST", "/api/v1/chat/stream",
        json={"messages": [{"role": "user", "content": "hola"}]},
    ) as resp:
        list(resp.iter_bytes())  # drain

    timing_records = [
        r for r in caplog.records
        if r.message.startswith("{") and '"evt": "chat_timing"' in r.message
    ]
    assert len(timing_records) == 1, "exactly one chat_timing log line per request"

    parsed = json.loads(timing_records[0].message)
    assert parsed["evt"] == "chat_timing"
    assert parsed["cache_hit_tokens"] == 1024
    assert "request_id" in parsed
