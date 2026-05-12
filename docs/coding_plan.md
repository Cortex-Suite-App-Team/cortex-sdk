# Cortex SDK — Coding Plan

## Принцип

Сначала — shared foundation (типы, схемы, контракты).
Потом — каждый binding отдельно, но оба тестируются против одних и тех же артефактов.
JS browser и Node.js — один npm-пакет, два entry point.
Python — отдельный пакет.

---

## Repo Structure (target)

```
cortex-sdk/
├── shared/                  # типы, схемы, константы — не публикуется отдельно
│   ├── schema/              # JSON-схемы сообщений
│   ├── errors.json          # canonical error catalog
│   ├── constants.json       # default auth base URL, endpoint paths и прочие SDK-константы
│   └── transcripts/         # эталонные message sequences для тестов
│
├── js/                      # один пакет для browser + Node.js
│   ├── src/
│   │   ├── constants.ts
│   │   ├── types.ts
│   │   ├── errors.ts
│   │   ├── auth.ts
│   │   ├── transport.ts
│   │   ├── session.ts
│   │   ├── liveness.ts
│   │   ├── upload.ts
│   │   └── client.ts        # CortexClient — главный класс
│   ├── browser/             # browser entry point
│   ├── node/                # Node.js entry point
│   └── tests/
│
└── python/
    ├── cortex\_sdk/
    │   ├── constants.py
    │   ├── types.py
    │   ├── errors.py
    │   ├── auth.py
    │   ├── transport.py
    │   ├── session.py
    │   ├── liveness.py
    │   ├── upload.py
    │   └── client.py        # CortexClient — главный класс
    └── tests/
```

---

## Phase 0 — Shared Foundation

**Что строим:** общие артефакты, которые будут источником правды для обоих binding.

### 0.1 Константы

Файл `shared/constants.json`:

```json
{
  "DEFAULT\_AUTH\_URL": "https://auth.cortexsuite.app",
  "AUTH\_TOKEN\_PATH": "/auth/token",
  "AUTH\_REFRESH\_PATH": "/auth/refresh",
  "WS\_SUBPROTOCOL": "cortex-sdk.v1",
  "SCHEMA\_VERSION": "1.0"
}
```

### 0.2 Message schema

JSON-схемы для каждого типа сообщения из `07\_normative\_appendices.md`.
Цель: binding тестируются против этих схем, не против друг друга.

Минимальный набор:

* `envelope.json` — базовый транспортный конверт
* `chat.message.json`, `chat.answer.json`, `chat.partial.json`
* `system.init.json`, `system.ping.json`, `system.pong.json`, `system.error.json`
* `sandbox.continue.json`, `sandbox.stop.json`, `escalation.reply.json`

### 0.3 Error catalog

Файл `shared/errors.json` — все canonical error codes с полями `retryable` и `fatal`.
Оба binding читают его как источник правды.

### 0.4 Test transcripts

Эталонные последовательности сообщений для conformance-тестов:

* `normal\_chat.json` — init → message → answer
* `streaming\_chat.json` — init → message → partial\* → answer
* `reconnect.json` — connect → disconnect → reconnect → resync → resume
* `auth\_refresh.json` — expired token → refresh → continue
* `file\_upload.json` — upload → sendMessage with attachment

**Gate:** shared артефакты зафиксированы, не меняются без явного решения.

---

## Phase 1 — JS/Node.js Binding

Один пакет `@cortex-suite/sdk`, два entry point: `browser` и `node`.
Разница только в слое транспорта (нативный браузерный WS vs `ws`-пакет) и в обработке файлов.
Весь бизнес-логический код — общий.

### 1.1 Types (`types.ts`)

* `CortexClientOptions` — параметры конструктора
* `CortexMessage` — typed incoming message envelope
* `SessionState`, `ChannelState` — enums
* payload типы для каждого message type

### 1.2 Constants (`constants.ts`)

Binding-specific exports, сгенерированные из `shared/constants.json`:
`DEFAULT\_AUTH\_URL`, `AUTH\_TOKEN\_PATH`, `AUTH\_REFRESH\_PATH`, `WS\_SUBPROTOCOL`, таймауты по умолчанию.

### 1.3 Errors (`errors.ts`)

`CortexError` — класс ошибки с полями `code`, `message`, `retryable`, `fatal`.
Фабричные методы по кодам из error catalog.

### 1.4 Auth (`auth.ts`)

* `exchangeApiKey(apiKey, authUrl?)` → `{ wsUrl, accessToken, refreshToken }`
* `refreshAccessToken(refreshToken, authUrl)` → `{ accessToken }`
* управление таймингом: знает когда рефрешить до экспирации
* `authUrl` — public constructor option; если не задан, binding использует `DEFAULT_AUTH_URL`

### 1.5 Transport (`transport.ts`)

Абстракция над WebSocket:

* `open(wsUrl, accessToken)` — открывает WS с subprotocol binding
* `send(message)` — с таймаутом
* `close()` — чистое закрытие
* `onmessage` / `onclose` / `onerror` — хуки

Browser entry: нативный `WebSocket`.
Node.js entry: пакет `ws`.
Интерфейс одинаковый.

### 1.6 Liveness (`liveness.ts`)

* запускает ping-loop с интервалом
* трекает время последнего pong
* переводит канал в `STALE` → `RECONNECTING` если pong не пришёл вовремя

### 1.7 Session (`session.ts`)

* трекает `sessionState`, `sessionId`
* строит и отправляет `system::init` с `meta.client_msg_id`
* принимает `system::opened` и фиксирует канонический `sessionId`
* строит и отправляет `system::resync` после reconnect
* обрабатывает входящие session lifecycle сообщения

### 1.8 Upload (`upload.ts`)

* `uploadFile(file, accessToken)` → `attachmentId`
* Browser: принимает `File` / `Blob` / `ArrayBuffer`
* Node.js: принимает `Buffer` / path string / `ReadableStream`
* HTTP POST multipart, с авторизацией

### 1.9 Client (`client.ts`) — главный класс

`CortexClient` — склеивает всё вместе:

* `constructor(options)` — валидирует опции, инициализирует модули
* `connect()` — auth exchange → WS open → session init → liveness start
* `disconnect()` — stop liveness → session stop → WS close
* `sendMessage({ content, attachments? })`
* `uploadAttachment(file)` → делегирует в `upload.ts`
* `stop()` → посылает `sandbox::stop`
* properties: `sessionState`, `channelState`, `sessionId`
* reconnect loop: встроен, не выставляется наружу

**Gate:**

* все методы работают в browser и Node.js
* conformance-тесты против shared transcripts проходят

---

## Phase 2 — Python Binding

Пакет `cortex-sdk`. Те же модули, те же имена в `snake\_case`.

### 2.1 Types (`types.py`)

`TypedDict` для всех структур: опции, сообщения, состояния.
Цель: работает со статическими анализаторами (`mypy`, `pyright`).

### 2.2 Constants (`constants.py`)

Те же значения что в `shared/constants.json`.

### 2.3 Errors (`errors.py`)

`CortexError(Exception)` с полями `code`, `message`, `retryable`, `fatal`.

### 2.4 Auth (`auth.py`)

`httpx` для HTTP запросов:

* `exchange\_api\_key(api\_key, auth\_url=None)` → `{ ws\_url, access\_token, refresh\_token }`
* `refresh\_access\_token(refresh\_token, auth\_url)` → `{ access\_token }`
* `auth\_url` — public constructor option; если не задан, binding использует `DEFAULT_AUTH_URL`

### 2.5 Transport (`transport.py`)

`websockets` для WS:

* `open(ws\_url, access\_token)`
* `send(message)`
* `close()`

### 2.6 Liveness (`liveness.py`)

Та же логика что в JS. asyncio-таски для ping loop.

### 2.7 Session (`session.py`)

Та же логика что в JS. Билдит `system::init` с `meta.client_msg_id`, принимает `system::opened`,
запоминает канонический `session_id` и отправляет `system::resync` после reconnect.

### 2.8 Upload (`upload.py`)

`httpx` multipart upload:

* принимает path / bytes / file-like
* возвращает `attachment\_id`

### 2.9 Client (`client.py`) — главный класс

`CortexClient` — идентичная логика, Python conventions:

* `async def connect()`
* `async def disconnect()`
* `async def send\_message(content, attachments=None)`
* `async def upload\_attachment(file)`
* `async def stop()`
* properties: `session\_state`, `channel\_state`, `session\_id`

**Gate:**

* тесты против тех же shared transcripts что и JS
* `mypy` проходит без ошибок

---

## Phase 3 — Conformance

Цель: доказать что оба binding реализуют один контракт.

### 3.1 Conformance harness

Мок-сервер: принимает WS-соединения, воспроизводит shared transcripts, проверяет что клиент ведёт себя правильно.

Сценарии:

* нормальный чат
* стриминг
* reconnect с resync
* auth refresh
* загрузка файла
* stop
* все canonical error codes

### 3.2 Parity check

Автоматический тест: одни и те же сценарии прогоняются через JS и Python binding.
Результаты сравниваются. Расхождение = баг.

**Gate:** 100% сценариев проходят в обоих binding.

---

## Phase 4 — Packaging

### JS

* ESM package with root `@cortex-suite/sdk` import and explicit `browser` / `node` subpath exports
* публикация в npm как `@cortex-suite/sdk`
* README с примерами (обновляется из `05\_bindings.md`)

### Python

* `pyproject.toml`, зависимости: `websockets`, `httpx`
* публикация в PyPI как `cortex-sdk`
* README с примерами

**Gate:** `npm install @cortex-suite/sdk` и `pip install cortex-suite-sdk` работают, базовый пример запускается.

---

## Порядок и параллелизм

```
Phase 0  ──────────────────────────────────────┐
                                               │
Phase 1 (JS)  ──────────────────┐              │ зависит от Phase 0
Phase 2 (Python) ───────────────┤
                                │
Phase 3 (Conformance) ──────────┘  зависит от Phase 1 + 2
                                │
Phase 4 (Packaging) ────────────┘  зависит от Phase 3
```

Phase 1 и Phase 2 можно вести параллельно как только Phase 0 закрыт.

---

## Что НЕ входит в этот план

* UI-компоненты
* Sandbox
* продуктовые обёртки над SDK
* серверная сторона (SessionManager, Runtime) — это отдельный проект

---

## Definition of Done

SDK готов когда:

1. `CortexClient` работает в browser, Node.js, Python
2. API surface идентичен во всех трёх
3. Auth, reconnect, liveness, upload — всё автоматически
4. Conformance-тесты зелёные
5. Пакеты опубликованы и устанавливаются одной командой

## Замечания
Несколько честных замечаний по плану.

**Conformance harness строй раньше, не в Phase 3.** Мок-сервер должен быть готов до того как ты заканчиваешь Phase 1. Иначе будешь тестировать JS против самого JS — а не против контракта. Ошибку паритета обнаружишь только когда Python уже написан, и это больно.

**Рефреш токена — самое опасное место.** Большинство SDK-ошибок именно тут. Не рефреши по 401 — рефреши проактивно когда `expires_at - now < buffer` (скажем, 60 секунд). Рефреш по 401 создаёт race condition при параллельных запросах, которые все одновременно получают 401 и все одновременно пытаются рефрешнуть.

**Для JS-пакета следи за бандлом.** Один пакет — правильно, но убедись что `ws` (Node.js WS-библиотека) не попадает в браузерный бандл. Это решается через `exports` в `package.json` с отдельными `browser` и `node` полями, но легко облажаться.

**Загрузка файла — подумай об orphan-кейсе.** Пользователь загрузил файл, получил `attachment_id`, потом `sendMessage` упал. Файл на сервере есть, в сообщении его нет. Либо TTL на загруженные файлы, либо документируй это явно — чтобы пользователь не удивлялся.

**Что делать после терминального состояния сессии?** Сейчас у тебя "один инстанс = одна сессия". После `COMPLETED` или `FAILED` — пользователь создаёт новый `CortexClient`? Или может вызвать `connect()` повторно? Это надо решить до кода, иначе потом будет ломать API.

**Python sync-обёртка.** Часть пользователей Python будет использовать SDK в скриптах без asyncio. Стоит добавить тонкую синхронную обёртку (`run_sync()` или отдельный `CortexClientSync`) — это не много кода, но сильно расширяет аудиторию. OpenAI SDK это делает именно так.

Из этого всего самое критичное — **token refresh и conformance harness**. Остальное можно доточить итерациями.

## Post-Phase-2 Hardening

После базовой реализации обязательно закрыть несколько технических долгов, иначе SDK будет выглядеть
готовым раньше времени:

* выровнять JS package exports и фактический `dist/` layout, чтобы документированные импорты реально работали
* держать `sdk/shared/constants.json` и `sdk/shared/errors.json` как canonical source of truth и генерировать binding artifacts из них
* расширить session state machine в JS и Python до `WAITING` и terminal lifecycle states
* держать `npm test` кроссплатформенным, включая Windows
* синхронизировать `05_bindings.md` и packaging contract после каждого изменения entrypoint-ов
