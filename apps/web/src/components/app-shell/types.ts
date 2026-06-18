import type { ReactNode } from "react";
import type { BreadcrumbItem } from "../app-shell-nav";

export type AppShellChrome = {
  sidebar?: boolean;
  breadcrumbs?: boolean;
  breadcrumbTrail?: BreadcrumbItem[];
  mobileTopbarAction?: ReactNode;
  notifications?: boolean;
  demoBanner?: boolean;
  adminBackLink?: boolean;
};
