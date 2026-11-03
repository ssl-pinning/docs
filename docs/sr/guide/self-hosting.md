# Self-hosting

Za minimalnu instalaciju server ne zahteva obavezne spoljne zavisnosti — samo ključeve za potpisivanje iz odeljka [Generisanje ključeva za potpisivanje](./architecture#generisanje-kljuceva-za-potpisivanje) i, opciono, Redis ili PostgreSQL za deljeno ili perzistentno skladište (dostupno samo na plaćenim tier-ovima). Dokumentovana su tri puta: Docker Compose za jednu instancu, Kubernetes preko zvaničnog Helm chart-a za sve ostalo, i binarna izdanja — za pokretanje potpuno bez kontejnera.

Besplatni tier je namenjen samo za razvoj, ne za produkciju. Licenca ga prinudno i bezuslovno ograničava: jedan domen bez wildcard-a, skladište samo u memoriji bez perzistencije, jedna TLS provera istovremeno, a interval ažuriranja pinova i TLS timeout su fiksni (24 sata i 2 minuta) — sopstvenu vrednost preko konfiguracije nije moguće postaviti, server će je prepisati. Server takođe sluša samo na `127.0.0.1` unutar sopstvenog network namespace-a — spolja, čak i na istom hostu, bez dodatnog sidecar-a nije moguće doći do njega.

Ako je `SSL_PINNING_SERVER_KEY` podešen, ali ne prođe proveru — oštećen, istekao ili falsifikovan — server se ne pokreće i izlazi sa greškom, umesto da tiho pređe na besplatni tier.

## Docker Compose

Minimalni stek je sam servis plus `caddy` sidecar koji deli network namespace sa njim i otvara pristup API-ju sa hosta (bez njega port nije dostupan van loopback bind-a, vidi gore). Redis ili PostgreSQL za deljeno/perzistentno skladište se povezuju samo na plaćenim tier-ovima — za ovaj test nisu potrebni.

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

Cela konfiguracija se prenosi preko promenljivih okruženja sa prefiksom `SSL_PINNING_` — `config.yaml` nije obavezan (kompletan spisak i alternativu preko fajla vidi u [Konfiguraciji servera](../reference/server-configuration)). RSA ključevi se generišu automatski pri prvom pokretanju, ako `prv.pem` ne postoji u montiranom direktorijumu — kao što je prikazano u entrypoint-u iznad.

Podignite stek i izvucite generisani javni ključ za ugradnju u klijent:

```bash
$ docker compose up -d
$ cat ./tls/prv.pem
$ cat ./tls/pub.pem
$ curl http://localhost:8000/api/v1/google.com.json
```

## Binarna izdanja

Gotovi binarni fajlovi za Linux i macOS (amd64/arm64) — na stranici [izdanja](https://github.com/ssl-pinning/ssl-pinning/releases), ime fajla odgovara platformi (na primer, `ssl-pinning-darwin-arm64`). Pokreće se bez Docker-a i Kubernetes-a:

```bash
$ chmod +x ./ssl-pinning-darwin-arm64
$ ./ssl-pinning-darwin-arm64 up
```

Ponašanje i ograničenja licence su ista kao u kontejneru — tier se određuje ključem `SSL_PINNING_SERVER_KEY`, a ne načinom pokretanja.

## Kubernetes (Helm)

Deploy koristi zvanični Helm chart:

```bash
$ helm repo add ssl-pinning https://ssl-pinning.github.io/charts
$ helm repo update
$ helm show values ssl-pinning/ssl-pinning   # pregled podrazumevanih vrednosti
```

Chart podrazumevano izdaje TLS sertifikat za ingress preko [cert-manager](https://cert-manager.io/)-a (`ClusterIssuer: letsencrypt`) — on mora već biti instaliran u klasteru, ili preopišite `apps-ingresses.ssl-pinning.tls` sopstvenim `secretName`/issuer-om.

Potrebno je preopisati samo deo vrednosti — privatni ključ, konfiguraciju, broj replika i ingress. Napravite `values.yaml`:

```yaml
global:
  _includes:
    apps-default:
      enabled: true

apps-secrets:
  ssl-pinning-tls:
    _include: [apps-default]
    data:
      prv.pem: $(base64 -i prv.pem) # vaš privatni ključ

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

`host`/`paths` nisu deo `apps-default` preseta — bez njih ingress se renderuje sa praznim pravilom (provereno preko `helm template`). Host i putanje treba podesiti eksplicitno, kao iznad.

Zatim instalirajte:

```bash
$ helm install ssl-pinning ssl-pinning/ssl-pinning \
    --namespace ssl-pinning \
    --create-namespace \
    -f values.yaml --set global.env=production
```

Kompletna dokumentacija chart-a i referenca vrednosti: [ssl-pinning.github.io/charts](https://ssl-pinning.github.io/charts).

## Operativni endpointi

Bez obzira na izabrani način deploy-a, server servira isti operativni skup endpointa — kompletan spisak u [HTTP API](../reference/http-api), uključujući health probe-ove za Kubernetes readiness/liveness provere i Prometheus `/metrics` endpoint na posebnom portu.
