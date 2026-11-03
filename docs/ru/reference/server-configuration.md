# Конфигурация сервера

Сервер загружает конфигурацию из нескольких источников, по возрастанию приоритета: значения по умолчанию, файл конфигурации, переменные окружения, затем флаги командной строки.

## Секции

| Секция | Описание |
|---|---|
| `keys` | Конфигурация ключей доменов |
| `log` | Настройки логирования |
| `server` | Параметры HTTP-сервера |
| `storage` | Конфигурация бэкенда хранения |
| `tls` | TLS/криптографические настройки |

### `log.`

| Ключ | Тип | По умолчанию | Описание |
|---|---|---|---|
| `log.format` | `string` | `json` | Формат вывода логов (`json`, `text`) |
| `log.level` | `string` | `info` | Уровень детализации логов (`debug`, `info`, `warn`, `error`) |
| `log.pretty` | `boolean` | `false` | Включить форматированный вывод логов |

### `server.`

| Ключ | Тип | По умолчанию | Описание |
|---|---|---|---|
| `server.listen` | `string` | `127.0.0.1:7500` | Адрес и порт прослушивания HTTP-сервера |
| `server.read_timeout` | `duration` | `5s` | Максимальная длительность чтения всего запроса |
| `server.write_timeout` | `duration` | `5s` | Максимальная длительность до таймаута записи ответа |

### `storage.`

| Ключ | Тип | По умолчанию | Описание |
|---|---|---|---|
| `storage.type` | `string` | `memory` | `memory`, `redis`, `postgres` или `filesystem` |
| `storage.dsn` | `string` | *нет* | Строка подключения — `redis://user:password@localhost:6379/0?maintnotifications=disabled` или `postgres://user:password@localhost:5432/ssl_pinning?sslmode=disable` |
| `storage.dump_dir` | `string` | `/tmp` | Директория для файловых дампов персистентности |
| `storage.conn_max_idle_time` | `duration` | `5m` | Максимальное время простоя соединений с БД |
| `storage.conn_max_lifetime` | `duration` | `30m` | Максимальное время жизни соединений с БД |
| `storage.max_idle_conns` | `integer` | `5` | Максимум простаивающих соединений с БД |
| `storage.max_open_conns` | `integer` | `5` | Максимум открытых соединений с БД |

### `tls.`

| Ключ | Тип | По умолчанию | Описание |
|---|---|---|---|
| `tls.dir` | `string` | `{config-path}/tls` | Директория с `prv.pem` и `pub.pem` |
| `tls.dump_interval` | `duration` | `5s` | Интервал периодической переподписи реестра |
| `tls.timeout` | `duration` | `5s` | Таймаут TLS-операций к отслеживаемым доменам |

## Файл конфигурации

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

## Переменные окружения

`UPPER_SNAKE_CASE`, `.` заменяется на `_`, с префиксом `SSL_PINNING_`:

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

## Флаги командной строки

| Флаг | Ключ конфигурации | Описание |
|---|---|---|
| `--config-file` | *нет* | Имя файла конфигурации |
| `--config-path` | *нет* | Путь к файлу конфигурации |
| `--log-format` | `log.format` | Формат вывода логов |
| `--log-level` | `log.level` | Уровень детализации логов |
| `--log-pretty` | `log.pretty` | Форматированный вывод логов |
| `--storage-type` | `storage.type` | Тип бэкенда хранения |
| `--storage-dsn` | `storage.dsn` | Строка подключения к хранилищу |
| `--storage-dump-dir` | `storage.dump_dir` | Директория для дампов персистентности |
| `--storage-dump-interval` | `storage.dump_interval` | Интервал дампа |
| `--storage-conn-max-idle-time` | `storage.conn_max_idle_time` | Макс. время простоя соединений с БД |
| `--storage-conn-max-lifetime` | `storage.conn_max_lifetime` | Макс. время жизни соединений с БД |
| `--storage-max-idle-conns` | `storage.max_idle_conns` | Макс. простаивающих соединений с БД |
| `--storage-max-open-conns` | `storage.max_open_conns` | Макс. открытых соединений с БД |

```bash
ssl-pinning up \
  --log-level=debug \
  --storage-type=postgres \
  --storage-dump-interval=30s
```
