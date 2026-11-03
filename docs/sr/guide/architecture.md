# Arhitektura

Običan HTTPS veruje svakom sertifikatu koji je potpisao pouzdan CA. A pouzdanih CA u sistemu ima na stotine. Bilo koji od njih može, greškom ili pod prinudom, da izda sertifikat za tuđi domen — a klijent će ga prihvatiti kao pravi.

SSL pinning zatvara tu rupu. Umesto "bilo kog sertifikata od bilo kog pouzdanog CA", aplikacija proverava konkretan, unapred poznat javni ključ zaštićenog domena. Svaka veza sa drugačijim ključem se odbacuje — ovo zatvara sve vektore napada iz odeljka [Model pretnji](./threat-model).

Sam registar je potpisan, pa se spisak ključeva ne može falsifikovati u prenosu. A pošto ssl-pinning server ažurira registar u realnom vremenu, rotacija sertifikata više ne zahteva novo izdanje aplikacije — upravo to je bio glavni operativni problem statičkog pinninga.

## Komponente

Servis se sastoji iz dva dela: servera koji prati sertifikate i servira potpisan registar, i klijenta koji proverava i primenjuje taj registar.

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

Za svaki konfigurisan domen server pokreće poseban monitor. Monitor prati TLS sertifikat domena i njegov javni ključ.

Na zadatom intervalu monitor snima prikupljene pinove u skladište, odakle ih HTTP handler servira već potpisane.

## Kriptografski lanac

Pre potpisivanja, server kanonizuje JSON payload prema specifikaciji [JCS, RFC 8785](https://datatracker.ietf.org/doc/html/rfc8785) — ovo garantuje da redosled ključeva, razmaci i kodiranje ne utiču na potpis. Izračunava se SHA-512 heš kanonizovanog teksta i potpisuje se algoritmom RSA PKCS#1 v1.5 privatnim ključem servera, koji nikada ne napušta server.

Klijent izvršava isti lanac obrnutim redosledom:

1. Preuzeti sirovi JSON string polja `payload` iz odgovora — pre deserijalizacije. Ovim se čuva tačan bajtovski zapis koji je potpisan: svako preformatiranje (drugačiji redosled ključeva, dodatni razmaci) promeniće bajtove i učiniti potpis nevažećim.
2. Kanonizovati taj string prema JCS-u (RFC 8785): sortirati ključeve po Unicode code point-u, ukloniti nebitne razmake.
3. Izračunati SHA-512 heš kanonizovanog stringa.
4. Dekodirati polje `signature` iz Base64.
5. Proveriti potpis pomoću RSA javnog ključa ugrađenog u klijent (APK / IPA).
6. Ako provera prođe — deserijalizovati `payload.keys` i primeniti ih u pinning klijentu. Ako ne prođe — prekinuti inicijalizaciju: pinovani klijent se ne kreira, i nijedan mrežni zahtev ne izlazi kroz njega.

Čak i ako je registar falsifikovan na mrežnom nivou, bez privatnog ključa nije moguće dobiti validan potpis — klijent otkriva falsifikat pre nego što poveruje bilo kom pinu.

## Format potpisanog registra

Odgovor servera sadrži dva polja na vrhu: `payload` (trenutni pinovi) i `signature` (RSA potpis koji klijent mora da proveri pre korišćenja podataka).

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

| Polje | Opis |
|---|---|
| `domainName` | Šablon hosta na koji se pin primenjuje na klijentu |
| `key` | Base64-kodiran SHA-256 heš javnog ključa sertifikata (SPKI) |
| `expire` | Broj sekundi do isteka sertifikata u trenutku snimanja pina |
| `date` | Vremenska oznaka poslednjeg ažuriranja pina na ssl-pinning serveru |
| `fqdn` | Domen na koji se server povezao preko TLS-a da bi dobio sertifikat |
| `signature` | RSA PKCS#1 v1.5 + SHA-512 potpis preko JCS-kanonizovanog payload-a |

Više domena se može grupisati u jedan fajl odgovora preko opcije konfiguracije `keys[].file` — korisno kada nekoliko hostnejmova deli isti balanser i isti sertifikat, ili kada jednostavno želite manje round trip-ova na klijentu.

## Skladišni backend-i

Server prati ključeve u memoriji i periodično pravi snimak u jedno od četiri skladišta:

| Tip | Scenario upotrebe |
|---|---|
| `memory` | Razvoj i testiranje; podaci ne preživljavaju restart |
| `fs` | Upisuje JSON fajlove na disk i servira ih direktno |
| `redis` | Više instanci servera deli zajedničko skladište |
| `postgres` | Perzistentno skladište sa istorijom |

Kompletan spisak opcija — u odeljku [Konfiguracija servera](../reference/server-configuration).

Šifrovanje podataka na disku i TLS do samog skladišta je odgovornost operatora: server ništa ne šifruje preko onoga što je podešeno u `storage.dsn`-u (`sslmode` za PostgreSQL, TLS opcije za Redis) i na nivou samog skladišta ili diska.

## Generisanje ključeva za potpisivanje

Pre prvog pokretanja generišite par RSA-4096 ključeva:

```bash
$ git clone git@github.com:ssl-pinning/ssl-pinning.git && cd ssl-pinning
$ task generate-keys
# → build/package/etc/ssl-pinning/tls/prv.pem  (privatni ključ, ostaje na serveru)
# → build/package/etc/ssl-pinning/tls/pub.pem  (javni ključ, ugrađuje se u klijent)
```

Privatni ključ potpisuje registar i nikada ne sme biti poslat klijentu. Javni ključ je jedini kriptografski artefakt ugrađen u aplikaciju; njegov životni vek je potpuno odvojen od rotacije TLS sertifikata — upravo to čini sve ostalo operativno održivim pri sve kraćem roku važenja sertifikata (vidi [Zašto je potreban dinamički pinning](../index#zasto-je-potreban-dinamicki-pinning)).

Čuvanje, rotacija i uništavanje `prv.pem` nakon generisanja je odgovornost operatora, ne ssl-pinning-a. Server samo čita ključ iz `tls.dir` pri pokretanju; kako on tamo dospeva odlučuje operator: Kubernetes Secret montiran u pod (vidi primer u [Self-hosting](./self-hosting#kubernetes-helm)), bind mount sa hosta, ili integracija sa eksternim menadžerom tajni (Vault, AWS/GCP Secrets Manager). Ni `task generate-keys`, ni sam server ne upravljaju životnim ciklusom ključa posle generisanja.
