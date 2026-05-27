"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isAdminPanelTabActive, visibleAdminPanelTabs } from "./admin-panel-tabs";
import { useAuth } from "../lib/auth";

export function CmsTabs() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [hash, setHash] = useState("");

  useEffect(() => {
    function syncHash() {
      setHash(window.location.hash.replace("#", ""));
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const tabs = visibleAdminPanelTabs(user?.platformRoles ?? []);

  return (
    <nav className="cms-tabs" aria-label="Разделы панели управления">
      {tabs.map((tab) => {
        const active = isAdminPanelTabActive(tab, pathname, hash);
        return (
          <Link className={`cms-tab ${active ? "active" : ""}`} href={tab.href} key={tab.href}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
