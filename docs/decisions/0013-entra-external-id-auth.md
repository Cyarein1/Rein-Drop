# 0013 - Managed auth: Microsoft Entra External ID

Status: accepted (step 41, Build Prompt 38) - resolves D1

## Evaluation

Requirement: a managed provider behind the existing auth boundary, email + password, mapped to the
Rein Drop `User`, Azure-aligned if cost and developer experience are acceptable.

| Option | Azure-aligned | Cost | Email + password | Fit |
|---|---|---|---|---|
| **Microsoft Entra External ID** (external tenant) | Yes - Microsoft's current customer identity (CIAM) product | First 50,000 monthly active users free, then per-MAU | Built in: sign-up with email verification, sign-in, self-service password reset | Standard OIDC / OAuth 2.0 + JWT access tokens: verified with `jose`, web flow with `openid-client`, mobile with `expo-auth-session` |
| Azure AD B2C | Yes | - | Yes | Not available to new customers since 1 May 2025 (Microsoft) - ruled out |
| Third-party (Auth0, Clerk, Firebase Auth, Supabase Auth) | No | Free tiers vary | Yes | Workable, but not Azure-aligned; no advantage for this stack |

**Chosen: Entra External ID.** Cost and DX are acceptable: free at launch scale, plain standards
(no vendor SDK needed in the API), and the tenant's hosted pages handle passwords, verification and
reset - Rein Drop never sees or stores a password.

Hosted page vs in-app forms: sign-in uses the tenant's **hosted, brandable page** (authorization
code + PKCE). Entra's "native authentication" API would allow in-app email/password forms, but it is
a multi-step custom protocol without CORS support; it stays an option (OUTSTANDING) if the product
wants fully in-app screens.

## Decision

**API** (`EntraAuthProvider`): every protected route requires `Authorization: Bearer <access token>`.
The token must be RS256-signed by a key from the tenant's `jwks_uri` (from its OpenID configuration,
cached, re-fetched on rollover), with `iss` = the tenant issuer
(`https://<tenant-id>.ciamlogin.com/<tenant-id>/v2.0`), `aud` = the API's client ID, valid
`exp` / `nbf` (60 s skew), `tid` = the tenant, and `scp` containing the API scope (`access_as_user`).
Expired -> 401 "Your session has expired"; wrong scope -> 403; keys / database unreachable -> 503.

**Identity mapping**: `oid` (immutable, the same for every app in the tenant - `sub` is per app) is
`User.authSubject` with `authProvider = "entra"`. The first request creates the user from the
`email` (lower-cased) and `name` claims. An email already used by another user is refused (403):
accounts are never linked by email. `email` is not in access tokens by default - the API app
registration must emit it as an optional claim.

**Web**: confidential client, authorization code + PKCE + state + nonce (`/auth/sign-in` ->
hosted page -> `/auth/callback`). The ID token is validated (issuer, audience, nonce, expiry) by
`openid-client`; discovery is fetched directly because Entra's issuer host (tenant ID) differs from
the discovery host (tenant subdomain). Session = encrypted httpOnly cookies (JWE dir/A256GCM from
`AUTH_SESSION_SECRET`; `SameSite=Lax`; `Secure` on https): access token + absolute expiry, and the
refresh token in a second cookie. Tokens never reach browser JavaScript. The Proxy refreshes an
access token within 5 minutes of expiry and ends the session at its absolute end
(`AUTH_SESSION_MAX_AGE_HOURS`, default 168 - D34) or when a refresh is refused. Sign out (POST)
deletes the cookies and redirects to Entra's end-session endpoint.

**Mobile**: public client, authorization code + PKCE in the system browser (`expo-auth-session`),
redirect `reindrop://auth`; tokens in the device keychain / keystore (`expo-secure-store`); the
same refresh / absolute-expiry rules (shared `@rein-drop/client-core` token-session); Sign out
clears the device and ends the Entra browser session.

**Development auth can't be enabled in production**: the API config refuses `AUTH_PROVIDER=dev`
with `NODE_ENV=production`, the auth module and `DevAuthProvider` refuse again; the web dev provider
is `undefined` in production builds (verified: no dev-auth identifiers in `.next/server` or
`.next/static`), and mobile release builds (`__DEV__` false) drop it the same way. Under `entra`,
the development header is simply not a credential.

## Tenant setup (checklist)

1. Create an **external tenant** (Entra admin center -> External Identities); note the tenant
   subdomain (`ENTRA_AUTHORITY = https://<subdomain>.ciamlogin.com`) and tenant ID.
2. User flow: **Email with password** sign-up / sign-in; collect Display Name.
3. App registration **Rein Drop API**: Expose an API -> Application ID URI `api://<api-client-id>`,
   scope `access_as_user`; manifest `requestedAccessTokenVersion: 2`; Token configuration ->
   optional claim **email** for **access** tokens. -> `ENTRA_API_CLIENT_ID`.
4. App registration **Rein Drop Web**: Web platform, redirect `<APP_BASE_URL>/auth/callback`,
   front-channel logout / post-logout `<APP_BASE_URL>/sign-in?signed_out=1`; client secret ->
   `ENTRA_WEB_CLIENT_SECRET`; API permission `access_as_user` (grant admin consent). Add it to the
   user flow's applications.
5. App registration **Rein Drop Mobile**: Mobile and desktop platform, redirect `reindrop://auth`
   (development build) and `exp://<ip>:8081/--/auth` while using Expo Go; public client; API
   permission `access_as_user`. Add it to the user flow.
6. Set the environment variables (README table, `.env.example` files) and run the live check
   `pnpm --filter api test` with `ENTRA_AUTHORITY` / `ENTRA_TENANT_ID` set.

## Consequences

- Production can start: `AUTH_PROVIDER=entra` + the variables above.
- Hosted pages need branding (logo, colours) in the tenant - TBD with the brand assets.
- A user deleted or renamed in Entra keeps their Rein Drop row; account deletion / email change
  sync is not built.
