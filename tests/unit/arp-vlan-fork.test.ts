/**
 * Fork: find_devices_on_vlan matches current OPNsense VLAN device names exactly.
 */
import { describe, it, expect } from 'vitest';
import { ArpTableResource } from '../../src/resources/network/arp.js';

function resourceWith(interfaces: string[]) {
  const client = {
    get: async () => interfaces.map((intf, i) => ({ ip: `10.0.0.${i}`, mac: '', intf })),
  };
  return new ArpTableResource(client as any);
}

describe('ArpTableResource.findOnVlan', () => {
  it('matches vlan070, vlan0.100 and the older vlan70 / igc2_vlan70 names', async () => {
    const arp = resourceWith(['vlan070', 'vlan70', 'igc2_vlan70', 'vlan0.100', 'vlan010', 'igc0']);
    expect((await arp.findOnVlan('70')).map(e => e.interface)).toEqual(['vlan070', 'vlan70', 'igc2_vlan70']);
    expect((await arp.findOnVlan('100')).map(e => e.interface)).toEqual(['vlan0.100']);
  });

  it('does not match a longer tag that starts with the same digits', async () => {
    const arp = resourceWith(['vlan010', 'vlan0100']);
    expect(await arp.findOnVlan('1')).toEqual([]);
    expect((await arp.findOnVlan('10')).map(e => e.interface)).toEqual(['vlan010']);
  });
});
