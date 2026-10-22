/**
 * Unit tests for OPNSenseAPIClient's dry-run / read-only safety modes.
 *
 * These modes exist to stop an agent from making destructive changes to a
 * production router: OPNSENSE_READ_ONLY rejects every mutating request
 * before it is sent, OPNSENSE_DRY_RUN simulates it and logs what would have
 * happened. Both must hold even though GET requests are always allowed
 * through unmodified.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

const mockAxiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
};

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxiosInstance),
  },
}));

import { OPNSenseAPIClient, OPNSenseAPIError, snakeCasePath } from '../../src/api/client.js';

function baseConfig(overrides: Partial<{ dryRun: boolean; readOnly: boolean }> = {}) {
  return {
    host: 'https://opnsense.example.test',
    apiKey: 'key',
    apiSecret: 'secret',
    ...overrides,
  };
}

function okResponse(data: any = { result: 'saved' }) {
  return { status: 200, statusText: 'OK', data, headers: {} };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAxiosInstance.get.mockResolvedValue(okResponse({ rows: [] }));
  mockAxiosInstance.post.mockResolvedValue(okResponse());
  mockAxiosInstance.put.mockResolvedValue(okResponse());
  mockAxiosInstance.delete.mockResolvedValue(okResponse());
});

describe('OPNSenseAPIClient fork: always read-only', () => {
  it('rejects POST/PUT/DELETE even when no safety mode is set', async () => {
    const client = new OPNSenseAPIClient(baseConfig());

    await expect(client.post('/firewall/filter/addRule', { rule: {} })).rejects.toThrow(OPNSenseAPIError);
    await expect(client.put('/firewall/filter/setRule/uuid-1', { rule: {} })).rejects.toThrow(OPNSenseAPIError);
    await expect(client.delete('/firewall/filter/delRule/uuid-1')).rejects.toThrow(OPNSenseAPIError);

    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
    expect(mockAxiosInstance.put).not.toHaveBeenCalled();
    expect(mockAxiosInstance.delete).not.toHaveBeenCalled();
    expect(client.isReadOnly()).toBe(true);
  });

  it('ignores readOnly: false', async () => {
    const client = new OPNSenseAPIClient(baseConfig({ readOnly: false }));
    await expect(client.post('/firewall/filter/addRule', { rule: {} })).rejects.toThrow(OPNSenseAPIError);
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('sends search* helpers as GET with query parameters', async () => {
    const client = new OPNSenseAPIClient(baseConfig());

    await client.searchFirewallRules({ searchPhrase: 'dns' });

    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    expect(mockAxiosInstance.get.mock.calls[0][0]).toBe(
      '/firewall/filter/search_rule?current=1&rowCount=1000&searchPhrase=dns'
    );
  });
});

describe('OPNSenseAPIClient read-only mode', () => {
  it('rejects POST/PUT/DELETE without calling axios or simulating success', async () => {
    const client = new OPNSenseAPIClient(baseConfig({ readOnly: true }));

    await expect(client.post('/firewall/filter/addRule', { rule: {} })).rejects.toThrow(OPNSenseAPIError);
    await expect(client.put('/firewall/filter/setRule/uuid-1', { rule: {} })).rejects.toThrow(OPNSenseAPIError);
    await expect(client.delete('/firewall/filter/delRule/uuid-1')).rejects.toThrow(OPNSenseAPIError);

    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
    expect(mockAxiosInstance.put).not.toHaveBeenCalled();
    expect(mockAxiosInstance.delete).not.toHaveBeenCalled();
  });

  it('still executes GET requests normally', async () => {
    const client = new OPNSenseAPIClient(baseConfig({ readOnly: true }));
    const data = await client.get('/core/firmware/info');
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    expect(data).toBeDefined();
  });

  it('takes precedence over dryRun when both are set', async () => {
    const client = new OPNSenseAPIClient(baseConfig({ dryRun: true, readOnly: true }));
    await expect(client.post('/firewall/filter/addRule', { rule: {} })).rejects.toThrow(OPNSenseAPIError);
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('reports isReadOnly() as true', () => {
    const client = new OPNSenseAPIClient(baseConfig({ readOnly: true }));
    expect(client.isReadOnly()).toBe(true);
  });
});

describe('snakeCasePath (fork)', () => {
  it('converts camelCase actions so snake_case ACL patterns match', () => {
    expect(snakeCasePath('/diagnostics/interface/getArp')).toBe('/diagnostics/interface/get_arp');
    expect(snakeCasePath('/interfaces/vlan_settings/searchItem')).toBe('/interfaces/vlan_settings/search_item');
    expect(snakeCasePath('/interfaces/overview/getInterface/vlan070')).toBe('/interfaces/overview/get_interface/vlan070');
  });

  it('leaves identifiers and the query string alone', () => {
    expect(snakeCasePath('/firewall/filter/getRule/5a0b1c2d-0000-4000-8000-0123456789ab'))
      .toBe('/firewall/filter/get_rule/5a0b1c2d-0000-4000-8000-0123456789ab');
    expect(snakeCasePath('/interfaces/overview/interfacesInfo?rowCount=-1'))
      .toBe('/interfaces/overview/interfaces_info?rowCount=-1');
    expect(snakeCasePath('/core/system/status')).toBe('/core/system/status');
  });

  it('is applied to every GET', async () => {
    const client = new OPNSenseAPIClient(baseConfig());
    await client.get('/diagnostics/interface/getArp');
    expect(mockAxiosInstance.get.mock.calls[0][0]).toBe('/diagnostics/interface/get_arp');
  });
});
