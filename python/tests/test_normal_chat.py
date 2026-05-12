"""
normal_chat transcript:  system::init → chat::message → chat::answer
"""
from __future__ import annotations

import pytest

from .helpers import make_client, wait_for
from .mock_server import FIXED_SESSION_ID, start_mock_server


@pytest.mark.asyncio
async def test_normal_chat() -> None:
    server = await start_mock_server(auto_chat_answer=True, auto_init_echo=True)

    received = []
    client = make_client(server, received)

    try:
        await client.connect()

        # session_id should be populated after first server message (echo)
        await wait_for(lambda: client.session_id is not None)
        assert client.session_id == FIXED_SESSION_ID
        assert client.channel_state == "OPEN"

        await client.send_message("Hello runtime")

        await wait_for(
            lambda: any(
                m["type"] == "chat::answer" and m["payload"].get("answer_kind") == "final"
                for m in received
            )
        )

        answer = next(
            m for m in received
            if m["type"] == "chat::answer" and m["payload"].get("answer_kind") == "final"
        )
        assert answer["payload"]["role"] == "assistant"
        assert answer["payload"]["answer_kind"] == "final"

        # system::init must be sent without session_id
        init_msg = next(m for m in server.received if m["type"] == "system::init")
        assert "session_id" not in init_msg
        assert str(init_msg["meta"]["client_msg_id"]).startswith("cli_init_")  # type: ignore[index]

        # chat::message must carry role=user
        chat_msg = next(m for m in server.received if m["type"] == "chat::message")
        assert chat_msg["payload"]["content"] == "Hello runtime"  # type: ignore[index]
        assert chat_msg["payload"]["role"] == "user"  # type: ignore[index]
    finally:
        await client.disconnect()
        await server.close()
