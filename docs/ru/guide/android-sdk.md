# Android SDK

Android SDK — один из способов использовать [подписанный реестр ключей](./architecture#формат-подписанного-реестра) — он опционален (см. [Реализация собственного коннектора](./custom-connector)), но берёт на себя получение реестра, проверку подписи и настройку `OkHttp`.

## Требования

- Android **minSdk 24** (Android 7.0+)
- OkHttp 4.x
- Kotlin Coroutines

## Добавление SDK

Опубликован на Maven Central. Добавьте в `build.gradle.kts` вашего модуля:

```kotlin
dependencies {
    implementation("io.github.sslpinninglib:sslpinning:0.1.0")
}
```

SDK экспортирует `okhttp` и `kotlinx-coroutines` как `api`-зависимости — добавлять их отдельно не нужно.

## Инициализация SDK

Точка входа — `SslPinningClient.initialize`, suspend-функция; вызывайте её один раз при старте приложения, до первого сетевого запроса к защищённому API:

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
        val pinnedClient = client.createPinnedClient() // для всех запросов к защищённому API
        val plainClient  = client.createPlainClient()  // только для сторонних, непиненных запросов
    }
    .onFailure { error ->
        // проверка не прошла или сеть недоступна — не продолжайте запросы
    }
```

`initialize` возвращает `Result<SslPinningClient>`. Если проверка подписи не прошла или реестр не удалось получить — возвращается `Failure`, запиненный клиент не создаётся ни в каком промежуточном или частичном состоянии. Правильная реакция приложения — прервать работу или перейти в деградированный режим с уведомлением пользователя.

Переданный `httpClient` переиспользуется как plain-клиент и как база для запиненного.

## Что происходит внутри инициализации

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
       │      → требуется точное совпадение, иначе исключение
       │
       └─ 3. PinnedClientFactory.create(baseClient, keys)
              CertificatePinner.Builder()
                .add(domainName, "sha256/${keyBase64}")
                .build()
              → OkHttpClient с настроенным pinner'ом
```

Две детали реализации, которые стоит знать:

- **Проверка работает с сырой JSON-строкой.** `KeysResponse.fromJson` сохраняет `payloadObj.toString()` — точное строковое представление payload до какой-либо обработки. Именно оно канонизируется и передаётся в верификатор; любое переформатирование меняет байты и делает подпись невалидной.
- **Публичный ключ принимается в трёх форматах** — PEM (`-----BEGIN PUBLIC KEY-----...`), Base64-кодированный PEM, или сырой Base64 DER — так что можно передать содержимое `pub.pem` напрямую, закодировать его в Base64 для переменной окружения, или использовать DER. `PinnedClientFactory` добавляет префикс `sha256/`, если он отсутствует, поскольку именно в таком формате его ожидает `CertificatePinner`.

## Демо-приложение

В [репозитории android-sdk](https://github.com/ssl-pinning/android-sdk) есть модуль `app` — минимальное Compose-приложение для проверки SDK.

```bash
# Сначала разверните сервер ssl-pinning (см. Self-hosting), затем:
$ base64 -i pub.pem | tr -d '\n'
```

Заполните `local.properties` полученным значением и вашим эндпоинтом:

```properties
SSL_PINNING_ENDPOINT=https://ssl-pinning.example.com/api/v1/google.com.json
SSL_PINNING_SIGNING_KEY_B64=<вывод команды выше>
```

Соберите и запустите. При старте приложение вызывает `SslPinningClient.initialize` и показывает одно из трёх состояний: инициализация, ошибка инициализации (с причиной) или главный экран. На главном экране есть переключатель **Toggle SSL pinning** и кнопка **Send Request**; результат отображается цветовым индикатором — зелёный для успеха, красный для ошибки.

### Как увидеть блокировку атаки

Запустите MITM-прокси (Charles, Burp Suite или mitmproxy), направьте на него устройство через настройки Wi-Fi-прокси и установите CA-сертификат прокси (нужно рутованное устройство или эмулятор для системного хранилища — Android 7+ иначе блокирует пользовательские CA, см. [Модель угроз](./threat-model#инъекция-кастомныи-корневои-ca)).

При **выключенном пиннинге** запрос через прокси проходит успешно — plain-клиент доверяет CA прокси. При **включённом пиннинге** запрос падает:

```
javax.net.ssl.SSLPeerUnverifiedException:
  Certificate pinning failure!
  Peer certificate chain:
    sha256/<proxy certificate hash>: <your domain>
  Pinned certificates for <your domain>:
    sha256/<expected hash from registry>
```

`CertificatePinner` сравнивает публичный ключ, предъявленный прокси, с пинами из реестра; несовпадение обрывает соединение до передачи каких-либо данных — именно то поведение, которое закрывает атаки Custom CA, Rogue CA, Evil Twin и BGP hijacking.
