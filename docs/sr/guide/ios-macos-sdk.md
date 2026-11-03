# iOS/macOS SDK

Apple SDK — jedan od načina da koristite [potpisani registar ključeva](./architecture#format-potpisanog-registra) — opcion je (vidi [Implementacija sopstvenog konektora](./custom-connector)), ali preuzima na sebe preuzimanje registra, proveru potpisa i podešavanje `URLSession`-a.

## Zahtevi

- iOS **15.0+** / macOS **12.0+**
- Swift **6.1+**
- Xcode **16+**

SDK zavisi isključivo od sistemskih frejmvorkova — `Security.framework`, `CryptoKit` i `Foundation`. Nema spoljnih zavisnosti.

## Dodavanje SDK-a

Objavljuje se preko Swift Package Manager-a:

```swift
dependencies: [
    .package(url: "https://github.com/ssl-pinning/apple-sdk.git", from: "1.0"),
],
targets: [
    .target(name: "YourTarget", dependencies: ["SslPinning"]),
]
```

Ili u Xcode-u: **File → Add Package Dependencies**, zatim unesite URL repozitorijuma.

## Inicijalizacija SDK-a

Ulazna tačka je `SslPinningClient.initialize`, `async` funkcija; pozovite je jednom pri pokretanju aplikacije, pre prvog mrežnog zahteva ka bilo kom zaštićenom API-ju:

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
    // pinnedSession je spreman za upotrebu
case .failure(let error):
    // provera potpisa nije prošla ili mreža nije dostupna — ne nastavljajte
}
```

Klijent obezbeđuje dve instance `URLSession`-a: `createPinnedSession()` (zasnovana na prilagođenom `URLSessionDelegate`-u, koji proverava SPKI heš pri svakom TLS handshake-u) i `createPlainSession()` (obična sesija, za treće servise koji nisu pokriveni registrom). Sesije se kreiraju jednom i ponovo koriste tokom životnog ciklusa aplikacije — prirodno mesto za poziv `initialize`-a je SwiftUI modifikator `.task` ili `Task {}` unutar `application(_:didFinishLaunchingWithOptions:)`.

Ako provera ne prođe ili registar nije moguće preuzeti, `initialize` vraća `.failure`, i pinovana sesija se ne kreira ni u kom međustanju — odustanite od daljeg rada ili pređite u degradirani režim uz obaveštenje korisnika.

## Šta se dešava unutar inicijalizacije

```
SslPinningClient.initialize
       │
       ├─ 1. KeysFetcher.fetch(endpointUrl)
       │      GET /api/v1/google.com.json
       │      → { payload: { keys: [...] }, signature: "..." }
       │
       ├─ 2. SignatureVerifier.verify(payloadRawJson, signature, pubKey)
       │      JCS(payloadRawJson) ← RFC 8785, implementirano u čistom Swift-u
       │      SecKeyVerifySignature(pubKey, .rsaSignatureMessagePKCS1v15SHA512, canonical, sig)
       │      → zahteva tačno poklapanje, inače — greška
       │
       ├─ 3. PinBinder.bind(keys)
       │      Za svaki zapis: domainName → SHA-256 SPKI heš
       │      → tabela poklapanja domen-pin
       │
       ├─ 4. PinnedSessionFactory.create(pinTable)
       │      URLSessionDelegate koji implementira
       │      urlSession(_:didReceive:completionHandler:)
       │      → poredi SPKI heš iz TLS lanca sa pinom iz registra
       │
       └─ 5. Vraćanje (pinnedSession, plainSession)
```

Tri detalja implementacije koje vredi znati:

- **Provera radi sa sirovim JSON stringom**, kao i u Android SDK-u: `payloadRawJson` je tačan string zapis payload-a pre bilo kakve obrade, kanonizuje se implementacijom JCS-a u čistom Swift-u (bez spoljnih zavisnosti) i prosleđuje verifikatoru.
- **Javni ključ se prihvata u tri formata** — PEM, Base64-kodiran PEM, ili sirov Base64 DER (SPKI) — iste strategije ugrađivanja kao na Androidu: proslediti sadržaj `pub.pem` direktno, kodirati u Base64 za promenljivu okruženja, ili koristiti DER.
- **Pinning radi na nivou SPKI-ja.** `URLSessionDelegate` heš-uje Subject Public Key Info krajnjeg sertifikata servera (SHA-256) i poredi sa registrom — isti pristup kao `CertificatePinner` na Androidu: sertifikat se može ponovo izdati, heš javnog ključa ostaje isti. Sistem je fail-closed: nedostupan endpoint, nevažeći format odgovora, neuspešna provera ili prazan spisak ključeva — sve vodi ka `.failure`, nikad ka delimičnoj ili međustanju pinovanoj sesiji.

## Demo aplikacija

U [apple-sdk repozitorijumu](https://github.com/ssl-pinning/apple-sdk) postoji demo aplikacija u SwiftUI-ju.

```bash
# Prvo pokrenite ssl-pinning server (vidi Self-hosting), zatim:
$ base64 -i pub.pem | tr -d '\n'
```

Kopirajte `App/Config.xcconfig.example` u `App/Config.xcconfig` i popunite:

```
// App/Config.xcconfig
SSL_PINNING_ENDPOINT = https:$(SLASH)/$(SLASH)ssl-pinning.example.com/api/v1/google.com.json
SSL_PINNING_SIGNING_KEY_B64 = <izlaz komande iznad>
```

(Sintaksa `$(SLASH)` je zaobilaženje ograničenja xcconfig-a: znak `/` je tamo separator komentara, pa kose crte u URL-u treba eskejpovati preko promenljive.)

Otvorite `SslPinning.xcworkspace`, izaberite šemu `App` i pokrenite na simulatoru ili uređaju. Pri pokretanju aplikacija poziva `SslPinningClient.initialize` i prikazuje jedno od tri stanja: inicijalizacija, greška inicijalizacije (sa razlogom) ili glavni ekran sa prekidačem **Toggle SSL pinning**, dugmetom **Send Request** i indikatorom boje za rezultat.

### Kako videti blokiranje napada

Pokrenite MITM proksi (Charles, Proxyman ili mitmproxy), usmerite uređaj/simulator na njega i instalirajte + eksplicitno potvrdite poverenje CA sertifikatu proksija (**Settings → General → About → Certificate Trust Settings** — za razliku od Androida, iOS zahteva ovaj eksplicitni korak poverenja pored instalacije profila, ali nakon toga obični `URLSession` zahtevi prolaze kroz proksi bez ograničenja; vidi [Model pretnji](./threat-model#injekcija-prilagođeni-korenski-ca)).

Kada je pinning **isključen**, zahtev prolazi uspešno — plain sesija veruje sistemskom skladištu, uključujući CA proksija. Kada je pinning **uključen**, zahtev pada:

```
NSURLErrorDomain Code=-999 "cancelled"
URLSession task cancelled: SPKI hash mismatch
  Received:  <proxy certificate hash>
  Expected:  <expected hash from registry>
```

Delegat poredi SPKI heš koji je predstavio proksi sa pinom iz registra; pri neslaganju poziva `completionHandler(.cancelAuthenticationChallenge)` i prekida vezu pre prenosa bilo kakvih podataka — isto ponašanje koje zatvara napade Custom CA, Rogue CA, Evil Twin i BGP hijacking.
