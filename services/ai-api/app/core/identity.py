from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import Any

import jwt
from jwt import PyJWKClient, PyJWKClientError


class IdentityProviderUnavailable(RuntimeError):
    pass


class InvalidIdentityToken(ValueError):
    pass


class ClerkTokenVerifier:
    def __init__(
        self,
        *,
        jwks_url: str | None,
        issuer: str | None,
        authorized_parties: frozenset[str],
    ) -> None:
        self._issuer = issuer
        self._authorized_parties = authorized_parties
        self._jwks_client = (
            PyJWKClient(jwks_url, cache_keys=True)
            if jwks_url and issuer and authorized_parties
            else None
        )

    async def verify(self, token: str) -> Mapping[str, Any]:
        if self._jwks_client is None or self._issuer is None:
            raise IdentityProviderUnavailable(
                "Clerk JWKS URL, issuer, and authorized parties must be configured"
            )
        try:
            return await asyncio.to_thread(self._decode, token)
        except PyJWKClientError as exc:
            raise IdentityProviderUnavailable("Clerk signing keys are unavailable") from exc
        except jwt.PyJWTError as exc:
            raise InvalidIdentityToken("The Clerk session token is invalid") from exc

    def _decode(self, token: str) -> Mapping[str, Any]:
        if self._jwks_client is None or self._issuer is None:
            raise IdentityProviderUnavailable(
                "Clerk JWKS URL, issuer, and authorized parties must be configured"
            )
        signing_key = self._jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            issuer=self._issuer,
            options={"require": ["exp", "iss", "sub"]},
        )
        subject = claims.get("sub")
        authorized_party = claims.get("azp")
        if not isinstance(subject, str) or not subject.strip() or len(subject) > 255:
            raise InvalidIdentityToken("The Clerk token has an invalid subject")
        if (
            not isinstance(authorized_party, str)
            or authorized_party not in self._authorized_parties
        ):
            raise InvalidIdentityToken("The Clerk token was issued to an unauthorized party")
        return claims
