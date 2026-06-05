import { ACCOUNT_SECTION_CHANGE_EVENT, type AccountSectionId } from "../../components/app-shell-nav";

export function accountSectionDomId(section: AccountSectionId) {
  return `account-section-${section}`;
}

export function dispatchActiveAccountSection(section: AccountSectionId) {
  window.dispatchEvent(new CustomEvent(ACCOUNT_SECTION_CHANGE_EVENT, { detail: { section } }));
}

export function scrollAccountSectionIntoView(section: AccountSectionId, behavior: ScrollBehavior = "smooth") {
  const target = document.getElementById(accountSectionDomId(section));
  if (!target) return;

  dispatchActiveAccountSection(section);
  const prefersReducedMotion =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : behavior, block: "start" });
}
