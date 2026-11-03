# HTTP API

| Endpoint | Description |
|---|---|
| `GET /api/v1/{file}` | Signed JSON with the current pins for the domain(s) mapped to `{file}` |
| `GET /health/liveness` | Liveness probe |
| `GET /health/readiness` | Readiness probe |
| `GET /health/startup` | Startup probe |
| `GET /metrics` | Prometheus metrics, served on a separate port (fixed `9090`, not configurable) |
| `/ui/` | Web admin UI: pin status and license info. Available on Pro tier and above only |

## `GET /api/v1/{file}`

Returns the [signed registry](./registry-format) for whichever domain(s) are configured to write into `{file}`. Multiple domains can share one file via the `keys[].file` config option (see [Server configuration](./server-configuration)) — in that case, a single request returns pins for all of them.

```bash
$ curl https://ssl-pinning.example.com/api/v1/google.com.json
```

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

A client must verify `signature` before trusting `payload` — see [Architecture → Cryptographic chain](../guide/architecture#cryptographic-chain) for the exact verification steps.

## Health probes

Standard Kubernetes-style probes, each returning `200 OK` when healthy:

- `/health/liveness` — process is running and not deadlocked.
- `/health/readiness` — the server can currently serve registry requests (storage backend reachable).
- `/health/startup` — initial startup sequence (key generation, storage connection) has completed.

## `/metrics`

Prometheus-format metrics, served on a separate port (fixed `9090`, independent of `server.listen`; not configurable) so that scraping doesn't share a listener with application traffic.

## `/ui/`

On Pro tier and above, the server additionally serves a web dashboard at this path — pin status per domain and license info, protected by a separate admin token. It's a read-only informational dashboard; its API is out of scope for this documentation.
