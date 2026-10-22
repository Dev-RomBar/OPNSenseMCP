/**
 * Unit tests for SSHExecutor: this fork disables SSH entirely.
 *
 * The SSH executor is a separate blast-radius surface from the OPNsense API
 * client: it runs whitelisted shell commands (including `rm`, `pfctl`,
 * `configctl`, `service`) directly on the router over SSH. OPNSENSE_DRY_RUN
 * and OPNSENSE_READ_ONLY must stop anything but a small set of known
 * read-only commands from ever reaching the SSH connection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

class FakeStream extends EventEmitter {
  stderr = new EventEmitter();
}

class FakeSSHClient extends EventEmitter {
  connect = vi.fn(() => {
    // Simulate an async, successful SSH handshake.
    setImmediate(() => this.emit('ready'));
    return this;
  });
  exec = vi.fn((_command: string, cb: (err: Error | undefined, stream: FakeStream) => void) => {
    const stream = new FakeStream();
    cb(undefined, stream);
    setImmediate(() => {
      stream.emit('data', Buffer.from('ok'));
      stream.emit('close', 0, undefined);
    });
  });
  end = vi.fn();
}

vi.mock('ssh2', () => ({
  Client: vi.fn().mockImplementation(function (this: any) {
    return new FakeSSHClient();
  }),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, OPNSENSE_SSH_HOST: 'opnsense.example.test', OPNSENSE_SSH_PASSWORD: 'x' };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('SSHExecutor fork: SSH disabled', () => {
  it.each([
    'pfctl -d',
    'rm -rf /conf',
    'cat /conf/config.xml; reboot',
    'pfctl -s rules',
    'xmllint --noout /conf/config.xml',
  ])('never sends %s, whatever the safety mode', async (command) => {
    const { SSHExecutor } = await import('../../src/resources/ssh/executor.js');
    const executor = new SSHExecutor();
    const connect = vi.spyOn(executor as any, 'connect');

    const result = await executor.execute(command);

    expect(result.success).toBe(false);
    expect(result.stderr).toMatch(/SSH is disabled/i);
    expect(connect).not.toHaveBeenCalled();
  });
});
