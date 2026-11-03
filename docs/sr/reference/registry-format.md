# Format potpisanog registra

Telo odgovora [`GET /api/v1/{file}`](./http-api#get-api-v1-file) je jedinstven JSON objekat sa dva polja na vrhu.

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

## Polja na vrhu

| Polje | Tip | Opis |
|---|---|---|
| `payload` | objekat | Sadrži `keys` — niz zapisa pinova. Vidi [Proveru potpisa](#provera-potpisa) pre nego što poverujete bilo kojoj vrednosti unutar. |
| `signature` | string, Base64 | RSA PKCS#1 v1.5 potpis, izračunat nad SHA-512 hešom JCS-kanonizovanog `payload`-a, privatnim RSA-4096 ključem servera. |

## Polja zapisa `payload.keys[]`

| Polje | Tip | Opis |
|---|---|---|
| `domainName` | string | Šablon hostnejma na koji se pin primenjuje na klijentu (na primer, host šablon `CertificatePinner`-a na Androidu). Može se razlikovati od `fqdn`-a, ako balanser opslužuje više hostnejmova sa različitim sertifikatima. |
| `key` | string, Base64 | SHA-256 heš Subject Public Key Info-a (SPKI) sertifikata — vrednost na koju se pinuje, sa prefiksom `sha256/` tamo gde klijentski API očekuje takav format. |
| `expire` | ceo broj | Broj sekundi do isteka praćenog sertifikata u trenutku snimanja pina. Nije cache-control vrednost — server neprekidno ažurira pinove nezavisno od ovog broja. |
| `date` | string, ISO 8601 sa pomerajem | Vremenska oznaka poslednjeg ažuriranja upravo ovog pina na serveru. |
| `fqdn` | string | Domen na koji se server povezao preko TLS-a da bi dobio sertifikat iz kog je izveden ovaj pin. |

## Provera potpisa

1. Uzeti sirov JSON tekst `payload`-a tačno u obliku u kom je prisutan u HTTP odgovoru — pre deserijalizacije u bilo koju strukturu nativnu za jezik.
2. Kanonizovati taj tekst prema [JCS (RFC 8785)](https://datatracker.ietf.org/doc/html/rfc8785): ključevi objekta su sortirani po Unicode code point-u, bez nebitnih razmaka, standardna serijalizacija brojeva i stringova.
3. Izračunati SHA-512 kanonizovanih UTF-8 bajtova.
4. Base64-dekodirati `signature`.
5. Proveriti je prema tom hešu algoritmom RSA PKCS#1 v1.5, koristeći javni ključ ugrađen u klijent.
6. Tek pri uspehu raščlaniti `payload.keys` i koristiti njegov sadržaj. Pri neuspehu — odbaciti ceo odgovor u potpunosti: delimično pouzdan registar nije podržano stanje.

Zašto je izabrana baš ova šema (JCS + SHA-512 + RSA PKCS#1 v1.5) — vidi [Arhitekturu](../guide/architecture), a raščlanjivanje od nule, ako ne koristite jedan od zvaničnih SDK-ova — u odeljku [Implementacija sopstvenog konektora](../guide/custom-connector).
