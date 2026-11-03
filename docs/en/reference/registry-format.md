# Signed registry format

The response body of [`GET /api/v1/{file}`](./http-api#get-api-v1-file) is a single JSON object with two top-level fields.

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
      },
      {
        "date": "2026-03-24T23:39:22.963066+01:00",
        "domainName": "mail.google.com",
        "expire": 4736550,
        "fqdn": "mail.google.com",
        "key": "1o0e39oKjV5hGki9WnKOeg2Hs1qQSRjMgWpbL3ajP4U="
      }
    ]
  },
  "signature": "Zl8cwtiAoEjvdmFXReiioVk3zUM2ymbQGa2hIxvixNR3..."
}
```

## Top-level fields

| Field | Type | Description |
|---|---|---|
| `payload` | object | Contains `keys`, the array of pin entries. See [Verifying the signature](#verifying-the-signature) before trusting any value inside it. |
| `signature` | string, Base64 | RSA PKCS#1 v1.5 signature, computed over the SHA-512 hash of the JCS-canonicalized `payload`, using the server's RSA-4096 private key. |

## `payload.keys[]` entry fields

| Field | Type | Description |
|---|---|---|
| `domainName` | string | Hostname pattern the pin applies to on the client (e.g. the `CertificatePinner` host pattern on Android). May differ from `fqdn` when a load balancer serves multiple hostnames with different certificates. |
| `key` | string, Base64 | SHA-256 hash of the certificate's Subject Public Key Info (SPKI) — the value you pin against, prefixed with `sha256/` where the client API expects that format. |
| `expire` | integer | Seconds remaining until the monitored certificate expires, measured at the time this pin was captured. Not a cache-control value — the server refreshes pins continuously regardless of this number. |
| `date` | string, ISO 8601 with offset | Timestamp of the last update to this specific pin on the server. |
| `fqdn` | string | The domain the server connected to over TLS to retrieve the certificate this pin was derived from. |

## Verifying the signature

1. Take the raw JSON text of `payload` exactly as it appears in the HTTP response — before deserializing it into any language-native structure.
2. Canonicalize that text per [JCS (RFC 8785)](https://datatracker.ietf.org/doc/html/rfc8785): object keys sorted by Unicode code point, no insignificant whitespace, standard number/string serialization.
3. Compute SHA-512 of the canonicalized UTF-8 bytes.
4. Base64-decode `signature`.
5. Verify it against that hash with RSA PKCS#1 v1.5, using the public key embedded in the client.
6. Only on success, parse `payload.keys` and use its contents. On failure, discard the entire response — a partially-trusted registry is not a supported state.

See [Architecture](../guide/architecture) for why this specific scheme (JCS + SHA-512 + RSA PKCS#1 v1.5) was chosen, and [Implementing your own connector](../guide/custom-connector) for a from-scratch walkthrough if you're not using one of the official SDKs.
