# Implementacija sopstvenog konektora

Korišćenje [Android](./android-sdk) ili [iOS/macOS](./ios-macos-sdk) SDK-a nije obavezno. Protokol koji oni implementiraju je javan i opisan ovde — klijent može preuzeti registar, proveriti ga i primeniti pinove bilo kojim HTTP/TLS stekom koji već koristi. Ovo je ista specifikacija koju prate oba zvanična SDK-a; kompletno kriptografsko obrazloženje je u odeljku [Arhitektura](./architecture).

## Šta vaš konektor mora da radi

1. **Preuzeti** registar preko HTTPS-a: `GET` na konfigurisan endpoint, parsirati JSON objekat na vrhu — `payload` i `signature`. Preuzeti sirovi JSON podstring `payload`-a tačno u obliku u kom je primljen, **pre** bilo kakve deserijalizacije. Upravo taj bajtovski string je pokriven potpisom; njegova ponovna serijalizacija (drugačiji redosled ključeva, drugačiji razmaci) učiniće proveru nevažećom.
2. **Kanonizovati** taj sirovi string prema specifikaciji [JCS, RFC 8785](https://datatracker.ietf.org/doc/html/rfc8785): sortirati ključeve objekta po Unicode code point-u, ukloniti nebitne razmake, primeniti standardna pravila serijalizacije brojeva i stringova.
3. **Heš-ovati** kanonizovane bajtove algoritmom SHA-512.
4. **Proveriti** polje `signature` (nakon Base64 dekodiranja) prema tom hešu algoritmom RSA PKCS#1 v1.5, koristeći javni ključ ugrađen u vašu aplikaciju (`pub.pem`, generisan zajedno sa ključem za potpisivanje na serveru — vidi [Generisanje ključeva za potpisivanje](./architecture#generisanje-kljuceva-za-potpisivanje)). Prihvatite javni ključ u formatu koji vam odgovara za strategiju ugrađivanja: PEM, Base64-kodiran PEM, ili sirov DER (SPKI) — oba zvanična SDK-a podržavaju sva tri formata upravo iz tog razloga.
5. **Fail closed.** Ako se potpis ne proverava uspešno, endpoint nije dostupan, ili je odgovor nepravilno formiran — ne kreirajte pinovani klijent i nemojte tiho preći na nepinovani. Prekinite inicijalizaciju ili pređite u degradiran režim, vidljiv korisniku. Nijedan zvanični SDK nikada ne kreira delimično proveren ili "best-effort" pinovani klijent — ovde nema bezbedne sredine.
6. **Primeniti pinove.** Nakon uspešne provere deserijalizujte `payload.keys` i podesite pinning sertifikata/javnog ključa vašeg HTTP klijenta SHA-256 SPKI hešom iz polja `key` svakog zapisa, vezanim za njegov `domainName`. Tačne vrednosti polja — u odeljku [Format potpisanog registra](./architecture#format-potpisanog-registra).

```
vaša aplikacija
   │
   ├─ GET <endpoint>                         → { payload, signature }
   ├─ canonicalize(raw payload string)  [JCS]
   ├─ sha512(canonical)
   ├─ verify(signature, hash, embedded pubkey)  [RSA PKCS#1 v1.5]
   │    ├─ fail  → prekid / degradiran režim, bez pinovanog klijenta
   │    └─ pass  → raščlani payload.keys
   │                za svaki ključ: pinuj sha256(SPKI) na domainName
   │                u mehanizmu pinninga vašeg TLS/HTTP steka
   └─ gotovo
```

## Zašto je ovo bezbedno raditi samostalno

Potpis registra je jedino što stoji između falsifikovanog i pouzdanog odgovora, i to je standardan RSA potpis nad standardnom šemom kanonizacije, a ne vlasnički protokol. Bilo koja platforma sa primitivom za proveru RSA potpisa i ispravnom implementacijom JCS-a može ga ispravno validirati. Oba zvanična SDK-a postoje radi pogodnosti (podešavanje HTTP klijenta, integracija sa API-jem za pinning) — a ne zato što sam protokol zahteva poverenje specifično za platformu.

## Gde naći ostale detalje

- Endpoint registra i oblik odgovora: [Self-hosting](./self-hosting) i [HTTP API](../reference/http-api).
- Tačna JSON šema koju kanonizujete i proveravate: [Format potpisanog registra](./architecture#format-potpisanog-registra).
- Razrađena, za jezik specifična referentna implementacija svakog koraka iznad: izvorni kod [Android SDK-a](./android-sdk) (Kotlin) i [Apple SDK-a](./ios-macos-sdk) (Swift) su otvoreni — čitanje bilo kog od njih je brže nego iznova izvoditi RFC 8785 od nule, ako su vam potrebni bajtovski detalji.
