# Android SDK

Android SDK — jedan od načina da koristite [potpisani registar ključeva](./architecture#format-potpisanog-registra) — opcion je (vidi [Implementacija sopstvenog konektora](./custom-connector)), ali preuzima na sebe preuzimanje registra, proveru potpisa i podešavanje `OkHttp`-a.

## Zahtevi

- Android **minSdk 24** (Android 7.0+)
- OkHttp 4.x
- Kotlin Coroutines

## Dodavanje SDK-a

Objavljen je na Maven Central. Dodajte u `build.gradle.kts` vašeg modula:

```kotlin
dependencies {
    implementation("io.github.sslpinninglib:sslpinning:0.1.0")
}
```

SDK eksportuje `okhttp` i `kotlinx-coroutines` kao `api` zavisnosti — nije potrebno dodavati ih posebno.

## Inicijalizacija SDK-a

Ulazna tačka je `SslPinningClient.initialize`, suspend funkcija; pozovite je jednom pri pokretanju aplikacije, pre prvog mrežnog zahteva ka zaštićenom API-ju:

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
        val pinnedClient = client.createPinnedClient() // za sve zahteve ka zaštićenom API-ju
        val plainClient  = client.createPlainClient()  // samo za treće, nepinovane zahteve
    }
    .onFailure { error ->
        // provera nije prošla ili mreža nije dostupna — ne nastavljajte sa zahtevima
    }
```

`initialize` vraća `Result<SslPinningClient>`. Ako provera potpisa nije prošla ili registar nije moguće preuzeti — vraća se `Failure`, pinovani klijent se ne kreira ni u kom međustanju ili delimičnom stanju. Ispravna reakcija aplikacije je da prekine rad ili pređe u degradirani režim uz obaveštenje korisnika.

Prosleđeni `httpClient` se ponovo koristi i kao plain klijent i kao osnova za pinovani.

## Šta se dešava unutar inicijalizacije

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
       │      → zahteva tačno poklapanje, inače izuzetak
       │
       └─ 3. PinnedClientFactory.create(baseClient, keys)
              CertificatePinner.Builder()
                .add(domainName, "sha256/${keyBase64}")
                .build()
              → OkHttpClient sa podešenim pinner-om
```

Dva detalja implementacije koje vredi znati:

- **Provera radi sa sirovim JSON stringom.** `KeysResponse.fromJson` čuva `payloadObj.toString()` — tačan string zapis payload-a pre bilo kakve obrade. Upravo on se kanonizuje i prosleđuje verifikatoru; svako preformatiranje menja bajtove i čini potpis nevažećim.
- **Javni ključ se prihvata u tri formata** — PEM (`-----BEGIN PUBLIC KEY-----...`), Base64-kodiran PEM, ili sirov Base64 DER — tako da možete proslediti sadržaj `pub.pem` direktno, kodirati ga u Base64 za promenljivu okruženja, ili koristiti DER. `PinnedClientFactory` dodaje prefiks `sha256/`, ako nedostaje, jer upravo u tom formatu ga očekuje `CertificatePinner`.

## Demo aplikacija

U [android-sdk repozitorijumu](https://github.com/ssl-pinning/android-sdk) postoji modul `app` — minimalna Compose aplikacija za proveru SDK-a.

```bash
# Prvo pokrenite ssl-pinning server (vidi Self-hosting), zatim:
$ base64 -i pub.pem | tr -d '\n'
```

Popunite `local.properties` dobijenom vrednošću i vašim endpointom:

```properties
SSL_PINNING_ENDPOINT=https://ssl-pinning.example.com/api/v1/google.com.json
SSL_PINNING_SIGNING_KEY_B64=<izlaz komande iznad>
```

Izgradite i pokrenite. Pri pokretanju aplikacija poziva `SslPinningClient.initialize` i prikazuje jedno od tri stanja: inicijalizacija, greška inicijalizacije (sa razlogom) ili glavni ekran. Na glavnom ekranu nalazi se prekidač **Toggle SSL pinning** i dugme **Send Request**; rezultat se prikazuje indikatorom boje — zeleno za uspeh, crveno za grešku.

### Kako videti blokiranje napada

Pokrenite MITM proksi (Charles, Burp Suite ili mitmproxy), usmerite uređaj na njega preko podešavanja Wi-Fi proksija i instalirajte CA sertifikat proksija (potreban je rootovan uređaj ili emulator za sistemsko skladište — Android 7+ inače blokira korisničke CA, vidi [Model pretnji](./threat-model#injekcija-prilagođeni-korenski-ca)).

Kada je pinning **isključen**, zahtev kroz proksi prolazi uspešno — plain klijent veruje CA proksija. Kada je pinning **uključen**, zahtev pada:

```
javax.net.ssl.SSLPeerUnverifiedException:
  Certificate pinning failure!
  Peer certificate chain:
    sha256/<proxy certificate hash>: <your domain>
  Pinned certificates for <your domain>:
    sha256/<expected hash from registry>
```

`CertificatePinner` poredi javni ključ koji je predstavio proksi sa pinovima iz registra; neslaganje prekida vezu pre prenosa bilo kakvih podataka — upravo to ponašanje zatvara napade Custom CA, Rogue CA, Evil Twin i BGP hijacking.
