# Model pretnji

Svaki put kada mobilna aplikacija pošalje zahtev ka API-ju, ona to radi u okruženju koje programer ne kontroliše. Korisnik se može nalaziti na javnom Wi-Fi-ju aerodroma, njegov saobraćaj može ići kroz korporativni proksi koji terminira HTTPS, ili kroz rootovan uređaj sa instaliranim trećim sertifikatom. U svakom od ovih scenarija, saobraćaj aplikacije je potencijalno dostupan trećim licima — ovo je standardni model pretnji za svaku klijent-server aplikaciju, a ne ivični slučaj.

Uobičajeno je smatrati da je HTTPS rešen problem zaštite prenosa podataka. Ovo je tačno samo delimično: HTTPS garantuje šifrovanje i autentičnost servera, ali samo u granicama poverenja javne CA infrastrukture — a ta infrastruktura je šira nego što većina programera misli. Podrazumevano skladište korenskih sertifikata na Android uređaju veruje više od 130 CA. Bilo koji od njih može izdati validan sertifikat za vaš domen. Ako je makar jedan kompromitovan — ili je korisnik instalirao neovlašćen korenski sertifikat, namerno ili ne — veza koja izgleda bezbedno, to zapravo nije.

## Vektori napada

### Injekcija (prilagođeni korenski CA)

Najrasprostranjeniji napad na HTTPS saobraćaj mobilnih aplikacija i najjednostavniji za izvođenje: ne zahteva mrežne privilegije niti kompromitaciju infrastrukture — dovoljan je fizički ili udaljeni pristup uređaju.

Napad koristi osnovno svojstvo PKI-ja: OS veruje svakom sertifikatu koji je potpisao CA iz njegovog korenskog skladišta. Napadač generiše sopstveni korenski sertifikat, instalira ga u pouzdano skladište uređaja, i od tog trenutka može izdavati sertifikate za bilo koji domen koje će OS smatrati validnim. Uređaj se povezuje na proksi napadača, koji klijentu predstavlja "validan" sertifikat potpisan instaliranim CA, a pravom serveru se predstavlja kao običan klijent. Ceo saobraćaj kroz kanal — zaglavlja, tokeni, tela zahteva — vidljiv je u otvorenom obliku. Alati poput Charles Proxy, Burp Suite i mitmproxy automatizuju ceo proces (generisanje CA, instalacija, presretanje saobraćaja u realnom vremenu) za nekoliko minuta.

Pre Android 7.0 (API 24) aplikacije su podrazumevano verovale korisničkim CA. Počev od Android 7.0, aplikacije ne veruju korisničkim CA osim ako programer to eksplicitno ne dozvoli u `network_security_config.xml` — za obične korisnike ovo zatvara površinu napada, ali ne i za rootovane uređaje, gde se korisnički sertifikat i dalje može premestiti u sistemsko skladište.

### Kompromitacija sertifikacionog tela (rogue CA)

Za razliku od injekcije, ovde uopšte nije potreban pristup uređaju žrtve. Kompromitacija CA omogućava napadaču da izda kriptografski validan sertifikat za bilo koji domen — takav koji će prihvatiti svaki uređaj koji veruje tom CA.

**Incident sa DigiNotar-om (2011)** ostaje najilustrativniji primer: holandski CA je hakovan, napadači su izdali preko 500 lažnih sertifikata, uključujući wildcard za `*.google.com`, koji je korišćen za presretanje HTTPS saobraćaja ka Google servisima kod otprilike 300.000 korisnika, pretežno u Iranu. Čim je ovo otkriveno, svi veći pregledači i OS su povukli poverenje DigiNotar-u; kompanija je bankrotirala u roku od nekoliko nedelja. ([više](https://en.wikipedia.org/wiki/DigiNotar))

Manje očigledna površina napada je sama procedura Domain Control Validation (DCV), kojom CA potvrđuje da podnosilac zahteva kontroliše domen. Jedan od istorijskih metoda oslanjao se na email adresu iz WHOIS zapisa domena, a ti podaci mogu biti zastareli, kompromitovani ili javno dostupni. U decembru 2024. SSL.com je napustio ovaj metod upravo iz tih razloga. ([više](https://www.securityweek.com/))

### MITM preko lažne pristupne tačke (Evil Twin)

Za Evil Twin napad potreban je samo laptop i Wi-Fi adapter na javnom mestu. Većina uređaja se automatski povezuje na poznate SSID-ove; napadač podigne pristupnu tačku sa imenom legitimne mreže (`Airport_Free_WiFi`, `Starbucks`) i jačim signalom, i uređaji u dometu se automatski ponovo povežu. Od tog trenutka sav saobraćaj ide kroz napadača.

Sam Evil Twin omogućava presretanje samo na mrežnom nivou — za dešifrovanje HTTPS-a potrebno je dodatno povezati rogue CA ili ranjivost u proveri sertifikata u aplikaciji. Godine 2024. australijska Savezna policija je optužila osobu koja je izvodila Evil Twin napade na domaćim letovima i na aerodromima: prikupljao je kredencijale putnika koji su otvarali stranice za prijavu u pregledaču — mobilne aplikacije sa ispravnom proverom sertifikata nisu bile pogođene. ([više](https://www.afp.gov.au/))

Zašto je ovo posebno važno za mobilne aplikacije: korisnik ne vidi kroz koju pristupnu tačku ide saobraćaj, a aplikacije neprekidno rade u pozadini (sinhronizacija, analitika, push obaveštenja). Čak i kratkotrajno povezivanje na lažnu pristupnu tačku može dovesti do curenja tokena za autorizaciju, ako aplikacija proverava *identitet sertifikata*, a ne identitet ključa.

### BGP hijacking + lažni sertifikat

BGP hijacking radi na nivou globalnog rutiranja interneta, ne zahteva fizičku blizinu žrtvi i može odjednom pogoditi sve korisnike servisa. BGP nema ugrađenu kriptografsku proveru najava ruta — napadač sa pristupom BGP ruteru može najaviti kraću putanju do ciljnog opsega IP adresa, i deo globalnog saobraćaja počinje da ide kroz njega.

Samo presretanje je beskorisno protiv šifrovanih veza. Tu u igru ulazi `http-01` validacija ACME-a: CA šalje HTTP zahtev na IP adresu domena i očekuje određen token u odgovoru. Ako je napadač presreo rutu do tog IP-ja, zahtev stiže njemu, on vrati ispravan token i dobije validan sertifikat za domen koji ne poseduje.

**Incident sa Amazon Route 53 (2018)**: napadači su presreli BGP rute ka DNS serverima Route 53 na otprilike dva sata, ciljajući `myetherwallet.com`. Podmetnuli su IP adresu u odgovorima, predstavljajući unapred pribavljen validan SSL sertifikat — korisnici su videli ispravnu adresu i zatvoren katanac. Ukradeno je oko 17 miliona dolara u kriptovaluti. ([više](https://www.internetsociety.org/)) Sa strane klijenta sve izgleda legitimno — DNS se ispravno razrešava, sertifikat je validan, handshake prolazi uspešno. Jedina pouzdana zaštita na strani klijenta je unapred znati tačno koji javni ključ server treba da predstavi, i odbaciti sve ostalo.

### SSL stripping

Ako napadi iznad podmeću ili falsifikuju sertifikate, SSL stripping u potpunosti uklanja šifrovanje, tako da nema šta da se razbije. Javno demonstrirao Moxie Marlinspike na Black Hat 2009. alatom `sslstrip`: korisnik zatraži `example.com` bez šeme, server redirektuje na HTTPS, a MITM presreće taj redirekt — uspostavljajući HTTPS sa pravim serverom samostalno, dok klijentu i dalje servira običan HTTP.

Za razliku od pregledača, mobilne aplikacije nemaju adresnu traku, pa korisnik ne vidi pogrešnu šemu. Pre Android 9 (API 28) cleartext saobraćaj je bio podrazumevano dozvoljen; od tada je podrazumevano blokiran, ali programeri ga često ponovo uključuju u `network_security_config.xml` radi debagovanja ili legacy zavisnosti i zaborave da ga uklone pre izdanja. `WebView` je posebna površina napada: nasleđuje ponašanje pregledačkog engine-a, uključujući praćenje HTTP redirekata, i u potpunosti je ranjiv ako nije eksplicitno podešen da prinudno koristi HTTPS.

HSTS (HTTP Strict Transport Security) delimično ublažava problem — kada klijent jednom vidi HSTS zaglavlje preko bezbedne veze, automatski nadograđuje naredne zahteve — ali samo ako je *prva* veza bila bezbedna (Trust On First Use jaz). Certificate Transparency ovde takođe ne pomaže: u vezi sa uklonjenim SSL-om sertifikata uopšte nema, nema šta da se loguje.

## Zašto statički pinning nije dovoljan

Klasični SSL pinning ušiva SHA-256 heš javnog ključa servera direktno u binarni fajl aplikacije. Ovo zatvara sve vektore napada iznad — klijent više ne veruje hijerarhiji CA, veruje jednom konkretnom ključu. Ali ovo stvara operativni problem: svaka rotacija sertifikata na serveru zahteva novo izdanje aplikacije, pregled u prodavnici i čekanje da se korisnici ažuriraju. Pri hitnoj rotaciji ključa, deo korisničke baze gubi pristup servisu danima.

Obilazna rešenja — pinovanje intermedijarnog CA umesto krajnjeg sertifikata, ili skup od više pinova — ili slabe bezbednosnu garanciju, ili zahtevaju strogu koordinaciju između timova. Mehanizmi opoziva (CRL, OCSP) takođe ne pomažu: keširaju se satima i rade fail-open kada nisu dostupni.

Alternativa — opisana u odeljku [Arhitektura](./architecture) — izneti registar pinova potpuno van binarnog fajla: aplikacija dobija aktuelan spisak pouzdanih ključeva sa namenskog endpointa, server ažurira taj registar u realnom vremenu, a jedino što ostaje ušiveno je javni ključ potreban za proveru potpisa registra.
