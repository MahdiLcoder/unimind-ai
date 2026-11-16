from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.identity import ClerkTokenVerifier, InvalidIdentityToken

ISSUER = "https://unimind.clerk.accounts.dev"
AUTHORIZED_PARTY = "http://localhost:3000"


def signed_token(
    private_key: rsa.RSAPrivateKey,
    *,
    issuer: str = ISSUER,
    authorized_party: str = AUTHORIZED_PARTY,
) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": "user_clerk_123",
            "iss": issuer,
            "azp": authorized_party,
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )


@pytest.fixture
def clerk_verifier(monkeypatch: pytest.MonkeyPatch) -> tuple[ClerkTokenVerifier, rsa.RSAPrivateKey]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    class TestJWKClient:
        def __init__(self, _url: str, *, cache_keys: bool) -> None:
            assert cache_keys is True

        def get_signing_key_from_jwt(self, _token: str) -> SimpleNamespace:
            return SimpleNamespace(key=private_key.public_key())

    monkeypatch.setattr("app.core.identity.PyJWKClient", TestJWKClient)
    verifier = ClerkTokenVerifier(
        jwks_url="https://unimind.clerk.accounts.dev/.well-known/jwks.json",
        issuer=ISSUER,
        authorized_parties=frozenset({AUTHORIZED_PARTY}),
    )
    return verifier, private_key


@pytest.mark.asyncio
async def test_clerk_verifier_accepts_a_valid_signed_session(
    clerk_verifier: tuple[ClerkTokenVerifier, rsa.RSAPrivateKey],
) -> None:
    verifier, private_key = clerk_verifier

    claims = await verifier.verify(signed_token(private_key))

    assert claims["sub"] == "user_clerk_123"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("issuer", "authorized_party"),
    [
        ("https://attacker.example", AUTHORIZED_PARTY),
        (ISSUER, "https://attacker.example"),
    ],
)
async def test_clerk_verifier_rejects_wrong_issuer_or_authorized_party(
    clerk_verifier: tuple[ClerkTokenVerifier, rsa.RSAPrivateKey],
    issuer: str,
    authorized_party: str,
) -> None:
    verifier, private_key = clerk_verifier

    with pytest.raises(InvalidIdentityToken):
        await verifier.verify(
            signed_token(private_key, issuer=issuer, authorized_party=authorized_party)
        )


@pytest.mark.asyncio
async def test_clerk_verifier_fails_closed_when_not_configured() -> None:
    verifier = ClerkTokenVerifier(
        jwks_url=None,
        issuer=None,
        authorized_parties=frozenset(),
    )

    from app.core.identity import IdentityProviderUnavailable

    with pytest.raises(IdentityProviderUnavailable):
        await verifier.verify("token")
