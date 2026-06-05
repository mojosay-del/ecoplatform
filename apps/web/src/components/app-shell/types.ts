import type { BreadcrumbItem } from "../app-shell-nav";

export type AppShellChrome = {
  sidebar?: boolean;
  breadcrumbs?: boolean;
  breadcrumbTrail?: BreadcrumbItem[];
  notifications?: boolean;
  demoBanner?: boolean;
  adminBackLink?: boolean;
};
