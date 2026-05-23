import { Suspense } from "react";
import { AdminSupportView } from "../../../src/components/AdminSupportView";

export default function AdminSupportPage() {
  return (
    <Suspense fallback={null}>
      <AdminSupportView />
    </Suspense>
  );
}
