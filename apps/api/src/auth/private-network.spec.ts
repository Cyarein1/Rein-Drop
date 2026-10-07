import { isLoopbackOrPrivateAddress } from './private-network.js';

describe('isLoopbackOrPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.200',
    '::ffff:192.168.0.200',
    'fd12:3456::1',
    'fe80::1',
  ])('allows %s', (ip) => {
    expect(isLoopbackOrPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '172.15.0.1', '::ffff:8.8.8.8', '2001:4860::8888', '', undefined, 'not-an-ip'])(
    'rejects %s',
    (ip) => {
      expect(isLoopbackOrPrivateAddress(ip)).toBe(false);
    },
  );
});
