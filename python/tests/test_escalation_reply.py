from __future__ import annotations

import pytest

from .helpers import make_client, wait_for
from .mock_server import start_mock_server


@pytest.mark.asyncio
async def test_reply_escalation_continue() -> None:
    server = await start_mock_server(auto_init_echo=True, enable_schema_validation=True)
    received: list[dict[str, object]] = []
    client = make_client(server, received)

    try:
        await client.connect()
        await wait_for(lambda: client.session_id is not None)

        await client.reply_escalation(
            escalation_id="esc_123",
            wait_token="wait_123",
            action="continue",
        )
        await wait_for(lambda: any(msg["type"] == "escalation::reply" for msg in server.received))

        reply = next(msg for msg in server.received if msg["type"] == "escalation::reply")
        assert reply["payload"]["escalation_id"] == "esc_123"  # type: ignore[index]
        assert reply["payload"]["action"] == "continue"  # type: ignore[index]
        assert reply["payload"]["wait_token"] == "wait_123"  # type: ignore[index]
        assert "content" not in reply["payload"]  # type: ignore[operator]
        assert "escalationId" not in reply["payload"]  # type: ignore[operator]
        assert "waitToken" not in reply["payload"]  # type: ignore[operator]
        assert server.schema_violations == []
    finally:
        await client.disconnect()
        await server.close()


@pytest.mark.asyncio
async def test_reply_escalation_operator_input() -> None:
    server = await start_mock_server(auto_init_echo=True, enable_schema_validation=True)
    received: list[dict[str, object]] = []
    client = make_client(server, received)

    try:
        await client.connect()
        await wait_for(lambda: client.session_id is not None)

        await client.reply_escalation(
            escalation_id="esc_456",
            wait_token="wait_456",
            action="operator_input",
            content={"resolution": "approved"},
            meta={"operator_id": "op_1"},
        )
        await wait_for(lambda: any(msg["type"] == "escalation::reply" for msg in server.received))

        reply = next(msg for msg in server.received if msg["type"] == "escalation::reply")
        assert reply["payload"]["escalation_id"] == "esc_456"  # type: ignore[index]
        assert reply["payload"]["action"] == "operator_input"  # type: ignore[index]
        assert reply["payload"]["wait_token"] == "wait_456"  # type: ignore[index]
        assert reply["payload"]["content"] == {"resolution": "approved"}  # type: ignore[index]
        assert reply["payload"]["meta"] == {"operator_id": "op_1"}  # type: ignore[index]
        assert server.schema_violations == []
    finally:
        await client.disconnect()
        await server.close()


@pytest.mark.asyncio
async def test_reply_escalation_reply_user() -> None:
    server = await start_mock_server(auto_init_echo=True, enable_schema_validation=True)
    received: list[dict[str, object]] = []
    client = make_client(server, received)

    try:
        await client.connect()
        await wait_for(lambda: client.session_id is not None)

        await client.reply_escalation(
            escalation_id="esc_789",
            wait_token="wait_789",
            action="reply_user",
            content="Need more information",
        )
        await wait_for(lambda: any(msg["type"] == "escalation::reply" for msg in server.received))

        reply = next(msg for msg in server.received if msg["type"] == "escalation::reply")
        assert reply["payload"]["escalation_id"] == "esc_789"  # type: ignore[index]
        assert reply["payload"]["action"] == "reply_user"  # type: ignore[index]
        assert reply["payload"]["wait_token"] == "wait_789"  # type: ignore[index]
        assert reply["payload"]["content"] == "Need more information"  # type: ignore[index]
        assert server.schema_violations == []
    finally:
        await client.disconnect()
        await server.close()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        (
            {
                "escalation_id": "   ",
                "wait_token": "wait_1",
                "action": "continue",
            },
            "escalation_id is required",
        ),
        (
            {
                "escalation_id": "esc_1",
                "wait_token": "   ",
                "action": "continue",
            },
            "wait_token is required",
        ),
        (
            {
                "escalation_id": "esc_1",
                "wait_token": "wait_1",
                "action": "bad_action",
            },
            "Unsupported escalation reply action: bad_action",
        ),
        (
            {
                "escalation_id": "esc_1",
                "wait_token": "wait_1",
                "action": "operator_input",
            },
            "content must be a string or object for escalation action operator_input",
        ),
        (
            {
                "escalation_id": "esc_1",
                "wait_token": "wait_1",
                "action": "reply_user",
            },
            "content must be a string or object for escalation action reply_user",
        ),
        (
            {
                "escalation_id": "esc_1",
                "wait_token": "wait_1",
                "action": "operator_input",
                "content": 42,
            },
            "content must be a string or object for escalation action operator_input",
        ),
        (
            {
                "escalation_id": "esc_1",
                "wait_token": "wait_1",
                "action": "reply_user",
                "content": ["x"],
            },
            "content must be a string or object for escalation action reply_user",
        ),
    ],
)
async def test_reply_escalation_rejects_invalid_payload(
    kwargs: dict[str, object],
    message: str,
) -> None:
    server = await start_mock_server(auto_init_echo=True, enable_schema_validation=True)
    received: list[dict[str, object]] = []
    client = make_client(server, received)

    try:
        await client.connect()
        await wait_for(lambda: client.session_id is not None)

        with pytest.raises(Exception) as exc_info:
            await client.reply_escalation(**kwargs)  # type: ignore[arg-type]

        err = exc_info.value
        assert getattr(err, "code", None) == "transport_protocol_violation"
        assert str(err) == message
        assert not any(msg["type"] == "escalation::reply" for msg in server.received)
    finally:
        await client.disconnect()
        await server.close()


@pytest.mark.asyncio
async def test_reply_escalation_requires_session() -> None:
    server = await start_mock_server(auto_init_echo=False)
    received: list[dict[str, object]] = []
    client = make_client(server, received)

    try:
        await client.connect()

        with pytest.raises(Exception) as exc_info:
            await client.reply_escalation(
                escalation_id="esc_1",
                wait_token="wait_1",
                action="continue",
            )

        err = exc_info.value
        assert getattr(err, "code", None) == "session_not_ready"
    finally:
        await client.disconnect()
        await server.close()
