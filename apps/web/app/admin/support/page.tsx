import { Suspense } from "react";
import { AdminSupportView } from "../../../src/views/admin/support";

export default function AdminSupportPage() {
  return (
    <Suspense fallback={null}>
      <AdminSupportView />
    </Suspense>
  );
}
