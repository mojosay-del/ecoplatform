export type StatusPillVariant = "success" | "warning" | "danger" | "neutral" | "brand";

export function companyStatusPillVariant(status: string | null | undefined): StatusPillVariant {
  switch (status) {
    case "active":
      return "success";
    case "demo":
    case "pending_deletion":
      return "warning";
    case "past_due":
    case "suspended":
    case "blocked":
      return "danger";
    default:
      return "neutral";
  }
}

export function subscriptionStatusPillVariant(status: string | null | undefined): StatusPillVariant {
  switch (status) {
    case "active":
      return "success";
    case "past_due":
    case "suspended":
    case "expired":
      return "danger";
    default:
      return "neutral";
  }
}

export function supportStatusPillVariant(status: string | null | undefined): StatusPillVariant {
  switch (status) {
    case "resolved":
      return "success";
    case "open":
    case "awaiting_user":
      return "warning";
    case "in_progress":
      return "brand";
    default:
      return "neutral";
  }
}

export function userStatusPillVariant(status: string | null | undefined): StatusPillVariant {
  return status === "active" ? "success" : status === "blocked" ? "danger" : "neutral";
}

export function moderationStatusPillVariant(status: string | null | undefined): StatusPillVariant {
  switch (status) {
    case "resolved":
      return "success";
    case "in_review":
      return "brand";
    case "open":
    case "escalated":
      return "warning";
    default:
      return "neutral";
  }
}
