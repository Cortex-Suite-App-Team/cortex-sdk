import { SCHEMA_VERSION } from './constants.js';
import { makeError, lookupError } from './errors.js';
const TERMINAL_STATES = new Set([
    'COMPLETED',
    'FAILED',
    'STOPPED',
    'TIMEOUT',
    'CANCELLED',
]);
const LIFECYCLE_STATE_MAP = {
    active: 'ACTIVE',
    waiting: 'WAITING',
    completed: 'COMPLETED',
    failed: 'FAILED',
    stopped: 'STOPPED',
    timeout: 'TIMEOUT',
    cancelled: 'CANCELLED',
};
export function createSession(callbacks) {
    let _sessionId = null;
    let _sessionState = 'CREATED';
    let _lastSeq = 0;
    let _transport = null;
    let _sendTimeoutMs = 10000;
    let _tenantId = null;
    function setSessionState(next) {
        if (TERMINAL_STATES.has(_sessionState) && _sessionState !== next) {
            return;
        }
        _sessionState = next;
    }
    function updateSessionStateFromMessage(msg) {
        if (msg.type === 'sandbox::snapshot') {
            const state = typeof msg.payload['state'] === 'string' ? msg.payload['state'].toLowerCase() : null;
            if (state === 'waiting') {
                setSessionState('WAITING');
            }
            return;
        }
        if (msg.type === 'sandbox::lifecycle') {
            const status = typeof msg.payload['status'] === 'string' ? msg.payload['status'].toLowerCase() : null;
            if (status && status in LIFECYCLE_STATE_MAP) {
                setSessionState(LIFECYCLE_STATE_MAP[status]);
            }
            return;
        }
        if (msg.type === 'system::error') {
            const code = typeof msg.payload['code'] === 'string' ? msg.payload['code'] : 'session_terminal';
            if (lookupError(code)?.fatal) {
                setSessionState('FAILED');
            }
        }
    }
    function send(envelope) {
        if (!_transport)
            return Promise.reject(new Error('No transport'));
        return _transport.send(envelope, _sendTimeoutMs);
    }
    function buildEnvelope(type, payload) {
        const env = {
            type,
            schema: SCHEMA_VERSION,
            payload,
            ts: new Date().toISOString(),
        };
        if (_sessionId)
            env['session_id'] = _sessionId;
        return env;
    }
    function makeClientMsgId(prefix) {
        const cryptoRef = globalThis.crypto;
        if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
            return `${prefix}_${cryptoRef.randomUUID()}`;
        }
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    }
    function buildMessagePayload(content, attachments) {
        const payload = { content, role: 'user' };
        if (attachments && attachments.length > 0) {
            payload['meta'] = { attachments };
        }
        return payload;
    }
    function handleSystemError(payload) {
        const code = typeof payload['code'] === 'string' ? payload['code'] : 'session_terminal';
        const message = typeof payload['message'] === 'string' ? payload['message'] : 'Runtime error';
        const entry = lookupError(code);
        const fatal = entry?.fatal ?? false;
        const err = makeError(code, message);
        if (fatal) {
            callbacks.onFatalError(err);
        }
        // Pass through to user as a message regardless
        // (the envelope was already dispatched above via onMessage)
    }
    return {
        setTenantId(tenantId) {
            const normalized = typeof tenantId === 'string' ? tenantId.trim() : '';
            _tenantId = normalized || null;
        },
        setTransport(transport, sendTimeoutMs) {
            _transport = transport;
            _sendTimeoutMs = sendTimeoutMs;
        },
        get sessionId() { return _sessionId; },
        get sessionState() { return _sessionState; },
        get lastSeq() { return _lastSeq; },
        sendInit(bootstrap) {
            _sessionState = 'INITIALIZING';
            // system::init has no session_id — intentionally omit it
            const envelope = {
                type: 'system::init',
                schema: SCHEMA_VERSION,
                payload: bootstrap,
                meta: { client_msg_id: makeClientMsgId('cli_init') },
                ts: new Date().toISOString(),
            };
            if (_tenantId)
                envelope['tenant_id'] = _tenantId;
            return send(envelope);
        },
        sendResync() {
            return send(buildEnvelope('system::resync', { last_seq: _lastSeq }));
        },
        sendStop() {
            return send(buildEnvelope('sandbox::stop', {}));
        },
        sendChatMessage(content, attachments) {
            return send(buildEnvelope('chat::message', buildMessagePayload(content, attachments)));
        },
        sendSystemTrigger(content, attachments) {
            const payload = { content };
            if (attachments && attachments.length > 0) {
                payload['meta'] = { attachments };
            }
            return send(buildEnvelope('system::trigger', payload));
        },
        sendTrigger(payload) {
            return send({
                type: 'system::trigger',
                schema: SCHEMA_VERSION,
                payload: payload || {},
                meta: { client_msg_id: makeClientMsgId('cli_trigger') },
                ts: new Date().toISOString(),
            });
        },
        handleIncoming(data) {
            let msg;
            try {
                msg = JSON.parse(data);
            }
            catch {
                return; // malformed frame — ignore
            }
            // Learn session_id from first server message
            if (!_sessionId && msg.session_id) {
                _sessionId = msg.session_id;
                if (!TERMINAL_STATES.has(_sessionState)) {
                    _sessionState = 'ACTIVE';
                }
            }
            // Track sequence
            if (typeof msg.seq === 'number' && msg.seq > _lastSeq) {
                _lastSeq = msg.seq;
            }
            updateSessionStateFromMessage(msg);
            // Handle state-changing message types
            if (msg.type === 'system::error') {
                handleSystemError(msg.payload);
            }
            callbacks.onMessage(msg);
        },
    };
}
//# sourceMappingURL=session.js.map