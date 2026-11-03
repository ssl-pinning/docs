# Architecture

Ordinary HTTPS trusts any certificate signed by a trusted CA. And there are hundreds of trusted CAs. Any one of them can, by mistake or under coercion, issue a certificate for someone else's domain — and the client will accept it as genuine.

SSL pinning closes that hole. Instead of "any certificate from any trusted CA," the app checks a specific, known-in-advance public key for the protected domain. Any connection presenting a different key is rejected — this closes every attack vector covered in [Threat model](./threat-model).

The registry itself is signed, so the key list can't be tampered with in transit. And because the ssl-pinning server updates the registry in real time, certificate rotation no longer requires a new app release — that used to be the main operational problem with static pinning.

## Components

The service consists of two parts: a server that monitors certificates and serves a signed registry, and a client that verifies and applies that registry.

```
┌───────────────────┐    GET /api/v1/keys.json      ┌──────────────────────┐
│   Client app      │ ────────────────────────────→ │  ssl-pinning server  │
│                   │ ←──────────────────────────── │                      │
│ RSA signature     │  { payload: { keys: [...] },  │  Worker → TLS :443   │
│ verification      │    signature: "..." }         │  SHA-256(pubkey)     │
│                   │                               │  RSA-signs registry  │
│ OkHttp            │                               └──────────────────────┘
│ CertificatePinner │                                           ↑
└───────────────────┘                                Updated every 5 seconds
```

The server launches a separate monitor for each configured domain. A monitor tracks the domain's TLS certificate and its public key.

At a set interval, the monitor dumps the collected pins to storage, from which the HTTP handler serves them already signed.

## Cryptographic chain

Before signing, the server canonicalizes the JSON payload according to [JCS, RFC 8785](https://datatracker.ietf.org/doc/html/rfc8785) — this guarantees that key ordering, whitespace, and encoding don't affect the signature. A SHA-512 hash of the canonicalized text is computed and signed with RSA PKCS#1 v1.5 using the server's private key, which never leaves the server.

The client performs the same chain in reverse:

1. Capture the raw JSON string of `payload` from the response, **before** deserialization — this preserves the exact byte representation that was signed. Any reformatting (different key order, extra whitespace) would change the bytes and invalidate the signature.
2. Canonicalize that string according to JCS (RFC 8785): sort keys by Unicode code point, strip insignificant whitespace.
3. Compute the SHA-512 hash of the canonicalized string.
4. Base64-decode the `signature` field.
5. Verify the signature against the RSA public key embedded in the client (APK / IPA).
6. If verification passes, deserialize `payload.keys` and apply them to the pinning client. If it fails, abort initialization — no pinned client is created, and no network requests go out through it.

Even if the registry is tampered with at the network level, a valid signature cannot be produced without the private key, so the client detects the tampering before trusting any pin.

## Signed registry format

The server's response has two top-level fields: `payload` (the current pins) and `signature` (the RSA signature the client must verify before using the data).

```json
{
  "payload": {
    "keys": [
      {
        "date": "2026-03-24T23:39:22.964574+01:00",
        "domainName": "www.google.com",
        "expire": 4736419,
        "fqdn": "google.com",
        "key": "b8tZqtqfv0RVKfwivfzaXuFWFHkYP4ufBhb5esciCwo="
      }
    ]
  },
  "signature": "Zl8cwtiAoEjvdmFXReiioVk3zUM2ymbQGa2hIxvixNR3..."
}
```

| Field | Description |
|---|---|
| `domainName` | Hostname pattern the pin is applied to on the client |
| `key` | Base64-encoded SHA-256 hash of the certificate's public key (SPKI) |
| `expire` | Seconds until certificate expiry at the time the pin was captured |
| `date` | Timestamp of the last pin update on the ssl-pinning server |
| `fqdn` | The domain the server connected to over TLS to retrieve the certificate |
| `signature` | RSA PKCS#1 v1.5 + SHA-512 signature over the JCS-canonicalized payload |

Multiple domains can be grouped into a single response file via the server's `keys[].file` config option — useful when several hostnames share one load balancer and one certificate, or when you simply want fewer round trips on the client.

## Storage backends

The server monitors keys in memory and periodically dumps a snapshot to one of four backends:

| Type | Use case |
|---|---|
| `memory` | Development and testing; data doesn't survive restarts |
| `fs` | Writes JSON files to disk and serves them directly |
| `redis` | Multiple server instances sharing a common store |
| `postgres` | Persistent storage with history |

See [Server configuration](../reference/server-configuration) for the full set of options.

Encryption at rest and TLS to the storage backend itself are the operator's responsibility: the server doesn't encrypt anything on top of what's configured in `storage.dsn` (`sslmode` for PostgreSQL, TLS options for Redis) and at the storage or disk level.

## Generating signing keys

Before the first run, generate an RSA-4096 key pair:

```bash
$ git clone git@github.com:ssl-pinning/ssl-pinning.git && cd ssl-pinning
$ task generate-keys
# → build/package/etc/ssl-pinning/tls/prv.pem  (private key, stays on the server)
# → build/package/etc/ssl-pinning/tls/pub.pem  (public key, embedded in the client)
```

The private key signs the registry and must never be shipped to a client. The public key is the only cryptographic artifact embedded in the app — its lifetime is entirely decoupled from TLS certificate rotation, which is exactly what makes the rest of this operationally sustainable under a shrinking certificate lifetime (see [Why dynamic pinning](../index#why-dynamic-pinning)).

Storing, rotating, and destroying `prv.pem` after it's generated is the operator's responsibility, not ssl-pinning's. The server only reads the key from `tls.dir` on startup; how it gets there is up to the operator: a Kubernetes Secret mounted into the pod (see the example in [Self-hosting](./self-hosting#kubernetes-helm)), a bind mount from the host, or integration with an external secrets manager (Vault, AWS/GCP Secrets Manager). Neither `task generate-keys` nor the server itself manages the key's lifecycle past generation.
