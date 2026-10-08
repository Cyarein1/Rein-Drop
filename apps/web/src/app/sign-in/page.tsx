import type { Metadata } from "next";
import { Suspense } from "react";
import { safeNextPath } from "@/auth/entra/session";
import { getAuthSetup } from "@/auth/provider";
import { Wordmark } from "@/brand/Wordmark";
import { Button, ButtonLink, Card, LoadingState, Page, SystemBanner } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

/** Why the user landed here (query parameters set by the Proxy and the /auth routes). */
const NOTICES: Record<string, { tone: "info" | "warning" | "error"; title: string; message: string }> = {
  signed_out: { tone: "info", title: "You're signed out", message: "Sign in again whenever you're ready." },
  expired: { tone: "info", title: "Your session has ended", message: "For your security, please sign in again." },
  cancelled: { tone: "info", title: "Sign-in was cancelled", message: "You can try again below." },
  failed: { tone: "error", title: "We couldn't sign you in", message: "Something went wrong while signing in. Please try again." },
  unavailable: { tone: "error", title: "Sign-in is unavailable right now", message: "Rein Drop couldn't reach the sign-in service. Try again in a moment." },
};

/**
 * Sign in / create account (App Flow Blueprint 3.2: email + password). The credentials are entered
 * on Microsoft Entra External ID's hosted page; this page explains that and starts the flow.
 */
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main id="main-content">
      <Page width="narrow">
        <Wordmark height={48} priority />
        <Suspense fallback={<LoadingState />}>
          <SignInStatus searchParams={searchParams} />
        </Suspense>
      </Page>
    </main>
  );
}

async function SignInStatus({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const setup = getAuthSetup();

  if (!setup.ok) {
    return <SystemBanner tone="warning" title="Sign-in is not available" message={setup.reason} />;
  }

  if (setup.provider.id === "dev") {
    return (
      <Card title="Development sign-in">
        <p>
          In development you are signed in automatically as the seeded local user. If you were sent
          here, the API did not recognise that user.
        </p>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            Make sure the API is running: <code>pnpm --filter api dev</code>
          </li>
          <li>
            Create the development user: <code>pnpm db:seed</code>
          </li>
        </ol>
        <div>
          <ButtonLink href="/home">Try again</ButtonLink>
        </div>
      </Card>
    );
  }

  const notice = NOTICES[one("signed_out") ? "signed_out" : (one("error") ?? one("reason") ?? "")];
  const next = safeNextPath(one("next"));
  return (
    <>
      {notice && <SystemBanner tone={notice.tone} title={notice.title} message={notice.message} />}
      <Card title="Sign in to Rein Drop">
        <p>
          You&apos;ll continue on a secure Microsoft page to sign in with your email and password - or to
          create your account if you&apos;re new.
        </p>
        {/* A plain GET form: /auth/sign-in redirects to Microsoft, which must be a full navigation. */}
        <form action="/auth/sign-in" method="get" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <input type="hidden" name="next" value={next} />
          <Button type="submit">Sign in with email</Button>
          <Button type="submit" variant="secondary">
            Create an account
          </Button>
        </form>
      </Card>
    </>
  );
}
