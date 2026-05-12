# Backend Contract for Cortex SDK

Этот документ описывает что backend (SessionManager / Runtime) обязан реализовать
чтобы новый SDK работал корректно.

Документ является рабочим: владелец правит placeholder-значения под реальный код,
затем передаёт разработчику backend как требования.

---

## 1. Auth Endpoints (HTTP)

SDK constructor accepts `authUrl` / `auth_url` as an auth base URL.
SDK builds auth endpoints from that base:

- `POST {authUrl}/auth/token`
- `POST {authUrl}/auth/refresh`

`ws_url` is returned by backend in `/auth/token`. SDK does not derive or configure
the WebSocket URL itself.

### POST /auth/token

Обмен API-ключа на токены и WS-адрес.

**Request:**
```http
POST /auth/token
Authorization: ApiKey {api_key}
Content-Type: application/json
```

**Response 200:**
```json
{
  "ws_url": "wss://runtime.cortexsuite.app/ws/",
  "access_token": "<JWT>",
  "refresh_token": "<JWT>",
  "runtime_bootstrap": {
    "execution_mode": "production",
    "bundle_url": "/api/runtime/releases/42/bundle/",
    "checksum": "sha256:abc123"
  }
}
```

**Response 401:**
```json
{
  "error": "auth_invalid",
  "message": "API key rejected"
}
```

---

### POST /auth/refresh

Обновление access token по refresh token.

**Request:**
```http
POST /auth/refresh
Authorization: Bearer {refresh_token}
Content-Type: application/json
```

**Response 200:**
```json
{
  "access_token": "<new JWT>"
}
```

**Response 401:**
```json
{
  "error": "auth_refresh_failed",
  "message": "Refresh token expired or invalid"
}
```

---

## 2. File Upload Endpoint (HTTP)

### POST /upload

Загрузка файла-вложения. Возвращает стабильный `attachment_id`.
Этот endpoint относится к runtime-side upload contract и не должен считаться
производным от `authUrl` / `auth_url` как части auth model.

**Request:**
```http
POST /upload
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

file=<binary>
```

**Response 200:**
```json
{
  "attachment_id": "att_abc123"
}
```

**Response 413** (файл слишком большой):
```json
{
  "error": "upload_too_large",
  "message": "File exceeds the allowed size limit"
}
```

**Response 415** (тип файла не принимается):
```json
{
  "error": "upload_type_rejected",
  "message": "File type not accepted"
}
```

> **Уточнить:**
> - точный URL endpoint (`/upload`? `/v1/files`? другой?)
> - максимальный размер файла
> - принимаемые MIME-типы
> - TTL загруженного файла (через сколько `attachment_id` становится невалидным?)

---

## 3. WebSocket Endpoint

### Адрес

```
wss://runtime.cortexsuite.app/ws/
```

Адрес возвращается в поле `ws_url` при `/auth/token`. Backend не обязан держать его
фиксированным. SDK читает `ws_url` из auth response при каждом `connect()`, а пользователь
SDK этот адрес не конфигурирует.

### Subprotocol handshake

Клиент предлагает два subprotocol:
```
cortex-sdk.v1
cortex-sdk.jwt.<access_token>
```

Сервер обязан:
1. Найти subprotocol вида `cortex-sdk.jwt.*`
2. Извлечь и валидировать JWT
3. Если валиден — ответить принятием subprotocol `cortex-sdk.v1`
4. Если невалиден — закрыть соединение с кодом 4001 и canonical error `auth_invalid` или `auth_expired`

**Важно:** токен идёт в subprotocol, не в URL и не в заголовке `Authorization`.

---

## 4. Message Handling

### Общий формат (envelope)

Все сообщения через WS — JSON, формат:

```json
{
  "type": "chat::answer",
  "schema": "1.0",
  "session_id": "sess_abc123",
  "seq": 42,
  "payload": {},
  "meta": {},
  "ts": "2026-04-03T12:00:00Z"
}
```

- `seq` — назначает сервер, монотонно возрастающий per session
- `schema` — текущая версия `"1.0"`
- `ts` — сервер проставляет на всех исходящих сообщениях

---

### system::init (client → server)

Стартовое transport-сообщение которым открывается новая сессия.
Это не RPC-вызов, но успешный bootstrap немедленно подтверждается серверным `system::opened`.

`session_id` при отправке отсутствует: его назначает SessionManager на сервере.
Клиент узнаёт `session_id` из первого входящего `system::opened`.

Источники правды по структуре и поведению: `docs/MESSAGE_SYSTEM.md` (line 688),
`sdk/shared/transcripts/normal_chat.json`.

```json
{
  "type": "system::init",
  "schema": "1.0",
  "meta": {
    "client_msg_id": "cli_init_123"
  },
  "payload": {
    "execution_mode": "production",
    "bundle_url": "/api/runtime/releases/42/bundle/",
    "checksum": "sha256:abc123"
  }
}
```

SDK берёт `payload` целиком из `runtime_bootstrap`, полученного при `/auth/token`,
и автоматически прокидывает его в `system::init`. Пользователь SDK эти поля не видит и не передаёт.
`meta.client_msg_id` SDK обязан генерировать сам и использовать как idempotency key для retry/reconnect
до получения канонического `session_id`.

`bundle_url` в canonical CP bootstrap contract должен приходить как relative path. Runtime также
принимает absolute URL только как compatibility path при strict same-origin `https`; `http://`
absolute URL считается недопустимым.

Поля `artifact_id`, `artifact_kind`, `run_mode` — Sandbox-поля, для `production` не нужны.
При добавлении Sandbox-режима в будущем — `/auth/token` возвращает расширенный
`runtime_bootstrap` с этими полями, SDK прокидывает их так же прозрачно.

> **D-4 закрыт.** Обновить `sdk/shared/schema/system.init.json`:
> оставить `execution_mode`, `bundle_url`, `checksum` как required;
> `artifact_id`, `artifact_kind`, `run_mode` — optional для будущего Sandbox.

---

### system::opened (server → client)

Канонический bootstrap-ack от SessionManager. Приходит сразу после успешного publish `system::init`
в runtime inbox и до любых последующих сообщений, зависящих от `session_id`.

```json
{
  "type": "system::opened",
  "schema": "1.0",
  "session_id": "sess_abc123",
  "seq": 1,
  "payload": {
    "status": "initializing",
    "client_msg_id": "cli_init_123",
    "execution_mode": "production"
  }
}
```

Поведение:

- SDK обязан считать `system::opened` источником истины для `session_id`
- duplicate `system::init` с тем же `meta.client_msg_id` должен приводить к replay того же
  `system::opened`, а не к созданию второй session
- до получения `system::opened` SDK не должен отправлять сообщения, требующие `session_id`

---

### system::resync (client → server)

Запрос на пересинхронизацию после reconnect.

```json
{
  "type": "system::resync",
  "schema": "1.0",
  "session_id": "sess_abc123",
  "payload": {
    "last_seq": 42
  }
}
```

Сервер обязан:
- принять `last_seq` как точку отсчёта
- если `session_id` не найден — вернуть `system::error` с кодом `unknown_session`
- если session в `CREATED` / `INITIALIZING` — replay-ить последний `system::opened`
- если session в `ACTIVE` — replay-ить последний `sandbox::lifecycle(status=active)`, а при его
  отсутствии fallback-ить к `system::opened`
- если sandbox session в `WAITING` — replay-ить последний `sandbox::snapshot(state=waiting)`
- если non-sandbox session в `WAITING` — replay-ить последний `escalation::request`
- если sandbox session terminal — replay-ить последний terminal lifecycle
- для non-sandbox terminal sessions отдельный SDK-facing `sandbox::lifecycle(...)` replay не требуется
- если replay artifacts недоступны — вернуть `system::error` с кодом `replay_unavailable`

---

### system::ping / system::pong (liveness)

**Ping (client → server):**
```json
{
  "type": "system::ping",
  "session_id": "sess_abc123",
  "payload": {
    "heartbeat_id": "hb_xyz",
    "channel_id": "ch_abc"
  }
}
```

**Pong (server → client):**
```json
{
  "type": "system::pong",
  "session_id": "sess_abc123",
  "payload": {
    "heartbeat_id": "hb_xyz",
    "channel_id": "ch_abc",
    "server_ts": "2026-04-03T12:00:00Z"
  }
}
```

Сервер обязан отвечать на каждый ping pong-ом в течение 5 секунд.
`heartbeat_id` эхируется без изменений.

---

### chat::message (client → server)

```json
{
  "type": "chat::message",
  "session_id": "sess_abc123",
  "payload": {
    "content": "Текст сообщения",
    "role": "user",
    "attachments": ["att_abc123"]
  }
}
```

`attachments` — опциональный массив `attachment_id` полученных через `/upload`.
Если пустой или отсутствует — игнорировать.

---

### chat::answer (server → client)

```json
{
  "type": "chat::answer",
  "session_id": "sess_abc123",
  "seq": 5,
  "payload": {
    "content": "Ответ модели",
    "role": "assistant",
    "answer_kind": "final",
    "turn_id": "turn_001"
  }
}
```

`answer_kind`: `"final"` — финальный ответ, `"echo"` — подтверждение init.

---

### chat::partial (server → client)

Streaming chunk. Может приходить N раз перед `chat::answer`.

```json
{
  "type": "chat::partial",
  "session_id": "sess_abc123",
  "seq": 3,
  "payload": {
    "content": "фрагмент",
    "role": "assistant",
    "turn_id": "turn_001"
  }
}
```

---

### sandbox::stop (client → server)

```json
{
  "type": "sandbox::stop",
  "session_id": "sess_abc123",
  "payload": {}
}
```

Сервер завершает сессию, переводит в состояние `STOPPED`.

---

### sandbox::continue (client → server)

```json
{
  "type": "sandbox::continue",
  "session_id": "sess_abc123",
  "payload": {
    "wait_token": "wt_abc123"
  }
}
```

### escalation::reply (client → server)

```json
{
  "type": "escalation::reply",
  "session_id": "sess_abc123",
  "payload": {
    "escalation_id": "esc_123",
    "action": "operator_input",
    "wait_token": "wt_abc123",
    "content": {
      "resolution": "approved"
    },
    "meta": {
      "operator_id": "op_1"
    }
  }
}
```

Поведение:

- `action=continue` отправляется в `SessionManager`, который валидирует active escalation и нормализует reply в `sandbox::continue`
- `action=operator_input` валидируется в `SessionManager` и только после этого форвардится в `GraphRuntime` как внутренний `escalation::reply`; сам `GraphRuntime` принимает только этот вариант
- `action=reply_user` доставляется `SessionManager` напрямую в пользовательскую session с SM-owned `seq` и не возобновляет execution автоматически

---

### system::error (server → client)

```json
{
  "type": "system::error",
  "session_id": "sess_abc123",
  "seq": 10,
  "payload": {
    "code": "unknown_session",
    "message": "Session does not exist",
    "node_key": null
  }
}
```

`code` — строго из canonical error catalog (`sdk/shared/errors.json`).
`fatal` — **не** включается в wire payload. SDK определяет fatality по `errors.json`.

---

### system::warning (server → client)

Нефатальное предупреждение. Сессия продолжается.

```json
{
  "type": "system::warning",
  "session_id": "sess_abc123",
  "payload": {
    "code": "string",
    "message": "Human-readable warning",
    "node_key": null
  }
}
```

---

## 5. Session States

Сервер управляет состоянием сессии. SDK отражает его.

| State | Значение |
|---|---|
| `CREATED` | init принят, bootstrap начат |
| `INITIALIZING` | runtime готовится |
| `ACTIVE` | сессия работает |
| `WAITING` | пауза, ждёт input |
| `COMPLETED` | завершена успешно |
| `FAILED` | завершена с ошибкой |
| `STOPPED` | остановлена командой stop |
| `TIMEOUT` | таймаут бездействия |
| `CANCELLED` | отменена |

> **Уточнить:** как клиент узнаёт о переходе состояния сессии?
> Через `chat::answer` с `answer_kind`? Через отдельный `system::*` event?
> Или только через закрытие WS-соединения?

---

## 6. Error Handling Rules

- Все ошибки приходят как `system::error` с canonical `code`
- Если ошибка терминальная — сервер закрывает WS после отправки `system::error`
- Если ошибка нетерминальная — WS остаётся открытым
- `code` строго из `sdk/shared/errors.json` — не придумывать новые коды без обновления каталога

---

## 7. Открытые вопросы (summary)

| # | Вопрос | Влияет на |
|---|---|---|
| — | Как клиент узнаёт о смене состояния сессии? | session.ts / session.py |
| — | TTL загруженных файлов | документация, UX |
| — | Принимаемые MIME-типы для upload | upload.ts / upload.py |
