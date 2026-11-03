# Konfiguracija servera

Server učitava konfiguraciju iz nekoliko izvora, po rastućem prioritetu: podrazumevane vrednosti, konfiguracioni fajl, promenljive okruženja, zatim parametri komandne linije.

## Sekcije

| Sekcija | Opis |
|---|---|
| `keys` | Konfiguracija ključeva domena |
| `log` | Podešavanja logovanja |
| `server` | Parametri HTTP servera |
| `storage` | Konfiguracija skladišnog backend-a |
| `tls` | TLS/kriptografska podešavanja |

### `log.`

| Ključ | Tip | Podrazumevano | Opis |
|---|---|---|---|
| `log.format` | `string` | `json` | Format izlaza logova (`json`, `text`) |
| `log.level` | `string` | `info` | Nivo detaljnosti logova (`debug`, `info`, `warn`, `error`) |
| `log.pretty` | `boolean` | `false` | Uključiti formatiran izlaz logova |

### `server.`

| Ključ | Tip | Podrazumevano | Opis |
|---|---|---|---|
| `server.listen` | `string` | `127.0.0.1:7500` | Adresa i port na kom HTTP server sluša |
| `server.read_timeout` | `duration` | `5s` | Maksimalno trajanje čitanja celog zahteva |
| `server.write_timeout` | `duration` | `5s` | Maksimalno trajanje do timeout-a pri upisu odgovora |

### `storage.`

| Ključ | Tip | Podrazumevano | Opis |
|---|---|---|---|
| `storage.type` | `string` | `memory` | `memory`, `redis`, `postgres` ili `filesystem` |
| `storage.dsn` | `string` | *nema* | Connection string — `redis://user:password@localhost:6379/0?maintnotifications=disabled` ili `postgres://user:password@localhost:5432/ssl_pinning?sslmode=disable` |
| `storage.dump_dir` | `string` | `/tmp` | Direktorijum za fajlovske dump-ove perzistencije |
| `storage.conn_max_idle_time` | `duration` | `5m` | Maksimalno vreme neaktivnosti konekcija ka bazi |
| `storage.conn_max_lifetime` | `duration` | `30m` | Maksimalan životni vek konekcija ka bazi |
| `storage.max_idle_conns` | `integer` | `5` | Maksimum neaktivnih konekcija ka bazi |
| `storage.max_open_conns` | `integer` | `5` | Maksimum otvorenih konekcija ka bazi |

### `tls.`

| Ključ | Tip | Podrazumevano | Opis |
|---|---|---|---|
| `tls.dir` | `string` | `{config-path}/tls` | Direktorijum sa `prv.pem` i `pub.pem` |
| `tls.dump_interval` | `duration` | `5s` | Interval periodičnog ponovnog potpisivanja registra |
| `tls.timeout` | `duration` | `5s` | Timeout TLS operacija ka praćenim domenima |

## Konfiguracioni fajl

```yaml
keys:
  - fqdn: example.com

  - fqdn: foo.example.com
    domainName: foo.example.com
    file: example.com.json

  - fqdn: bar.example.com
    file: example.com.json

log:
  format: json
  level: info
  pretty: false

server:
  listen: 0.0.0.0:7500
  read_timeout: 5s
  write_timeout: 5s

storage:
  type: postgres
  dsn: postgres://user:password@localhost:5432/ssl_pinning?sslmode=disable
  conn_max_idle_time: 5m
  conn_max_lifetime: 30m
  max_idle_conns: 5
  max_open_conns: 5

tls:
  dir: /etc/app/tls
  dump_interval: 30s
  timeout: 10s
```

## Promenljive okruženja

`UPPER_SNAKE_CASE`, `.` se zamenjuje sa `_`, sa prefiksom `SSL_PINNING_`:

```bash
export SSL_PINNING_LOG_LEVEL=debug
export SSL_PINNING_SERVER_LISTEN=0.0.0.0:7500
export SSL_PINNING_SERVER_READ_TIMEOUT=5s
export SSL_PINNING_SERVER_WRITE_TIMEOUT=5s
export SSL_PINNING_STORAGE_TYPE=postgres
export SSL_PINNING_STORAGE_DSN="postgres://user:pass@localhost:5432/db?sslmode=disable"
export SSL_PINNING_STORAGE_DUMP_DIR=/opt/ssl-pinning/storage-dump
export SSL_PINNING_STORAGE_CONN_MAX_IDLE_TIME=5m
export SSL_PINNING_STORAGE_CONN_MAX_LIFETIME=30m
export SSL_PINNING_STORAGE_MAX_IDLE_CONNS=5
export SSL_PINNING_STORAGE_MAX_OPEN_CONNS=5
export SSL_PINNING_TLS_DIR=/opt/ssl-pinning/tls
export SSL_PINNING_TLS_DUMP_INTERVAL=1s
export SSL_PINNING_TLS_TIMEOUT=3s
```

## Parametri komandne linije

| Parametar | Ključ konfiguracije | Opis |
|---|---|---|
| `--config-file` | *nema* | Ime konfiguracionog fajla |
| `--config-path` | *nema* | Putanja do konfiguracionog fajla |
| `--log-format` | `log.format` | Format izlaza logova |
| `--log-level` | `log.level` | Nivo detaljnosti logova |
| `--log-pretty` | `log.pretty` | Formatiran izlaz logova |
| `--storage-type` | `storage.type` | Tip skladišnog backend-a |
| `--storage-dsn` | `storage.dsn` | Connection string skladišta |
| `--storage-dump-dir` | `storage.dump_dir` | Direktorijum za dump-ove perzistencije |
| `--storage-dump-interval` | `storage.dump_interval` | Interval dump-a |
| `--storage-conn-max-idle-time` | `storage.conn_max_idle_time` | Maks. vreme neaktivnosti konekcija ka bazi |
| `--storage-conn-max-lifetime` | `storage.conn_max_lifetime` | Maks. životni vek konekcija ka bazi |
| `--storage-max-idle-conns` | `storage.max_idle_conns` | Maks. neaktivnih konekcija ka bazi |
| `--storage-max-open-conns` | `storage.max_open_conns` | Maks. otvorenih konekcija ka bazi |

```bash
ssl-pinning up \
  --log-level=debug \
  --storage-type=postgres \
  --storage-dump-interval=30s
```
