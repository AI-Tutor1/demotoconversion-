"""FastAPI auth dependency — Supabase ES256 JWT verification via JWKS.

Every protected endpoint declares:
    user: AuthUser = Depends(require_auth)

This project's Supabase Auth mints user access tokens with ES256 (asymmetric)
signed by a rotating private key. We verify using the public JWKS endpoint
at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` (public, no apikey needed).

Why httpx for JWKS instead of PyJWKClient: PyJWKClient uses urllib, which on
macOS Python installs without the `Install Certificates.command` script run
fails with SSL CERTIFICATE_VERIFY_FAILED. httpx uses certifi's CA bundle by
default — same problem doesn't exist.

After signature + audience verification, we resolve the caller's app role from
the `app_role` JWT claim (set by the `custom_access_token_hook` once registered
in the Supabase dashboard). If the claim is absent we fall back to a DB lookup
on public.users.  The fallback is transitional — remove it once all sessions
have rotated past the hook registration.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.algorithms import ECAlgorithm

from app.config import settings
from app.supabase_client import get_supabase

_bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)

_JWKS_URL = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
_JWKS_CACHE_TTL = 3600  # 1 hour — matches Supabase key rotation cadence

# module-level cache: {kid: public_key}, refreshed on miss or TTL expiry
_jwks_cache: dict[str, object] = {}
_jwks_fetched_at: float = 0.0


@dataclass
class AuthUser:
    id: str
    role: str  # analyst | manager | sales_agent | unknown


def _refresh_jwks() -> None:
    """Fetch the JWKS and rebuild the {kid: public_key} cache."""
    global _jwks_cache, _jwks_fetched_at
    resp = httpx.get(_JWKS_URL, timeout=5.0)
    resp.raise_for_status()
    jwks = resp.json()
    new_cache: dict[str, object] = {}
    for jwk in jwks.get("keys", []):
        kid = jwk.get("kid")
        if not kid:
            continue
        # ECAlgorithm.from_jwk handles ES256 keys; returns a cryptography public-key object.
        new_cache[kid] = ECAlgorithm.from_jwk(jwk)
    _jwks_cache = new_cache
    _jwks_fetched_at = time.time()


def _get_signing_key(kid: str) -> object:
    """Return the public key for the given kid, refreshing JWKS on miss."""
    now = time.time()
    if kid not in _jwks_cache or now - _jwks_fetched_at > _JWKS_CACHE_TTL:
        _refresh_jwks()
    key = _jwks_cache.get(kid)
    if key is None:
        # kid may have rotated between cache refresh and this call — retry once.
        _refresh_jwks()
        key = _jwks_cache.get(kid)
    if key is None:
        raise ValueError(f"No signing key found for kid={kid}")
    return key


def _decode_jwt(token: str) -> dict:
    """Verify signature + audience and decode the Supabase JWT.

    Raises ValueError on any failure (expired, bad signature, wrong audience).
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            raise ValueError("Token header missing 'kid'")
        signing_key = _get_signing_key(kid)
        return jwt.decode(
            token,
            signing_key,
            algorithms=["ES256"],
            audience="authenticated",
            # 30s leeway absorbs small clock drift between Supabase Auth and this host.
            leeway=30,
            options={"require": ["sub", "exp", "aud"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise ValueError(f"Invalid token: {exc}") from exc
    except httpx.HTTPError as exc:
        raise ValueError(f"JWKS fetch failed: {exc}") from exc


def _fetch_role_sync(user_id: str) -> str:
    """Synchronous DB lookup — pushed to thread pool by the async caller."""
    sb = get_supabase()
    res = (
        sb.table("users")
        .select("role")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0].get("role", "unknown")
    return "unknown"


async def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthUser:
    """FastAPI dependency.  Returns AuthUser or raises 401/403."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = await asyncio.to_thread(_decode_jwt, credentials.credentials)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload["sub"]

    # Primary: read app_role from JWT custom claim (set by custom_access_token_hook).
    # Fallback: DB lookup for sessions minted before the hook was registered.
    app_role: str = payload.get("app_role") or ""
    role_source = "jwt_claim"
    if not app_role:
        role_source = "db_fallback"
        app_role = await asyncio.to_thread(_fetch_role_sync, user_id)

    if app_role == "unknown":
        logger.warning(
            "auth fallback returned unknown role: user_id=%s — "
            "check public.users row exists and custom_access_token_hook is registered",
            user_id,
        )
    else:
        logger.info("auth resolved: user_id=%s role=%s source=%s", user_id, app_role, role_source)

    return AuthUser(id=user_id, role=app_role)
