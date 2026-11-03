# Implementing your own connector

Using the [Android](./android-sdk) or [iOS/macOS](./ios-macos-sdk) SDK isn't required. The protocol they implement is public and documented here — a client can fetch the registry, verify it, and apply the pins with whatever HTTP and TLS stack it already uses. This is the same specification both official SDKs follow; see [Architecture](./architecture) for the full cryptographic rationale.

## What your connector needs to do

1. **Fetch** the registry over HTTPS: `GET` the configured endpoint, parse the top-level JSON object — `payload` and `signature`. Capture the raw JSON substring of `payload` exactly as received, **before** any deserialization. This byte-for-byte string is what the signature actually covers; re-serializing it (different key order, different whitespace) will invalidate verification.
2. **Canonicalize** that raw string according to [JCS, RFC 8785](https://datatracker.ietf.org/doc/html/rfc8785): sort object keys by Unicode code point, remove insignificant whitespace, apply the standard's number and string serialization rules.
3. **Hash** the canonicalized bytes with SHA-512.
4. **Verify** the `signature` field (Base64-decoded) against that hash using RSA PKCS#1 v1.5, with the public key embedded in your app (the `pub.pem` generated alongside your server's signing key — see [Generating signing keys](./architecture#generating-signing-keys)). Accept the public key in whichever format is convenient for your embedding strategy: PEM, Base64-encoded PEM, or raw DER (SPKI) — both official SDKs support all three for exactly this reason.
5. **Fail closed.** If the signature doesn't verify, if the endpoint is unreachable, or the response isn't well-formed, do not create a pinned client and do not fall back to an unpinned one silently. Abort initialization or enter a degraded, user-visible mode. Neither official SDK ever produces a partially-verified or best-effort pinned client — there is no safe middle ground here.
6. **Apply the pins.** Once verified, deserialize `payload.keys` and configure your HTTP client's certificate/public-key pinning with the SHA-256 SPKI hash from each entry's `key` field, scoped to its `domainName`. See [Signed registry format](./architecture#signed-registry-format) for the exact field meanings.

```
your app
   │
   ├─ GET <endpoint>                         → { payload, signature }
   ├─ canonicalize(raw payload string)  [JCS]
   ├─ sha512(canonical)
   ├─ verify(signature, hash, embedded pubkey)  [RSA PKCS#1 v1.5]
   │    ├─ fail  → abort / degraded mode, no pinned client
   │    └─ pass  → parse payload.keys
   │                for each key: pin sha256(SPKI) to domainName
   │                in your TLS/HTTP stack's pinning mechanism
   └─ done
```

## Why this is safe to do yourself

The registry's signature is the only thing standing between a tampered response and a trusted one — it's a standard RSA signature over a standard canonicalization scheme, not a proprietary protocol. Any platform with an RSA-signature-verification primitive and a conformant JCS implementation can validate it correctly. The two official SDKs exist for convenience (HTTP client wiring, pinning API integration) — not because the protocol itself requires platform-specific trust.

## Where to get the moving pieces

- The registry endpoint and response shape: [Self-hosting](./self-hosting) and [HTTP API](../reference/http-api).
- The exact JSON schema you're canonicalizing and verifying: [Signed registry format](./architecture#signed-registry-format).
- A worked, language-specific reference implementation of every step above: the [Android SDK](./android-sdk) source (Kotlin) and the [Apple SDK](./ios-macos-sdk) source (Swift) are both open — reading either one is a faster way to get the byte-level details right than re-deriving RFC 8785 from scratch.
