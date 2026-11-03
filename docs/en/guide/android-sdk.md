# Android SDK

The Android SDK is one way to consume the [signed key registry](./architecture#signed-registry-format) — it's optional (see [Implementing your own connector](./custom-connector)), but handles fetching, verification, and `OkHttp` wiring for you.

## Requirements

- Android **minSdk 24** (Android 7.0+)
- OkHttp 4.x
- Kotlin Coroutines

## Adding the SDK

Published on Maven Central. Add it to your module's `build.gradle.kts`:

```kotlin
dependencies {
    implementation("io.github.sslpinninglib:sslpinning:0.1.0")
}
```

The SDK exposes `okhttp` and `kotlinx-coroutines` as `api` dependencies — you don't need to add them separately.

## Initializing the SDK

The entry point is `SslPinningClient.initialize` — a suspend function, call it once at app startup, before the first network request to the protected API:

```kotlin
val config = SslPinningConfig(
    endpointUrl = "https://your-backend.com/api/ssl-pinning.json",
    signingKeyBase64 = "BASE64_ENCODED_RSA_PUBLIC_KEY",
)

val result = SslPinningClient.initialize(
    config = config,
    httpClient = OkHttpClient(),
)

result
    .onSuccess { client ->
        val pinnedClient = client.createPinnedClient() // use for all requests to the protected API
        val plainClient  = client.createPlainClient()  // use only for third-party, non-pinned requests
    }
    .onFailure { error ->
        // verification failed or network unavailable — do not proceed with requests
    }
```

`initialize` returns `Result<SslPinningClient>`. If signature verification fails or the registry can't be fetched, it returns `Failure` — no pinned client is created in any intermediate or partial state. The correct response is to abort further operation or enter a degraded mode with a user-facing notification.

The `httpClient` you pass in is reused as the plain client and as the base for the pinned one.

## What happens inside initialization

```
SslPinningClient.initialize
       │
       ├─ 1. KeysFetcher.fetch(endpointUrl)
       │      GET /api/v1/google.com.json
       │      → { payload: { keys: [...] }, signature: "..." }
       │
       ├─ 2. SignatureVerifier.verifyPayloadSignature(payloadRawJson, signature, pubKey)
       │      JsonCanonicalizer(payloadRawJson).encodedUTF8   ← JCS (RFC 8785)
       │      Signature("SHA512withRSA").verify(canonical, sig, pubKey)
       │      → requires exact match, otherwise throws
       │
       └─ 3. PinnedClientFactory.create(baseClient, keys)
              CertificatePinner.Builder()
                .add(domainName, "sha256/${keyBase64}")
                .build()
              → OkHttpClient with configured pinner
```

Two implementation details worth knowing:

- **Verification operates on the raw JSON string.** `KeysResponse.fromJson` preserves `payloadObj.toString()` — the exact string representation of the payload before any processing. This is what gets canonicalized and passed to the verifier; any reformatting changes the bytes and invalidates the signature.
- **The public key is accepted in three formats** — PEM (`-----BEGIN PUBLIC KEY-----...`), Base64-encoded PEM, or raw Base64 DER — so you can pass the contents of `pub.pem` directly, Base64-encode it for an environment variable, or use DER. `PinnedClientFactory` prepends the `sha256/` prefix if it's missing, since that's the exact format `CertificatePinner` expects.

## Demo application

The [android-sdk repository](https://github.com/ssl-pinning/android-sdk) includes an `app` module — a minimal Compose application for exercising the SDK.

```bash
# Deploy the ssl-pinning server first (see Self-hosting), then:
$ base64 -i pub.pem | tr -d '\n'
```

Populate `local.properties` with the output and your endpoint:

```properties
SSL_PINNING_ENDPOINT=https://ssl-pinning.example.com/api/v1/google.com.json
SSL_PINNING_SIGNING_KEY_B64=<output from the command above>
```

Build and run. On startup the app calls `SslPinningClient.initialize` and shows one of three states: initializing, initialization failed (with reason), or the main screen. The main screen has a **Toggle SSL pinning** switch and a **Send Request** button; the result shows as a color indicator — green for success, red for failure.

### Seeing it block an attack

Run a MITM proxy (Charles, Burp Suite, or mitmproxy), point the device at it via Wi-Fi proxy settings, and install the proxy's CA certificate (requires a rooted device or emulator for the system store — Android 7+ blocks user CAs otherwise, see [Threat model](./threat-model#injection-custom-root-ca)).

With **pinning off**, the request through the proxy succeeds — the plain client trusts the proxy's CA. With **pinning on**, it fails:

```
javax.net.ssl.SSLPeerUnverifiedException:
  Certificate pinning failure!
  Peer certificate chain:
    sha256/<proxy certificate hash>: <your domain>
  Pinned certificates for <your domain>:
    sha256/<expected hash from registry>
```

`CertificatePinner` compares the public key the proxy presents against the pins from the registry; the mismatch terminates the connection before any data is transmitted — exactly the behavior that closes Custom CA, Rogue CA, Evil Twin, and BGP hijacking attacks.
