# Server configuration

The server loads configuration from multiple sources, in increasing priority: default values, a configuration file, environment variables, then command-line flags.

## Sections

| Section | Description |
|---|---|
| `keys` | Domain key configurations |
| `log` | Logging settings |
| `server` | HTTP server parameters |
| `storage` | Storage backend configuration |
| `tls` | TLS/cryptographic settings |

### `log.`

| Key | Type | Default | Description |
|---|---|---|---|
| `log.format` | `string` | `json` | Log output format (`json`, `text`) |
| `log.level` | `string` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |
| `log.pretty` | `boolean` | `false` | Enable pretty-printed log output |

### `server.`

| Key | Type | Default | Description |
|---|---|---|---|
| `server.listen` | `string` | `127.0.0.1:7500` | HTTP server listen address and port |
| `server.read_timeout` | `duration` | `5s` | Maximum duration for reading the entire request |
| `server.write_timeout` | `duration` | `5s` | Maximum duration before timing out writes of the response |

### `storage.`

| Key | Type | Default | Description |
|---|---|---|---|
| `storage.type` | `string` | `memory` | `memory`, `redis`, `postgres`, or `filesystem` |
| `storage.dsn` | `string` | *none* | Connection string — `redis://user:password@localhost:6379/0?maintnotifications=disabled` or `postgres://user:password@localhost:5432/ssl_pinning?sslmode=disable` |
| `storage.dump_dir` | `string` | `/tmp` | Directory for file-based persistence dumps |
| `storage.conn_max_idle_time` | `duration` | `5m` | Maximum idle time for database connections |
| `storage.conn_max_lifetime` | `duration` | `30m` | Maximum lifetime for database connections |
| `storage.max_idle_conns` | `integer` | `5` | Maximum idle database connections |
| `storage.max_open_conns` | `integer` | `5` | Maximum open database connections |

### `tls.`

| Key | Type | Default | Description |
|---|---|---|---|
| `tls.dir` | `string` | `{config-path}/tls` | Directory containing `prv.pem` and `pub.pem` |
| `tls.dump_interval` | `duration` | `5s` | Interval for periodic registry re-signs |
| `tls.timeout` | `duration` | `5s` | Timeout for TLS operations against monitored domains |

## Configuration file

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

## Environment variables

`UPPER_SNAKE_CASE`, `.` replaced with `_`, prefixed with `SSL_PINNING_`:

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

## Command-line flags

| Flag | Configuration key | Description |
|---|---|---|
| `--config-file` | *none* | Configuration file name |
| `--config-path` | *none* | Configuration file path |
| `--log-format` | `log.format` | Log output format |
| `--log-level` | `log.level` | Log verbosity level |
| `--log-pretty` | `log.pretty` | Pretty-print logs |
| `--storage-type` | `storage.type` | Storage backend type |
| `--storage-dsn` | `storage.dsn` | Storage DSN connection string |
| `--storage-dump-dir` | `storage.dump_dir` | Directory for persistence dumps |
| `--storage-dump-interval` | `storage.dump_interval` | Dump interval duration |
| `--storage-conn-max-idle-time` | `storage.conn_max_idle_time` | Max idle time for DB connections |
| `--storage-conn-max-lifetime` | `storage.conn_max_lifetime` | Max lifetime for DB connections |
| `--storage-max-idle-conns` | `storage.max_idle_conns` | Max idle DB connections |
| `--storage-max-open-conns` | `storage.max_open_conns` | Max open DB connections |

```bash
ssl-pinning up \
  --log-level=debug \
  --storage-type=postgres \
  --storage-dump-interval=30s
```
