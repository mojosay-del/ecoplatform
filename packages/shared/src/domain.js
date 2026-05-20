"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportTicketCategories = exports.supportTicketStatuses = exports.learningAccessLevels = exports.contentStatuses = exports.platformRoles = exports.subscriptionPlans = exports.companyStatuses = void 0;
exports.companyStatuses = [
    "demo",
    "active",
    "past_due",
    "suspended",
    "blocked",
    "archived",
];
exports.subscriptionPlans = ["basic", "extended"];
exports.platformRoles = ["admin", "moderator", "content_manager"];
exports.contentStatuses = ["draft", "published"];
exports.learningAccessLevels = ["basic", "extended", "one_time"];
exports.supportTicketStatuses = [
    "new",
    "in_progress",
    "awaiting_user",
    "resolved",
    "closed",
];
exports.supportTicketCategories = [
    "billing",
    "moderation_review",
    "company_management",
    "technical",
    "data_deletion",
    "other",
];
