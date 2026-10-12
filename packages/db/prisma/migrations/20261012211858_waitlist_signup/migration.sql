-- Landing 18: early-access waitlist sign-ups from the public landing page.
-- Additive only (one new table, two indexes, two CHECK constraints); no existing table is touched.
-- No public endpoint lists these rows (see WaitlistSignup in schema.prisma).

-- CreateTable
CREATE TABLE "WaitlistSignup" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "source" TEXT NOT NULL,
    "requestedMarketplaces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestedMarketplaceOther" VARCHAR(60),
    "consentVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistSignup_pkey" PRIMARY KEY ("id"),
    -- Only the normalized form is stored (normalizeWaitlistEmail: trimmed + lower-cased), so the
    -- unique index below really means "one sign-up per address".
    CONSTRAINT "WaitlistSignup_email_normalized" CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
    -- Dated consent version, e.g. 2026-10-12 (WAITLIST_CONSENT_VERSION_PATTERN).
    CONSTRAINT "WaitlistSignup_consentVersion_format" CHECK ("consentVersion" ~ '^\d{4}-\d{2}-\d{2}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistSignup_email_key" ON "WaitlistSignup"("email");

-- CreateIndex
CREATE INDEX "WaitlistSignup_createdAt_idx" ON "WaitlistSignup"("createdAt");