import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readPeriod, withPeriod } from "@/components/charts";

/** Product results are selling insights now (decision 0021): Sell > Insights, same period. */
export default function ProductAnalyticsRedirect({ searchParams }: PageProps<"/analytics/products">) {
  // searchParams is request data: read it behind Suspense (Cache Components).
  return (
    <Suspense fallback={null}>
      <RedirectToInsights searchParams={searchParams} />
    </Suspense>
  );
}

async function RedirectToInsights({ searchParams }: { searchParams: PageProps<"/analytics/products">["searchParams"] }) {
  redirect(withPeriod("/sell/insights", readPeriod(await searchParams)));
  return null;
}
