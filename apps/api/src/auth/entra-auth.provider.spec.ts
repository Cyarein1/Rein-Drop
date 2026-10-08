import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload, type KeyObject } from 'jose';
import { Prisma, type PrismaClient } from '@rein-drop/db';
import { AppException } from '../common/errors/app.exception.js';
import { EntraAuthProvider, type EntraApiConfig } from './entra-auth.provider.js';

const TENANT = '11111111-2222-3333-4444-555555555555';
const API = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OID = '99999999-8888-7777-6666-555555555555';
const ISSUER = `https://${TENANT}.ciamlogin.com/${TENANT}/v2.0`;
const CONFIG: EntraApiConfig = { authority: 'https://reindrop.ciamlogin.com', tenantId: TENANT, audience: API, requiredScope: 'access_as_user' };
const USER = { id: '01990000-0000-7000-8000-000000000001', email: 'thandi@example.com', displayName: 'Thandi' };

let signingKey: KeyObject;
let otherKey: KeyObject;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  signingKey = pair.privateKey as KeyObject;
  otherKey = (await generateKeyPair('RS256')).privateKey as KeyObject;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] });
});

/** An access token as Entra External ID issues it for the Rein Drop API. */
async function token(claims: JWTPayload = {}, o: { key?: KeyObject; expiresIn?: string | number; issuer?: string; audience?: string } = {}) {
  return new SignJWT({ tid: TENANT, oid: OID, scp: 'access_as_user', ver: '2.0', email: 'Thandi@Example.com', name: 'Thandi', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
    .setIssuer(o.issuer ?? ISSUER)
    .setAudience(o.audience ?? API)
    .setIssuedAt()
    .setExpirationTime(o.expiresIn ?? '1h')
    .sign(o.key ?? signingKey);
}

function setup(o: { existing?: typeof USER | null; create?: () => Promise<unknown> } = {}) {
  const prisma = {
    user: {
      findUnique: vi.fn(async () => (o.existing === undefined ? null : o.existing)),
      create: vi.fn(o.create ?? (async (args: { data: { email: string; displayName: string | null } }) => ({ id: USER.id, email: args.data.email, displayName: args.data.displayName }))),
    },
  };
  return { prisma, provider: new EntraAuthProvider(prisma as unknown as PrismaClient, CONFIG, { issuer: ISSUER, keys }) };
}
const bearer = (t: string) => ({ headers: { authorization: `Bearer ${t}` }, remoteAddress: '203.0.113.9' });

describe('EntraAuthProvider - token verification', () => {
  it('authenticates an existing user by oid, from any network', async () => {
    const { provider, prisma } = setup({ existing: USER });
    expect(await provider.authenticate(bearer(await token()))).toEqual({
      status: 'authenticated',
      principal: { userId: USER.id, email: USER.email, displayName: 'Thandi', provider: 'entra', subject: OID },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { authProvider_authSubject: { authProvider: 'entra', authSubject: OID } } }));
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('asks for sign-in without a bearer token (and ignores the development header)', async () => {
    const { provider } = setup({ existing: USER });
    for (const headers of [{}, { authorization: 'Basic abc' }, { 'x-dev-auth-subject': 'local-dev-user' }]) {
      expect(await provider.authenticate({ headers, remoteAddress: '127.0.0.1' })).toEqual({ status: 'anonymous', reason: 'Sign in required' });
    }
  });

  it('says an expired token means the session expired', async () => {
    const { provider } = setup({ existing: USER });
    const expired = await token({}, { expiresIn: Math.floor(Date.now() / 1000) - 3600 });
    expect(await provider.authenticate(bearer(expired))).toEqual({ status: 'anonymous', reason: 'Your session has expired - sign in again' });
  });

  it.each([
    ['another signing key', {}, { key: 'other' }],
    ['another issuer', {}, { issuer: 'https://evil.example/v2.0' }],
    ['another audience (a token for some other API)', {}, { audience: '00000000-0000-0000-0000-000000000000' }],
    ['another tenant', { tid: '00000000-1111-2222-3333-444444444444' }, {}],
    ['no object id', { oid: undefined }, {}],
  ] as const)('rejects a token from %s', async (_, claims, o) => {
    const { provider, prisma } = setup({ existing: USER });
    const t = await token(claims, { ...o, key: 'key' in o ? otherKey : undefined });
    expect(await provider.authenticate(bearer(t))).toMatchObject({ status: 'anonymous', reason: expect.stringMatching(/^Invalid access token/) });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects unsigned and tampered tokens', async () => {
    const { provider } = setup({ existing: USER });
    const [h, p] = (await token()).split('.');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${p}.`;
    const tampered = `${h}.${Buffer.from(JSON.stringify({ oid: OID, tid: TENANT, scp: 'access_as_user' })).toString('base64url')}.${(await token()).split('.')[2]}`;
    for (const t of [none, tampered, 'not-a-jwt']) {
      expect(await provider.authenticate(bearer(t))).toMatchObject({ status: 'anonymous' });
    }
  });

  it('forbids a valid token without the API scope', async () => {
    const { provider } = setup({ existing: USER });
    expect(await provider.authenticate(bearer(await token({ scp: 'openid profile' })))).toEqual({
      status: 'forbidden',
      reason: 'The access token does not grant the "access_as_user" scope',
    });
  });
});

describe('EntraAuthProvider - mapping the identity to a Rein Drop user', () => {
  it('creates the user on first sign-in from the email and name claims (email lower-cased)', async () => {
    const { provider, prisma } = setup();
    expect(await provider.authenticate(bearer(await token()))).toMatchObject({ status: 'authenticated', principal: { email: 'thandi@example.com', subject: OID } });
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: { email: 'thandi@example.com', displayName: 'Thandi', authProvider: 'entra', authSubject: OID } }));
  });

  it('refuses a first sign-in without an email claim, with a setup hint', async () => {
    const { provider, prisma } = setup();
    expect(await provider.authenticate(bearer(await token({ email: undefined })))).toMatchObject({ status: 'forbidden', reason: expect.stringMatching(/optional "email" claim/) });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('never links accounts by email: an email used by another user is refused', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
    const { provider } = setup({ create: async () => Promise.reject(conflict) });
    expect(await provider.authenticate(bearer(await token()))).toEqual({ status: 'forbidden', reason: 'An account with this email already exists under another sign-in method' });
  });

  it('uses the user a parallel first request created', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
    const { provider, prisma } = setup({ create: async () => Promise.reject(conflict) });
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(USER);
    expect(await provider.authenticate(bearer(await token()))).toMatchObject({ status: 'authenticated', principal: { userId: USER.id } });
  });

  it('is 503 (not 401) when the database is down', async () => {
    const { provider, prisma } = setup();
    prisma.user.findUnique.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const err = await provider.authenticate(bearer(await token())).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).getStatus()).toBe(503);
  });
});

describe('EntraAuthProvider - discovery', () => {
  it('reads the issuer and keys from the tenant OpenID configuration, and is 503 while it is unreachable', async () => {
    const prisma = { user: { findUnique: vi.fn(async () => USER) } } as unknown as PrismaClient;
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('nope', { status: 500 }));
    const provider = new EntraAuthProvider(prisma, CONFIG, undefined, fetchImpl);
    const err = await provider.authenticate(bearer(await token())).catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(503);
    expect(fetchImpl).toHaveBeenCalledWith(`https://reindrop.ciamlogin.com/${TENANT}/v2.0/.well-known/openid-configuration`, expect.anything());

    // A wrong-tenant issuer in the document is refused too; the next call retries discovery.
    fetchImpl.mockResolvedValueOnce(Response.json({ issuer: 'https://other.ciamlogin.com/x/v2.0', jwks_uri: 'https://x/keys' }));
    expect(((await provider.authenticate(bearer(await token())).catch((e: unknown) => e)) as AppException).getStatus()).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
