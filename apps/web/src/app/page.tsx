import { Suspense } from "react";
import { ApiStatus } from "./api-status";

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 16px" }}>
      <h1 style={{ margin: 0, fontSize: 40 }}>Rein Drop</h1>
      <p>Local development scaffold</p>
      <Suspense fallback={<p>Checking API…</p>}>
        <ApiStatus />
      </Suspense>
    </main>
  );
}
