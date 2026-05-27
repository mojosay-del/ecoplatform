"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isCmsTabActive, visibleCmsTabs } from "./admin-panel-tabs";
import { useAuth } from "../lib/auth";

export function CmsTabs() {
  const pathname = usePathname();
  const router = useRouter();
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

  if (!pathname.startsWith("/admin/content")) return null;

  const tabs = visibleCmsTabs(user?.platformRoles ?? []);
  if (tabs.length === 0) return null;

  const activeTab = tabs.find((tab) => isCmsTabActive(tab, pathname, hash)) ?? tabs[0]!;

  return (
    <>
      <nav className="cms-tabs" aria-label="Разделы CMS">
        {tabs.map((tab) => {
          const active = isCmsTabActive(tab, pathname, hash);
          return (
            <Link className={`cms-tab ${active ? "active" : ""}`} href={tab.href} key={tab.href}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <label className="cms-tabs-mobile">
        <span className="cms-tabs-mobile-label">Раздел:</span>
        <select
          aria-label="Раздел CMS"
          className="select cms-tabs-mobile-select"
          onChange={(event) => router.push(event.target.value)}
          value={activeTab.href}
        >
          {tabs.map((tab) => (
            <option key={tab.href} value={tab.href}>
              {tab.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
