# Self-hosting

Для минимальной установки сервер не требует обязательных внешних зависимостей — только ключи подписи из раздела [Генерация ключей подписи](./architecture#генерация-ключеи-подписи) и, опционально, Redis или PostgreSQL для общего или персистентного хранилища (доступны только на платных тирах). Задокументировано три пути: Docker Compose для одного инстанса, Kubernetes через официальный Helm-чарт для всего остального, и бинарные релизы — для запуска вообще без контейнеров.

Бесплатный тир подходит только для разработки, не для продакшена. Лицензия принудительно и безусловно ограничивает его: один домен без wildcard, хранилище только в памяти без персистентности, одна TLS-проверка одновременно, а интервал обновления пинов и TLS-таймаут зафиксированы (24 часа и 2 минуты) — задать своё значение через конфиг не получится, сервер его перезапишет. Сервер также слушает только на `127.0.0.1` внутри своего network namespace — наружу, даже на том же хосте, без дополнительного сайдкара достучаться нельзя.

Если `SSL_PINNING_SERVER_KEY` задан, но не проходит проверку — повреждён, просрочен или подделан — сервер не запускается и завершается с ошибкой, а не тихо откатывается на бесплатный тир.

## Docker Compose

Минимальный стек — сам сервис и сайдкар `caddy`, который делит с ним network namespace и открывает доступ к API с хоста (без него порт не достучаться снаружи loopback-бэйнда, см. выше). Redis или PostgreSQL для общего/персистентного хранилища подключаются только на платных тирах — для теста они не нужны.

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

Вся конфигурация передаётся через переменные окружения с префиксом `SSL_PINNING_` — `config.yaml` не обязателен (полный список и файловую альтернативу см. в [Конфигурации сервера](../reference/server-configuration)). RSA-ключи генерируются автоматически при первом запуске, если `prv.pem` отсутствует в смонтированной директории — как показано в entrypoint выше.

Поднимите стек и извлеките сгенерированный публичный ключ для встраивания в клиент:

```bash
$ docker compose up -d
$ cat ./tls/prv.pem
$ cat ./tls/pub.pem
$ curl http://localhost:8000/api/v1/google.com.json
```

## Бинарные релизы

Собранные бинарники для Linux и macOS (amd64/arm64) — на странице [релизов](https://github.com/ssl-pinning/ssl-pinning/releases), имя файла соответствует платформе (например, `ssl-pinning-darwin-arm64`). Запускается без Docker и Kubernetes:

```bash
$ chmod +x ./ssl-pinning-darwin-arm64
$ ./ssl-pinning-darwin-arm64 up
```

Поведение и ограничения лицензии те же, что и в контейнере — тир определяется ключом `SSL_PINNING_SERVER_KEY`, а не способом запуска.

## Kubernetes (Helm)

Деплой использует официальный Helm-чарт:

```bash
$ helm repo add ssl-pinning https://ssl-pinning.github.io/charts
$ helm repo update
$ helm show values ssl-pinning/ssl-pinning   # посмотреть значения по умолчанию
```

Чарт по умолчанию выпускает TLS-сертификат для ingress через [cert-manager](https://cert-manager.io/) (`ClusterIssuer: letsencrypt`) — он должен быть уже установлен в кластере, либо переопределите `apps-ingresses.ssl-pinning.tls` своим `secretName`/issuer'ом.

Переопределить нужно только часть значений — приватный ключ, конфиг, число реплик и ingress. Создайте `values.yaml`:

```yaml
global:
  _includes:
    apps-default:
      enabled: true

apps-secrets:
  ssl-pinning-tls:
    _include: [apps-default]
    data:
      prv.pem: $(base64 -i prv.pem) # ваш приватный ключ

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

`host`/`paths` не входят в пресет `apps-default` — без них ingress рендерится с пустым правилом (проверено через `helm template`). Хост и пути нужно задать явно, как выше.

Затем установите:

```bash
$ helm install ssl-pinning ssl-pinning/ssl-pinning \
    --namespace ssl-pinning \
    --create-namespace \
    -f values.yaml --set global.env=production
```

Полная документация чарта и справочник значений: [ssl-pinning.github.io/charts](https://ssl-pinning.github.io/charts).

## Операционные эндпоинты

Независимо от выбранного способа деплоя, сервер отдаёт один и тот же операционный набор эндпоинтов — полный список в [HTTP API](../reference/http-api), включая health-пробы для readiness/liveness-проверок Kubernetes и эндпоинт Prometheus `/metrics` на отдельном порту.
