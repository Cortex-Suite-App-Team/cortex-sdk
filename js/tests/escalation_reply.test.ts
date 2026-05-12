import { startMockServer } from './mock-server.js';
import { makeTestClient, waitFor } from './helpers.js';

describe('escalation reply transport', () => {
  it('sends continue without content using canonical payload keys', async () => {
    const server = await startMockServer({
      autoInitEcho: true,
      enableSchemaValidation: true,
    });
    const client = makeTestClient(server);

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      await client.replyEscalation({
        escalationId: 'esc_123',
        waitToken: 'wait_123',
        action: 'continue',
      });
      await waitFor(() => server.received.some((message) => message['type'] === 'escalation::reply'));

      const reply = server.received.find((message) => message['type'] === 'escalation::reply');
      expect(reply).toBeDefined();
      expect(reply).toMatchObject({
        type: 'escalation::reply',
        payload: {
          escalation_id: 'esc_123',
          action: 'continue',
          wait_token: 'wait_123',
        },
      });
      expect((reply?.['payload'] as Record<string, unknown>)['escalationId']).toBeUndefined();
      expect((reply?.['payload'] as Record<string, unknown>)['waitToken']).toBeUndefined();
      expect((reply?.['payload'] as Record<string, unknown>)['content']).toBeUndefined();
      expect(server.schemaViolations).toEqual([]);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('sends operator_input with object content and meta', async () => {
    const server = await startMockServer({
      autoInitEcho: true,
      enableSchemaValidation: true,
    });
    const client = makeTestClient(server);

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      await client.replyEscalation({
        escalationId: 'esc_456',
        waitToken: 'wait_456',
        action: 'operator_input',
        content: { resolution: 'approved' },
        meta: { operator_id: 'op_1' },
      });
      await waitFor(() => server.received.some((message) => message['type'] === 'escalation::reply'));

      const reply = server.received.find((message) => message['type'] === 'escalation::reply');
      expect(reply).toMatchObject({
        type: 'escalation::reply',
        payload: {
          escalation_id: 'esc_456',
          action: 'operator_input',
          wait_token: 'wait_456',
          content: { resolution: 'approved' },
          meta: { operator_id: 'op_1' },
        },
      });
      expect(server.schemaViolations).toEqual([]);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('sends reply_user with string content', async () => {
    const server = await startMockServer({
      autoInitEcho: true,
      enableSchemaValidation: true,
    });
    const client = makeTestClient(server);

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      await client.replyEscalation({
        escalationId: 'esc_789',
        waitToken: 'wait_789',
        action: 'reply_user',
        content: 'Need more information',
      });
      await waitFor(() => server.received.some((message) => message['type'] === 'escalation::reply'));

      const reply = server.received.find((message) => message['type'] === 'escalation::reply');
      expect(reply).toMatchObject({
        type: 'escalation::reply',
        payload: {
          escalation_id: 'esc_789',
          action: 'reply_user',
          wait_token: 'wait_789',
          content: 'Need more information',
        },
      });
      expect(server.schemaViolations).toEqual([]);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it.each([
    {
      name: 'blank escalationId',
      options: { escalationId: '   ', waitToken: 'wait_1', action: 'continue' as const },
      message: 'escalationId is required',
    },
    {
      name: 'blank waitToken',
      options: { escalationId: 'esc_1', waitToken: '   ', action: 'continue' as const },
      message: 'waitToken is required',
    },
    {
      name: 'invalid action',
      options: { escalationId: 'esc_1', waitToken: 'wait_1', action: 'bad_action' as 'continue' },
      message: 'Unsupported escalation reply action: bad_action',
    },
    {
      name: 'operator_input missing content',
      options: { escalationId: 'esc_1', waitToken: 'wait_1', action: 'operator_input' as const },
      message: 'content must be a string or object for escalation action operator_input',
    },
    {
      name: 'reply_user missing content',
      options: { escalationId: 'esc_1', waitToken: 'wait_1', action: 'reply_user' as const },
      message: 'content must be a string or object for escalation action reply_user',
    },
    {
      name: 'invalid numeric content',
      options: { escalationId: 'esc_1', waitToken: 'wait_1', action: 'operator_input' as const, content: 42 as unknown as string },
      message: 'content must be a string or object for escalation action operator_input',
    },
    {
      name: 'invalid array content',
      options: { escalationId: 'esc_1', waitToken: 'wait_1', action: 'reply_user' as const, content: ['x'] as unknown as string },
      message: 'content must be a string or object for escalation action reply_user',
    },
  ])('rejects $name before send', async ({ options, message }) => {
    const server = await startMockServer({
      autoInitEcho: true,
      enableSchemaValidation: true,
    });
    const client = makeTestClient(server);

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);

      await expect(client.replyEscalation(options)).rejects.toMatchObject({
        code: 'transport_protocol_violation',
        message,
      });
      expect(server.received.find((entry) => entry['type'] === 'escalation::reply')).toBeUndefined();
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('rejects when session is not ready', async () => {
    const server = await startMockServer({
      autoInitEcho: false,
    });
    const client = makeTestClient(server);

    try {
      await client.connect();

      await expect(client.replyEscalation({
        escalationId: 'esc_1',
        waitToken: 'wait_1',
        action: 'continue',
      })).rejects.toMatchObject({
        code: 'session_not_ready',
      });
    } finally {
      await client.disconnect();
      await server.close();
    }
  });
});
