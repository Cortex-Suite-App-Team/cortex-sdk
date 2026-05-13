from __future__ import annotations

import base64
import json
import time

import httpx

from .constants import (
    DEFAULT_AUTH_URL,
    AUTH_TOKEN_PATH,
    AUTH_REFRESH_PATH,
    TOKEN_REFRESH_BUFFER,
)
from .errors import make_error
from .types import AuthTokenResponse


def _parse_jwt_exp(token: str) -> float | None:
    """Extract exp (as Unix timestamp in seconds) from a JWT without verifying signature."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        # base64url → base64 standard (add padding)
        payload_b64 = parts[1]
        # Add padding
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload_json = base64.urlsafe_b64decode(payload_b64)
        payload = json.loads(payload_json)
        exp = payload.get("exp")
        return float(exp) if isinstance(exp, (int, float)) else None
    except Exception:
        return None


def is_token_expiring_soon(access_token: str) -> bool:
    """Return True if the token expires within TOKEN_REFRESH_BUFFER seconds."""
    exp = _parse_jwt_exp(access_token)
    if exp is None:
        return False
    return time.time() > exp - TOKEN_REFRESH_BUFFER


async def exchange_api_key(
    api_key: str,
    *,
    auth_base_url: str = DEFAULT_AUTH_URL,
    worker_ref: str | None = None,
) -> AuthTokenResponse:
    """Exchange an API key for tokens and WS URL."""
    request_kwargs: dict[str, object] = {
        "headers": {
            "Content-Type": "application/json",
            "Authorization": f"ApiKey {api_key}",
        },
    }
    if worker_ref:
        request_kwargs["json"] = {"worker_ref": worker_ref}
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _build_auth_endpoint(auth_base_url, AUTH_TOKEN_PATH),
            **request_kwargs,
        )

    if not resp.is_success:
        try:
            body = resp.json()
            code = body.get("error", "auth_invalid")
            message = body.get("message", "API key rejected")
        except Exception:
            code, message = "auth_invalid", "API key rejected"
        raise make_error(str(code), str(message))

    return resp.json()  # type: ignore[no-any-return]


async def refresh_access_token(
    refresh_token: str,
    *,
    auth_base_url: str = DEFAULT_AUTH_URL,
) -> str:
    """Refresh the access token using the refresh token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _build_auth_endpoint(auth_base_url, AUTH_REFRESH_PATH),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {refresh_token}",
            },
        )

    if not resp.is_success:
        raise make_error("auth_refresh_failed", "Refresh token expired or invalid")

    body = resp.json()
    return str(body["access_token"])


def normalize_auth_base_url(auth_url: str) -> str:
    import warnings
    normalized = auth_url.rstrip("/")
    # Guard: consumer may have passed a full endpoint instead of the base URL.
    # Strip known auth paths and warn so developers catch the misconfiguration early.
    for known_path in [AUTH_TOKEN_PATH, AUTH_REFRESH_PATH]:
        if normalized.endswith(known_path):
            base = normalized[: -len(known_path)]
            warnings.warn(
                f"[CortexSDK] auth_url must be a base URL (origin only), not a full endpoint. "
                f'Received "{auth_url}" — "{known_path}" has been stripped automatically. '
                f'Pass the base URL only, e.g., "{base}".',
                UserWarning,
                stacklevel=3,
            )
            normalized = base
            break
    return normalized or DEFAULT_AUTH_URL


def _build_auth_endpoint(auth_base_url: str, path: str) -> str:
    return f"{normalize_auth_base_url(auth_base_url)}{path}"
