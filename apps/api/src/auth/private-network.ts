import { isIPv4, isIPv6 } from 'node:net';

/**
 * True for loopback and private-network addresses (RFC 1918, IPv6 ULA / link-local,
 * IPv4-mapped IPv6). Used to keep development-only auth off the public internet.
 */
export function isLoopbackOrPrivateAddress(address: string | undefined): boolean {
  if (!address) return false;
  const ip = address.trim().toLowerCase();

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  if (isIPv4(ip)) return isPrivateIPv4(ip);
  if (isIPv6(ip)) {
    if (ip === '::1') return true;
    const first = parseInt(ip.split(':')[0] || '0', 16);
    return (first & 0xfe00) === 0xfc00 /* fc00::/7 */ || (first & 0xffc0) === 0xfe80; /* fe80::/10 */
  }
  return false;
}

function isPrivateIPv4(ip: string): boolean {
  const [a = -1, b = -1] = ip.split('.').map(Number);
  return (
    a === 127 || // loopback
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) // link-local
  );
}
