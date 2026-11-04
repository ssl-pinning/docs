---
layout: home
---

<Hero>

<div class="hero-banner">

# Dynamic SSL Pinning

</div>

<div class="hero-body">

## What this is

- **[ssl-pinning](https://github.com/ssl-pinning/ssl-pinning)** — the pinning server. Monitors certificates for configured domains in real time, signs a snapshot of their public keys (RSA-4096 + SHA-512, JCS-canonicalized JSON), and serves it over HTTP(S).
- **Android SDK** / **iOS/macOS SDK** — optional client libraries that fetch the signed registry, verify its signature against an embedded public key, and enforce the pins (OkHttp `CertificatePinner` on Android, a custom `URLSessionDelegate` on Apple platforms). Using them isn't required — a client can implement its own connector that canonicalizes the registry (JCS, RFC 8785) and verifies the signature directly. Either way, it's fail-closed: if verification fails, no pinned client is created.

## Why dynamic pinning

Classic ("static") SSL pinning hardcodes the server's certificate — or its public key hash — directly into the app binary. That closes most man-in-the-middle attack vectors, but ties certificate rotation to an app release: every time the server's certificate changes, the app needs a new build, a store review, and users have to update, or the pinned connection breaks.

This is about to get far more disruptive. The CA/Browser Forum's [Ballot SC-081v3](https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/) — adopted in April 2025, unanimously by Apple, Google, Mozilla, and Microsoft — cuts the maximum validity of publicly trusted TLS certificates from 398 days down to 47 days, in three phases:

| From | Max. certificate validity |
|---|---|
| March 15, 2026 | 200 days |
| March 15, 2027 | 100 days |
| March 15, 2029 | 47 days |

By 2029, every publicly trusted certificate will need to be reissued at least every 47 days — roughly 8 times a year instead of once. Static pinning, which already strains under occasional rotations, becomes operationally unworkable at that cadence: shipping an app update every 47 days just to keep pinned connections alive isn't realistic.

</div>

</Hero>
