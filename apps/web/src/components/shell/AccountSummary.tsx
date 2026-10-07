import { verifySession } from "@/auth";
import { Badge } from "@/components/ui";
import styles from "./AppShell.module.css";

/** Top-bar account area. Reads the session, so it renders behind a Suspense boundary. */
export async function AccountSummary() {
  const session = await verifySession();
  const { email, displayName } = session.user;
  const name = displayName ?? email;
  return (
    <>
      {session.isDevelopment && <Badge tone="info">Development sign-in</Badge>}
      <span className={styles.avatar} aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
      <span className={styles.accountEmail}>{email}</span>
    </>
  );
}
