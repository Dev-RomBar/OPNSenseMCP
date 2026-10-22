/**
 * Fork: Cloudflare Access JWT check and stateless Streamable HTTP on /mcp.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { connect } from 'net';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { accessJwtCheck } from '../../src/transports/access.js';
import { SSETransportServer } from '../../src/transports/SSETransportServer.js';

const ORIGINAL_ENV = { ...process.env };
let server: SSETransportServer | null = null;

afterEach(async () => {
  await server?.stop();
  server = null;
  process.env = { ...ORIGINAL_ENV };
});

async function start(env: Record<string, string>): Promise<string> {
  Object.assign(process.env, env);
  const port = 30000 + Math.floor(Math.random() * 20000);
  server = new SSETransportServer({ port, host: '127.0.0.1' });
  server.onConnection(async (transport) => {
    await new Server({ name: 'test', version: '0' }, { capabilities: { tools: {} } }).connect(transport);
  });
  await server.start();
  return `http://127.0.0.1:${port}`;
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } },
};

function post(base: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(initialize),
  });
}

describe('accessJwtCheck', () => {
  it('refuses to start without the Access settings', () => {
    expect(() => accessJwtCheck({})).toThrow(/CF_ACCESS_TEAM_DOMAIN/);
  });

  it('is disabled only with ALLOW_WITHOUT_ACCESS_JWT=true', () => {
    expect(accessJwtCheck({ ALLOW_WITHOUT_ACCESS_JWT: 'true' })).toBeNull();
  });
});

describe('SSETransportServer with the Access check', () => {
  const access = { CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', CF_ACCESS_AUD: 'aud' };

  it('rejects /mcp without a JWT', async () => {
    const base = await start(access);
    expect((await post(base)).status).toBe(403);
  });

  it('rejects /mcp with an invalid JWT', async () => {
    const base = await start(access);
    expect((await post(base, { 'cf-access-jwt-assertion': 'not-a-jwt' })).status).toBe(403);
  });

  it('leaves /health open for the container healthcheck', async () => {
    const base = await start(access);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});

describe('SSETransportServer stateless mode', () => {
  const env = { ALLOW_WITHOUT_ACCESS_JWT: 'true', MCP_STATELESS: 'true' };

  it('answers initialize with JSON and no session id', async () => {
    const base = await start(env);
    const response = await post(base);
    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-session-id')).toBeNull();
    expect((await response.json()).result.serverInfo.name).toBe('test');
  });

  it('answers GET /mcp with 405', async () => {
    const base = await start(env);
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });
});

describe('SSETransportServer request parsing', () => {
  it('survives an invalid Host header', async () => {
    const base = await start({ ALLOW_WITHOUT_ACCESS_JWT: 'true' });
    const port = Number(new URL(base).port);
    const status = await new Promise<string>((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.end('GET /health HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n');
      });
      let data = '';
      socket.on('data', (chunk) => (data += chunk));
      socket.on('end', () => resolve(data.split('\r\n')[0]));
      socket.on('error', reject);
    });
    expect(status).toMatch(/^HTTP\/1\.1 (200|400)/);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});
