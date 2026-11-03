# HTTP API

| Endpoint | Opis |
|---|---|
| `GET /api/v1/{file}` | Potpisan JSON sa trenutnim pinovima za domene vezane za `{file}` |
| `GET /health/liveness` | Liveness proba |
| `GET /health/readiness` | Readiness proba |
| `GET /health/startup` | Startup proba |
| `GET /metrics` | Prometheus metrike, serviraju se na posebnom portu (fiksiran `9090`, nije konfigurabilan) |
| `/ui/` | Veb panel: status pinova i informacije o licenci. Dostupan samo na tier-u Pro i višim |

## `GET /api/v1/{file}`

Vraća [potpisani registar](./registry-format) za domene konfigurisane da pišu u `{file}`. Više domena može deliti jedan fajl preko opcije konfiguracije `keys[].file` (vidi [Konfiguraciju servera](./server-configuration)) — u tom slučaju jedan zahtev vraća pinove za sve njih.

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

Klijent mora da proveri `signature` pre nego što poveruje `payload`-u — tačni koraci provere su u odeljku [Arhitektura → Kriptografski lanac](../guide/architecture#kriptografski-lanac).

## Health probe-ovi

Standardne Kubernetes-style probe, svaka vraća `200 OK` u zdravom stanju:

- `/health/liveness` — proces radi i nije zaglavljen u deadlock-u.
- `/health/readiness` — server trenutno može da opslužuje zahteve ka registru (skladišni backend je dostupan).
- `/health/startup` — sekvenca početnog pokretanja (generisanje ključeva, povezivanje sa skladištem) je završena.

## `/metrics`

Metrike u Prometheus formatu, serviraju se na posebnom portu (fiksiran `9090`, nezavisno od `server.listen`-a; nije konfigurabilan preko konfiguracije), kako skrejpovanje ne bi delilo listener sa aplikativnim saobraćajem.

## `/ui/`

Na tier-u Pro i višim server dodatno servira informacioni panel na ovoj putanji — status pinova po domenima i informacije o licenci, zaštićen posebnim admin tokenom. Radi se o panelu samo za čitanje; detaljan opis njegovog API-ja je van obima ove dokumentacije.
