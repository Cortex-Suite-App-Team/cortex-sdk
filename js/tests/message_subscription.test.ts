import { startMockServer } from './mock-server.js';
import { makeClient } from './test-client-factory.js';
import { waitFor } from './helpers.js';

describe('message subscription hook', () => {
  it('delivers messages to constructor callback first, then subscribed handlers in insertion order', async () => {
    const server = await startMockServer({
      autoInitEcho: true,
      autoChatAnswer: true,
    });

    const order: string[] = [];
    const client = makeClient(server, (message) => {
      if (message.type === 'chat::answer' && message.payload['answer_kind'] === 'final') {
        order.push('constructor');
      }
    });

    const unsubscribeFirst = client.onMessage((message) => {
      if (message.type === 'chat::answer' && message.payload['answer_kind'] === 'final') {
        order.push('subscriber:first');
      }
    });

    client.onMessage((message) => {
      if (message.type === 'chat::answer' && message.payload['answer_kind'] === 'final') {
        order.push('subscriber:second');
      }
    });

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);
      await client.sendMessage({ content: 'Hello' });

      await waitFor(() => order.length === 3, 3000);
      expect(order).toEqual(['constructor', 'subscriber:first', 'subscriber:second']);

      unsubscribeFirst();
      order.length = 0;

      await client.sendMessage({ content: 'Hello again' });
      await waitFor(() => order.length === 2, 3000);
      expect(order).toEqual(['constructor', 'subscriber:second']);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('isolates subscribed handler errors so later handlers still receive the message', async () => {
    const server = await startMockServer({
      autoInitEcho: true,
      autoChatAnswer: true,
    });

    const client = makeClient(server, () => {});
    const events: string[] = [];

    client.onMessage((message) => {
      if (message.type === 'chat::answer' && message.payload['answer_kind'] === 'final') {
        events.push('subscriber:throwing');
        throw new Error('boom');
      }
    });

    client.onMessage((message) => {
      if (message.type === 'chat::answer' && message.payload['answer_kind'] === 'final') {
        events.push('subscriber:survived');
      }
    });

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);
      await client.sendMessage({ content: 'Hello' });

      await waitFor(() => events.length === 2, 3000);
      expect(events).toEqual(['subscriber:throwing', 'subscriber:survived']);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });

  it('constructor onMessage throwing does not block subscribed handlers', async () => {
    const server = await startMockServer({
      autoInitEcho: true,
      autoChatAnswer: true,
    });

    const events: string[] = [];
    const client = makeClient(server, (message) => {
      if (message.type === 'chat::answer' && message.payload['answer_kind'] === 'final') {
        events.push('constructor:throwing');
        throw new Error('constructor boom');
      }
    });

    const unsubscribe = client.onMessage((message) => {
      if (message.type === 'chat::answer' && message.payload['answer_kind'] === 'final') {
        events.push('subscriber:survived');
      }
    });

    try {
      await client.connect();
      await waitFor(() => client.sessionId !== null);
      await client.sendMessage({ content: 'Hello' });

      await waitFor(() => events.length === 2, 3000);
      expect(events).toEqual(['constructor:throwing', 'subscriber:survived']);

      unsubscribe();
      events.length = 0;
      await client.sendMessage({ content: 'Hello again' });
      await waitFor(() => events.length === 1, 3000);
      expect(events).toEqual(['constructor:throwing']);
    } finally {
      await client.disconnect();
      await server.close();
    }
  });
});
