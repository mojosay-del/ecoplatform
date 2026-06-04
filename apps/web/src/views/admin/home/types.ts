import type { AdminDashboardSummary } from "@ecoplatform/shared";

export type KpiKey = keyof AdminDashboardSummary["kpis"];
export type KpiTrendKey = keyof AdminDashboardSummary["kpiTrends"];
export type OperationKey = keyof AdminDashboardSummary["operations"];
export type HealthKey = keyof AdminDashboardSummary["systemHealth"];
export type KpiTone = "info" | "success" | "warning" | "danger" | "brand";
export type KpiPolarity = "up-good" | "up-bad";
export type AuditTone = "create" | "update" | "publish" | "security" | "danger" | "neutral";
