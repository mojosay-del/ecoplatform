import { Suspense } from "react";
import { SubscriptionView } from "../../src/views/subscription-view";

export default function SubscriptionPage() {
  return (
    <Suspense fallback={null}>
      <SubscriptionView />
    </Suspense>
  );
}
