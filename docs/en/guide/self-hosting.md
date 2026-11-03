# Self-hosting

The server has no required external dependencies for a minimal setup — only the signing keys from [Generating signing keys](./architecture#generating-signing-keys) and, optionally, Redis or PostgreSQL for shared or persistent storage (paid tiers only). Three paths are documented: Docker Compose for a single instance, Kubernetes via the official Helm chart for anything beyond that, and binary releases for running without containers at all.

The free tier is for development only, not production. The license forcibly and unconditionally limits it: a single domain with no wildcards, in-memory storage with no persistence, one TLS check at a time, and a fixed pin-refresh interval and TLS timeout (24 hours and 2 minutes) — any value you configure gets overwritten. The server also listens only on `127.0.0.1` inside its own network namespace — it isn't reachable from outside loopback, even on the same host, without an extra sidecar.

If `SSL_PINNING_SERVER_KEY` is set but fails verification — corrupted, expired, or tampered with — the server refuses to start and exits with an error, rather than silently falling back to the free tier.

## Docker Compose

A minimal stack is the service itself plus a `caddy` sidecar that shares its network namespace and exposes the API to the host (without it, the port is unreachable outside the loopback bind — see above). Redis or PostgreSQL for shared/persistent storage only connect on paid tiers — neither is needed for this test setup.

```yaml
services:
  ssl-pinning:
    container_name: ssl-pinning
    image: ghcr.io/ssl-pinning/ssl-pinning:v1.1.1
    environment:
      SSL_PINNING_KEYS: >-
        [
          { "fqdn": "google.com", "domainName": "www.google.com" },
          { "fqdn": "mail.google.com", "file": "google.com.json", "domainName": "mail.google.com" }
        ]

    entrypoint:
      - sh
      - -ec
      - |
        [ -f /etc/ssl-pinning/tls/prv.pem ] || (
          apk add --no-cache openssl
          mkdir -p /etc/ssl-pinning/tls
          openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out /etc/ssl-pinning/tls/prv.pem
          openssl rsa -pubout -in /etc/ssl-pinning/tls/prv.pem -out /etc/ssl-pinning/tls/pub.pem
        )
        /usr/local/sbin/ssl-pinning up
    ports:
      - 7500:7500
      - 8000:8000
    volumes:
      - ./tls:/etc/ssl-pinning/tls

  caddy:
    image: caddy:2.11.7-alpine
    container_name: ssl-pinning-caddy
    network_mode: "service:ssl-pinning"
    entrypoint:
      - caddy
      - reverse-proxy
      - --from
      - :8000
      - --to
      - 127.0.0.1:7500
    depends_on:
      - ssl-pinning
```

All configuration is passed as environment variables with the `SSL_PINNING_` prefix — a `config.yaml` is not required (see [Server configuration](../reference/server-configuration) for the full list and the file-based alternative). RSA keys are generated automatically on first startup if `prv.pem` isn't present in the mounted directory, as shown in the entrypoint above.

Bring it up and extract the generated public key to embed in your client:

```bash
$ docker compose up -d
$ cat ./tls/prv.pem
$ cat ./tls/pub.pem
$ curl http://localhost:8000/api/v1/google.com.json
```

## Binary releases

Prebuilt binaries for Linux and macOS (amd64/arm64) are on the [releases page](https://github.com/ssl-pinning/ssl-pinning/releases) — the filename matches the platform (e.g. `ssl-pinning-darwin-arm64`). Runs without Docker or Kubernetes:

```bash
$ chmod +x ./ssl-pinning-darwin-arm64
$ ./ssl-pinning-darwin-arm64 up
```

License behavior and limits are the same as in the container — the tier is determined by the `SSL_PINNING_SERVER_KEY` key, not by how the binary is launched.

## Kubernetes (Helm)

The deployment uses the official Helm chart:

```bash
$ helm repo add ssl-pinning https://ssl-pinning.github.io/charts
$ helm repo update
$ helm show values ssl-pinning/ssl-pinning   # inspect defaults
```

By default the chart issues a TLS certificate for the ingress via [cert-manager](https://cert-manager.io/) (`ClusterIssuer: letsencrypt`) — it must already be installed in the cluster, or override `apps-ingresses.ssl-pinning.tls` with your own `secretName`/issuer.

Only a subset of values needs overriding — the private key, config, replica count, and ingress. Create a `values.yaml`:

```yaml
global:
  _includes:
    apps-default:
      enabled: true

apps-secrets:
  ssl-pinning-tls:
    _include: [apps-default]
    data:
      prv.pem: $(base64 -i prv.pem) # your private key

apps-configmaps:
  ssl-pinning-config:
    _include: [apps-default]

apps-stateless:
  ssl-pinning:
    _include: [apps-default]
    replicas:
      _default: 1
      production: 2

apps-ingresses:
  ssl-pinning:
    _include: [apps-default]
    host: ssl-pinning.example.com
    paths: |
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ssl-pinning
            port:
              number: 7500
```

`host`/`paths` aren't part of the `apps-default` preset — without them the ingress renders with an empty rule (verified via `helm template`). Set the host and paths explicitly, as above.

Then install:

```bash
$ helm install ssl-pinning ssl-pinning/ssl-pinning \
    --namespace ssl-pinning \
    --create-namespace \
    -f values.yaml --set global.env=production
```

Full chart documentation and the complete values reference: [ssl-pinning.github.io/charts](https://ssl-pinning.github.io/charts).

## Operational endpoints

Whichever deployment path you use, the server exposes the same operational surface — see [HTTP API](../reference/http-api) for the full list, including health probes for Kubernetes readiness/liveness checks and a Prometheus `/metrics` endpoint on a separate port.
