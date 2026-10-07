import { resolveRequestId } from './request-id.js';

describe('resolveRequestId', () => {
  it('reuses a safe incoming id', () => {
    expect(resolveRequestId('abc-123')).toBe('abc-123');
    expect(resolveRequestId(['first', 'second'])).toBe('first');
  });

  it('generates a uuid when missing or unsafe', () => {
    const uuid = /^[0-9a-f-]{36}$/;
    expect(resolveRequestId(undefined)).toMatch(uuid);
    expect(resolveRequestId('has spaces\nand newline')).toMatch(uuid);
    expect(resolveRequestId('x'.repeat(129))).toMatch(uuid);
  });
});
