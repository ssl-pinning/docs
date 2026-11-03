# Threat model

Every time a mobile app sends a request to an API, it does so in an environment the developer does not control. The user might be on an airport's public Wi-Fi, routing traffic through a corporate proxy that terminates HTTPS, or running a rooted device with a third-party certificate installed. In each of these scenarios, the app's traffic is potentially exposed to third parties — this is the standard threat model for any client-server application, not an edge case.

HTTPS is widely considered a solved problem for secure data transmission. That's only partially true: HTTPS guarantees encryption and server authenticity, but only within the trust boundaries of the public CA infrastructure — and that infrastructure is broader than most developers realize. The default root store on an Android device trusts over 130 CAs. Any one of them can issue a valid certificate for your domain. If even one is compromised — or a user has installed a rogue root certificate, intentionally or not — a connection that appears secure is anything but.

## Attack vectors

### Injection (custom root CA)

The most common attack against HTTPS traffic in mobile applications, and the easiest to execute: it requires no network-level privileges and no infrastructure compromise, just physical or remote access to the device.

The attack exploits a basic property of PKI: the OS trusts any certificate signed by a CA in its root store. An attacker generates their own root certificate, installs it into the device's trusted store, and from that point can issue certificates for any domain that the OS treats as valid. The device connects to the attacker's proxy, which presents a "valid" certificate signed by the installed CA to the client while impersonating a regular client to the real server. All traffic through the channel — headers, tokens, bodies — is visible in plaintext. Tools like Charles Proxy, Burp Suite, and mitmproxy automate the whole process (CA generation, installation, live interception) in minutes.

Prior to Android 7.0 (API 24), apps trusted user-installed CAs by default. Since Android 7.0, apps no longer trust user CAs unless the developer explicitly allows it in `network_security_config.xml` — closing the attack surface for ordinary users, but not for rooted devices, where a user certificate can still be moved to the system store.

### Certificate Authority compromise (rogue CA)

Unlike injection, this requires no access to the victim's device at all. Compromising a CA lets an attacker issue a cryptographically valid certificate for any domain — one that every device trusting that CA will accept.

The **DigiNotar incident (2011)** remains the clearest example: the Dutch CA was breached, and attackers issued over 500 fraudulent certificates, including a wildcard for `*.google.com`, used to intercept HTTPS traffic to Google services for an estimated 300,000 users, predominantly in Iran. Every major browser and OS revoked trust in DigiNotar once discovered; the company went bankrupt within weeks. ([more detail](https://en.wikipedia.org/wiki/DigiNotar))

A less obvious surface is Domain Control Validation (DCV) itself — the process a CA uses to confirm a requester controls a domain. One historical method relied on an email address listed in a domain's WHOIS record, which can be outdated, compromised, or publicly accessible. In December 2024, SSL.com discontinued this method on exactly those grounds. ([more detail](https://www.securityweek.com/))

### MITM via rogue access point (Evil Twin)

An Evil Twin attack needs only a laptop and a Wi-Fi adapter in a public place. Most devices auto-connect to known SSIDs; an attacker broadcasts an access point with the same name as a legitimate network (`Airport_Free_WiFi`, `Starbucks`) at a stronger signal, and devices in range reconnect automatically. From there, all traffic flows through the attacker.

Evil Twin alone only achieves network-layer interception — decrypting HTTPS still requires combining it with a rogue CA or a flaw in the app's certificate validation. In 2024, Australian Federal Police charged a man who ran Evil Twin attacks on domestic flights and at airports, harvesting credentials from passengers who opened login pages in a browser — mobile apps with proper certificate validation were unaffected. ([more detail](https://www.afp.gov.au/))

Why this matters for mobile apps specifically: users have no visibility into which access point their traffic is routing through, and apps run in the background continuously (sync, analytics, push). Even a brief connection to a rogue AP can leak an authorization token if the app validates certificate *identity* rather than key identity.

### BGP hijacking + fraudulent certificate

BGP hijacking operates at the level of global internet routing, needs no physical proximity to the victim, and can affect every user of a service simultaneously. BGP has no built-in cryptographic verification of route announcements — an attacker with access to a BGP router can announce a shorter path to a target IP range, and a portion of global traffic starts routing through them.

Interception alone is useless against encrypted connections. This is where ACME's `http-01` domain validation comes in: the CA sends an HTTP request to the domain's IP and expects a specific token back. If the attacker has hijacked the route to that IP, the request reaches them, they return the correct token, and receive a valid certificate for a domain they don't own.

The **Amazon Route 53 incident (2018)**: attackers hijacked BGP routes to Amazon's Route 53 DNS servers for about two hours, targeting `myetherwallet.com`. They served a spoofed IP with a valid SSL certificate obtained in advance — users saw the correct address and a closed padlock. About $17 million in cryptocurrency was stolen. ([more detail](https://www.internetsociety.org/)) From the client's perspective everything looks legitimate — DNS resolves correctly, the certificate is valid, the handshake succeeds. The only reliable client-side defense is knowing in advance which specific public key the server should present, and rejecting anything else.

### SSL stripping

Where the attacks above substitute or forge certificates, SSL stripping removes encryption entirely so there's nothing to break. Publicly demonstrated by Moxie Marlinspike at Black Hat 2009 with the tool `sslstrip`: a user requests `example.com` without a scheme, the server redirects to HTTPS, and a MITM intercepts that redirect — establishing HTTPS to the real server itself while continuing to serve the client over plain HTTP.

Unlike browsers, mobile apps have no address bar, so a user can't see the scheme is wrong. Cleartext traffic was permitted by default prior to Android 9 (API 28); since then it's blocked by default, but developers frequently re-enable it in `network_security_config.xml` for debugging or legacy dependencies and forget to remove it before release. `WebView` is a separate surface: it inherits browser-engine behavior including following HTTP redirects, and is vulnerable in full if not explicitly configured to enforce HTTPS.

HSTS (HTTP Strict Transport Security) partially mitigates this — once a client has seen an HSTS header over a secure connection, it upgrades subsequent requests automatically — but only if the *first* connection was secure (the Trust On First Use gap). Certificate Transparency doesn't help here either: there's no certificate at all in an SSL-stripped connection, so there's nothing to log.

## Why static pinning isn't enough

Classic SSL pinning hardcodes the SHA-256 hash of the server's public key directly into the app binary. That closes every attack vector above — the client no longer trusts the CA hierarchy, it trusts one specific key. But it introduces an operational problem: any certificate rotation on the server requires a new app release, a store review, and waiting for users to update. During an emergency key rotation, part of the user base loses access to the service for days.

Workarounds — pinning an intermediate CA instead of the leaf certificate, or bundling multiple pins — either weaken the security guarantee or require tight coordination across teams. Revocation mechanisms (CRL, OCSP) don't help either: they're cached for hours and fail open when unavailable.

The alternative — covered in [Architecture](./architecture) — is to move the pin registry outside the binary entirely: the app fetches the current list of trusted keys from a dedicated endpoint, the server updates that registry in real time, and the only thing that stays hardcoded is the public key needed to verify the registry's signature.
