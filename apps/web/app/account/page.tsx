import { Suspense } from "react";
import { AccountView } from "../../src/views/account-view";

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountView />
    </Suspense>
  );
}
