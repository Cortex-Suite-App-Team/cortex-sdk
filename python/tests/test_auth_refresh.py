"""
auth_refresh transcript:
Verifies proactive token refresh logic via is_token_expiring_soon().
Full connect → message → answer flow also exercised.
"""
from __future__ import annotations

import base64
import json
import time

import pytest

from cortex_sdk.auth import is_token_expiring_soon

from .helpers import make_client, wait_for
from .mock_server import start_mock_server


def _make_jwt(claims: dict) -> str:
    """Build a minimal unsigned JWT for testing."""
    header = base64.urlsafe_b64encode(
        json.dumps({"alg": "HS256", "typ": "JWT"}).encode()
    ).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(
        json.dumps(claims).encode()
    ).rstrip(b"=").decode()
    return f"{header}.{payload}.fakesig"


def test_is_token_expiring_soon_expired() -> None:
    token = _make_jwt({"exp": int(time.time()) - 10})
    assert is_token_expiring_soon(token) is True


def test_is_token_expiring_soon_fresh() -> None:
    token = _make_jwt({"exp": int(time.time()) + 3600})
    assert is_token_expiring_soon(token) is False


def test_is_token_expiring_soon_within_buffer() -> None:
    # Expires in 30 s — inside the 60 s buffer
    token = _make_jwt({"exp": int(time.time()) + 30})
    assert is_token_expiring_soon(token) is True


@pytest.mark.asyncio
async def test_auth_refresh_full_flow() -> None:
    """Full connect → message → answer flow (token is valid, no refresh needed)."""
    server = await start_mock_server(auto_chat_answer=True, auto_init_echo=True)

    received = []
    client = make_client(server, received)

    try:
        await client.connect()
        await wait_for(lambda: client.session_id is not None)

        await client.send_message("First message before refresh")
        await wait_for(
            lambda: any(
                m["type"] == "chat::answer" and m["payload"].get("answer_kind") == "final"
                for m in received
            ),
        )

        assert any(m["type"] == "chat::answer" for m in received)
    finally:
        await client.disconnect()
        await server.close()
