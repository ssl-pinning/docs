# iOS/macOS SDK

Apple SDK — один из способов использовать [подписанный реестр ключей](./architecture#формат-подписанного-реестра) — он опционален (см. [Реализация собственного коннектора](./custom-connector)), но берёт на себя получение реестра, проверку подписи и настройку `URLSession`.

## Требования

- iOS **15.0+** / macOS **12.0+**
- Swift **6.1+**
- Xcode **16+**

SDK зависит исключительно от системных фреймворков — `Security.framework`, `CryptoKit` и `Foundation`. Сторонних зависимостей нет.

## Добавление SDK

Публикуется через Swift Package Manager:

```swift
dependencies: [
    .package(url: "https://github.com/ssl-pinning/apple-sdk.git", from: "1.0"),
],
targets: [
    .target(name: "YourTarget", dependencies: ["SslPinning"]),
]
```

Или в Xcode: **File → Add Package Dependencies**, затем укажите URL репозитория.

## Инициализация SDK

Точка входа — `SslPinningClient.initialize`, `async`-функция; вызывайте её один раз при старте приложения, до первого сетевого запроса к любому защищённому API:

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
    // pinnedSession готов к использованию
case .failure(let error):
    // проверка подписи не прошла или сеть недоступна — не продолжайте
}
```

Клиент предоставляет два экземпляра `URLSession`: `createPinnedSession()` (на основе кастомного `URLSessionDelegate`, который проверяет SPKI-хэш на каждом TLS-хендшейке) и `createPlainSession()` (обычная сессия, для сторонних сервисов, не покрытых реестром). Сессии создаются один раз и переиспользуются на протяжении жизненного цикла приложения — естественное место для вызова `initialize` — модификатор SwiftUI `.task` или `Task {}` внутри `application(_:didFinishLaunchingWithOptions:)`.

Если проверка не прошла или реестр не удалось получить, `initialize` возвращает `.failure`, и запиненная сессия не создаётся ни в каком промежуточном состоянии — откажитесь от дальнейшей работы или перейдите в деградированный режим с уведомлением пользователя.

## Что происходит внутри инициализации

```
SslPinningClient.initialize
       │
       ├─ 1. KeysFetcher.fetch(endpointUrl)
       │      GET /api/v1/google.com.json
       │      → { payload: { keys: [...] }, signature: "..." }
       │
       ├─ 2. SignatureVerifier.verify(payloadRawJson, signature, pubKey)
       │      JCS(payloadRawJson) ← RFC 8785, реализовано на чистом Swift
       │      SecKeyVerifySignature(pubKey, .rsaSignatureMessagePKCS1v15SHA512, canonical, sig)
       │      → требуется точное совпадение, иначе — ошибка
       │
       ├─ 3. PinBinder.bind(keys)
       │      Для каждой записи: domainName → SHA-256 SPKI хэш
       │      → таблица соответствия домен-пин
       │
       ├─ 4. PinnedSessionFactory.create(pinTable)
       │      URLSessionDelegate, реализующий
       │      urlSession(_:didReceive:completionHandler:)
       │      → сравнивает SPKI-хэш из TLS-цепочки с пином реестра
       │
       └─ 5. Возврат (pinnedSession, plainSession)
```

Три детали реализации, которые стоит знать:

- **Проверка работает с сырой JSON-строкой**, как и в Android SDK: `payloadRawJson` — точное строковое представление payload до какой-либо обработки, канонизируется реализацией JCS на чистом Swift (без внешних зависимостей) и передаётся в верификатор.
- **Публичный ключ принимается в трёх форматах** — PEM, Base64-кодированный PEM, или сырой Base64 DER (SPKI) — те же стратегии встраивания, что и на Android: передать содержимое `pub.pem` напрямую, закодировать в Base64 для переменной окружения, или использовать DER.
- **Пиннинг работает на уровне SPKI.** `URLSessionDelegate` хэширует Subject Public Key Info листового сертификата сервера (SHA-256) и сравнивает с реестром — тот же подход, что у `CertificatePinner` на Android: сертификат можно перевыпустить, хэш публичного ключа останется прежним. Система fail-closed: недоступный эндпоинт, невалидный формат ответа, неудачная проверка или пустой список ключей — всё приводит к `.failure`, никогда к частичной или промежуточной запиненной сессии.

## Демо-приложение

В [репозитории apple-sdk](https://github.com/ssl-pinning/apple-sdk) есть демо-приложение на SwiftUI.

```bash
# Сначала разверните сервер ssl-pinning (см. Self-hosting), затем:
$ base64 -i pub.pem | tr -d '\n'
```

Скопируйте `App/Config.xcconfig.example` в `App/Config.xcconfig` и заполните:

```
// App/Config.xcconfig
SSL_PINNING_ENDPOINT = https:$(SLASH)/$(SLASH)ssl-pinning.example.com/api/v1/google.com.json
SSL_PINNING_SIGNING_KEY_B64 = <вывод команды выше>
```

(Синтаксис `$(SLASH)` — это обход ограничения xcconfig: символ `/` там является разделителем комментария, поэтому прямые слэши в URL нужно экранировать через переменную.)

Откройте `SslPinning.xcworkspace`, выберите схему `App` и запустите на симуляторе или устройстве. При запуске приложение вызывает `SslPinningClient.initialize` и показывает одно из трёх состояний: инициализация, ошибка инициализации (с причиной) или главный экран с переключателем **Toggle SSL pinning**, кнопкой **Send Request** и цветовым индикатором результата.

### Как увидеть блокировку атаки

Запустите MITM-прокси (Charles, Proxyman или mitmproxy), направьте на него устройство/симулятор и установите + явно подтвердите доверие CA-сертификату прокси (**Settings → General → About → Certificate Trust Settings** — в отличие от Android, iOS требует этот явный шаг доверия в дополнение к установке профиля, но после этого обычные запросы `URLSession` проходят через прокси без ограничений; см. [Модель угроз](./threat-model#инъекция-кастомныи-корневои-ca)).

При **выключенном пиннинге** запрос проходит успешно — plain-сессия доверяет системному хранилищу, включая CA прокси. При **включённом пиннинге** запрос падает:

```
NSURLErrorDomain Code=-999 "cancelled"
URLSession task cancelled: SPKI hash mismatch
  Received:  <proxy certificate hash>
  Expected:  <expected hash from registry>
```

Делегат сравнивает SPKI-хэш, предъявленный прокси, с пином реестра; при несовпадении вызывает `completionHandler(.cancelAuthenticationChallenge)` и обрывает соединение до передачи каких-либо данных — то же поведение, которое закрывает атаки Custom CA, Rogue CA, Evil Twin и BGP hijacking.
