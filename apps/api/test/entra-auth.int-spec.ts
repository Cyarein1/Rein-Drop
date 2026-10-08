/**
 * Microsoft Entra External ID auth against the REAL API + PostgreSQL: bearer access tokens signed
 * by a test key (standing in for the tenant's keys), verified by EntraAuthProvider, mapped to
 * Rein Drop users (created on first sign-in), and every protected route refusing anything else.
 * Run with `pnpm --filter api test:int`. Creates throwaway users, deletes them afterwards.
 */
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload, type KeyObject } from 'jose';
import { DEV_AUTH_HEADER, DEV_AUTH_SUBJECT, type AccountIdentity } from '@rein-drop/contracts';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { AppModule } from './../src/app.module.js';
import { AUTH_PROVIDER } from './../src/auth/auth.types.js';
import { EntraAuthProvider } from './../src/auth/entra-auth.provider.js';
import { loadApiConfig } from './../src/config/api-config.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const TENANT = randomUUID();
const API = randomUUID();
const ISSUER = `https://${TENANT}.ciamlogin.com/${TENANT}/v2.0`;
const OID = randomUUID();
const EMAIL = `int-test-entra-${OID.slice(0, 8)}@reindrop.test`;
const TAKEN_SUBJECT = `int-test-${randomUUID().slice(0, 8)}`;
const TAKEN_EMAIL = `${TAKEN_SUBJECT}@reindrop.test`;

describe('Entra External ID auth (integration, real database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let key: KeyObject;
  const oids: string[] = [OID];

  const token = (claims: JWTPayload = {}, expiresIn: string | number = '1h') =>
    new SignJWT({ tid: TENANT, oid: OID, scp: 'access_as_user', ver: '2.0', email: EMAIL, name: 'Entra Tester', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(ISSUER)
      .setAudience(API)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(key);
  const me = (headers: Record<string, string>) => {
    const req = request(app.getHttpServer()).get('/me');
    for (const [k, v] of Object.entries(headers)) req.set(k, v);
    return req;
  };

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    await prisma.user.create({ data: { email: TAKEN_EMAIL, authProvider: 'dev', authSubject: TAKEN_SUBJECT } });
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey as KeyObject;
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256' }] });
    const config = loadApiConfig({ NODE_ENV: 'test', DATABASE_URL, AUTH_PROVIDER: 'entra', ENTRA_AUTHORITY: 'https://reindrop.ciamlogin.com', ENTRA_TENANT_ID: TENANT, ENTRA_API_CLIENT_ID: API });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
      .overrideProvider(AUTH_PROVIDER)
      .useValue(new EntraAuthProvider(prisma, config.entra!, { issuer: ISSUER, keys }))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await prisma.user.deleteMany({ where: { OR: [{ authProvider: 'entra', authSubject: { in: oids } }, { authSubject: TAKEN_SUBJECT }] } });
      await prisma.$disconnect();
    }
  });

  it('first sign-in creates the Rein Drop user; later requests map to the same user', async () => {
    const first = (await me({ authorization: `Bearer ${await token()}` }).expect(200)).body as AccountIdentity;
    expect(first).toMatchObject({ email: EMAIL, displayName: 'Entra Tester' });
    const second = (await me({ authorization: `Bearer ${await token({ name: 'Renamed' })}` }).expect(200)).body as AccountIdentity;
    expect(second.userId).toBe(first.userId);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: first.userId } })).toMatchObject({ authProvider: 'entra', authSubject: OID, email: EMAIL });
  });

  it('protected routes refuse a missing, expired, foreign or under-scoped token - and the development header', async () => {
    await me({}).expect(401);
    await me({ [DEV_AUTH_HEADER]: DEV_AUTH_SUBJECT }).expect(401);
    const expired = await me({ authorization: `Bearer ${await token({}, Math.floor(Date.now() / 1000) - 600)}` }).expect(401);
    expect((expired.body as { message: string }).message).toBe('Your session has expired - sign in again');
    await me({ authorization: `Bearer ${await token({ tid: randomUUID() })}` }).expect(401);
    await me({ authorization: `Bearer ${await token({ scp: 'openid' })}` }).expect(403);
    await request(app.getHttpServer()).get('/hunts').expect(401);
  });

  it('never takes over an existing account by email', async () => {
    const intruder = randomUUID();
    oids.push(intruder);
    const res = await me({ authorization: `Bearer ${await token({ oid: intruder, email: TAKEN_EMAIL })}` }).expect(403);
    expect((res.body as { message: string }).message).toBe('An account with this email already exists under another sign-in method');
    expect(await prisma.user.count({ where: { email: TAKEN_EMAIL } })).toBe(1);
  });

  it('public routes stay public', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
