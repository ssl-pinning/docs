# iOS/macOS SDK

The Apple SDK is one way to consume the [signed key registry](./architecture#signed-registry-format) — it's optional (see [Implementing your own connector](./custom-connector)), but handles fetching, verification, and `URLSession` wiring for you.

## Requirements

- iOS **15.0+** / macOS **12.0+**
- Swift **6.1+**
- Xcode **16+**

The SDK depends exclusively on system frameworks — `Security.framework`, `CryptoKit`, and `Foundation`. No third-party dependencies.

## Adding the SDK

Published via Swift Package Manager:

```swift
dependencies: [
    .package(url: "https://github.com/ssl-pinning/apple-sdk.git", from: "1.0"),
],
targets: [
    .target(name: "YourTarget", dependencies: ["SslPinning"]),
]
```

Or in Xcode: **File → Add Package Dependencies**, then enter the repository URL.

## Initializing the SDK

The entry point is `SslPinningClient.initialize` — an `async` function, call it once at app startup, before the first network request to any protected API:

```swift
import SslPinning

let config = SslPinningConfig(
    endpointUrl: "https://ssl-pinning.example.com/api/v1/google.com.json",
    signingKeyBase64: "<base64 of pub.pem>"
)

let result = await SslPinningClient.initialize(config: config)

switch result {
case .success(let client):
    let pinnedSession = client.create()
    // pinnedSession is ready to use
case .failure(let error):
    // signature verification failed or network unavailable — do not proceed
}
```

The client exposes two `URLSession` instances: `createPinnedSession()` (backed by a custom `URLSessionDelegate` that verifies the SPKI hash on every TLS handshake) and `createPlainSession()` (a standard session, for third-party services not covered by the registry). Sessions are created once and reused through the app's lifecycle — a natural place to call `initialize` is a SwiftUI `.task` modifier or a `Task {}` inside `application(_:didFinishLaunchingWithOptions:)`.

If verification fails or the registry can't be fetched, `initialize` returns `.failure` and no pinned session is created in any intermediate state — refuse further operation or enter a degraded mode with a user-facing notification.

## What happens inside initialization

```
SslPinningClient.initialize
       │
       ├─ 1. KeysFetcher.fetch(endpointUrl)
       │      GET /api/v1/google.com.json
       │      → { payload: { keys: [...] }, signature: "..." }
       │
       ├─ 2. SignatureVerifier.verify(payloadRawJson, signature, pubKey)
       │      JCS(payloadRawJson) ← RFC 8785, implemented in pure Swift
       │      SecKeyVerifySignature(pubKey, .rsaSignatureMessagePKCS1v15SHA512, canonical, sig)
       │      → requires exact match, otherwise — error
       │
       ├─ 3. PinBinder.bind(keys)
       │      For each entry: domainName → SHA-256 SPKI hash
       │      → domain-to-pin lookup table
       │
       ├─ 4. PinnedSessionFactory.create(pinTable)
       │      URLSessionDelegate implementing
       │      urlSession(_:didReceive:completionHandler:)
       │      → compares SPKI hash from TLS chain against registry pin
       │
       └─ 5. Return (pinnedSession, plainSession)
```

Three implementation details worth knowing:

- **Verification operates on the raw JSON string**, same as the Android SDK: `payloadRawJson` is the exact string representation of the payload before any processing, canonicalized via a pure-Swift JCS implementation (no external dependencies) and passed to the verifier.
- **The public key is accepted in three formats** — PEM, Base64-encoded PEM, or raw Base64 DER (SPKI) — covering the same embedding strategies as Android: pass `pub.pem`'s contents directly, Base64-encode it for an environment variable, or use DER.
- **Pinning operates at the SPKI level.** The `URLSessionDelegate` hashes the Subject Public Key Info of the server's leaf certificate (SHA-256) and compares it against the registry — the same approach `CertificatePinner` uses on Android: the certificate can be reissued, the public key hash stays the same. The system is fail-closed: an unreachable endpoint, invalid response format, failed verification, or empty key list all produce `.failure` — never a partial or intermediate pinned session.

## Demo application

The [apple-sdk repository](https://github.com/ssl-pinning/apple-sdk) includes a SwiftUI demo app.

```bash
# Deploy the ssl-pinning server first (see Self-hosting), then:
$ base64 -i pub.pem | tr -d '\n'
```

Copy `App/Config.xcconfig.example` to `App/Config.xcconfig` and populate it:

```
// App/Config.xcconfig
SSL_PINNING_ENDPOINT = https:$(SLASH)/$(SLASH)ssl-pinning.example.com/api/v1/google.com.json
SSL_PINNING_SIGNING_KEY_B64 = <output from the command above>
```

(The `$(SLASH)` syntax is an xcconfig workaround — `/` acts as a comment delimiter there, so forward slashes in URLs must be escaped through a variable.)

Open `SslPinning.xcworkspace`, select the `App` scheme, and run on a simulator or device. On launch the app calls `SslPinningClient.initialize` and shows one of three states: initializing, initialization failed (with reason), or the main screen with a **Toggle SSL pinning** switch, a **Send Request** button, and a color indicator for the result.

### Seeing it block an attack

Run a MITM proxy (Charles, Proxyman, or mitmproxy), point the device/simulator at it, and install + explicitly trust the proxy's CA certificate (**Settings → General → About → Certificate Trust Settings** — unlike Android, iOS requires this explicit trust step in addition to profile installation, but once done, standard `URLSession` requests flow through the proxy without restriction; see [Threat model](./threat-model#injection-custom-root-ca)).

With **pinning off**, the request succeeds — the plain session trusts the system store, proxy CA included. With **pinning on**, it fails:

```
NSURLErrorDomain Code=-999 "cancelled"
URLSession task cancelled: SPKI hash mismatch
  Received:  <proxy certificate hash>
  Expected:  <expected hash from registry>
```

The delegate compares the SPKI hash the proxy presents against the registry pin; on mismatch it calls `completionHandler(.cancelAuthenticationChallenge)` and tears down the connection before any data is transmitted — the same behavior that closes Custom CA, Rogue CA, Evil Twin, and BGP hijacking attacks.
