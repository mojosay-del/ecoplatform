import { Suspense } from "react";
import { MyListingsView } from "../../../src/views/marketplace";

export default function MyListingsPage() {
  return (
    <Suspense fallback={null}>
      <MyListingsView />
    </Suspense>
  );
}
