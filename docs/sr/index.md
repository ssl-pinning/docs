---
layout: home
---

<Hero>

<div class="hero-banner">

# Dinamički SSL Pinning

</div>

<div class="hero-body">

## Šta je ovo

- **[ssl-pinning](https://github.com/ssl-pinning/ssl-pinning)** — server za pinning. Prati sertifikate konfigurisanih domena u realnom vremenu, potpisuje snimak njihovih javnih ključeva (RSA-4096 + SHA-512, JSON kanonizovan po JCS-u) i servira ga preko HTTP(S).
- **Android SDK** / **iOS/macOS SDK** — opcioni klijentski biblioteke: preuzimaju potpisani registar, proveravaju potpis pomoću ugrađenog javnog ključa i primenjuju pinove (OkHttp `CertificatePinner` na Androidu, prilagođeni `URLSessionDelegate` na Apple platformama). Nije obavezno koristiti ih — klijent može implementirati sopstveni konektor koji kanonizuje registar (JCS, RFC 8785) i direktno proverava potpis. U oba slučaja — fail-closed: ako provera ne prođe, pinovani klijent se uopšte ne kreira.

## Zašto je potreban dinamički pinning

Klasični ("statički") SSL pinning ušiva heš sertifikata servera — ili njegovog javnog ključa — direktno u binarni fajl aplikacije. Ovo zatvara većinu MITM vektora napada, ali vezuje rotaciju sertifikata za izdanje aplikacije: pri svakoj promeni sertifikata na serveru aplikaciji je potrebna nova verzija, pregled u prodavnici aplikacija, a korisnici moraju da ažuriraju aplikaciju — inače pinovana veza jednostavno prestaje da radi.

Uskoro će ovo postati mnogo bolnije. [Ballot SC-081v3](https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/) CA/Browser Foruma — usvojen u aprilu 2025. jednoglasno od strane Apple-a, Google-a, Mozille i Microsoft-a — skraćuje maksimalni rok važenja javno pouzdanih TLS sertifikata sa 398 na 47 dana, u tri faze:

| Od datuma | Maks. rok važenja sertifikata |
|---|---|
| 15. mart 2026. | 200 dana |
| 15. mart 2027. | 100 dana |
| 15. mart 2029. | 47 dana |

Do 2029. godine svaki javno pouzdan sertifikat će morati da se ponovo izda najmanje jednom u 47 dana — otprilike 8 puta godišnje umesto jednom. Statički pinning, koji se i sada teško nosi sa retkim rotacijama, pri takvoj učestalosti postaje operativno neodrživ: izdavanje nove verzije aplikacije na svakih 47 dana samo da bi pinovana veza ostala živa — nije realno.

</div>

</Hero>
