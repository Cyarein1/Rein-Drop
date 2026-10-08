import { entraDiscoveryUrl } from '@rein-drop/contracts';

/**
 * LIVE check against your Microsoft Entra External ID tenant (free, no sign-in): the OpenID
 * configuration the API verifies tokens with has the expected issuer and RS256 signing keys.
 * Skipped unless ENTRA_AUTHORITY and ENTRA_TENANT_ID are set in the environment.
 */
const authority = process.env.ENTRA_AUTHORITY;
const tenantId = process.env.ENTRA_TENANT_ID?.toLowerCase();

describe.skipIf(!authority || !tenantId)('Entra External ID tenant (LIVE - needs ENTRA_AUTHORITY + ENTRA_TENANT_ID)', () => {
  it('publishes the issuer and signing keys the API expects', async () => {
    const doc = (await (await fetch(entraDiscoveryUrl(authority!, tenantId!))).json()) as { issuer: string; jwks_uri: string; end_session_endpoint?: string };
    expect(doc.issuer).toBe(`https://${tenantId}.ciamlogin.com/${tenantId}/v2.0`);
    expect(doc.end_session_endpoint).toBeTruthy();
    const keys = (await (await fetch(doc.jwks_uri)).json()) as { keys: { kty: string; kid: string }[] };
    expect(keys.keys.length).toBeGreaterThan(0);
    expect(keys.keys.every((k) => k.kty === 'RSA' && k.kid)).toBe(true);
  }, 30_000);
});
