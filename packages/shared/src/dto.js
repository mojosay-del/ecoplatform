"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportTicketDtoSchema = exports.manualSubscriptionDtoSchema = exports.loginDtoSchema = exports.registerDtoSchema = void 0;
const zod_1 = require("zod");
exports.registerDtoSchema = zod_1.z.object({
    organizationName: zod_1.z.string().min(2),
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    phone: zod_1.z.string().min(10),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8).regex(/[A-Za-zА-Яа-яЁё]/).regex(/[0-9]/),
});
exports.loginDtoSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
    rememberMe: zod_1.z.boolean().optional(),
});
exports.manualSubscriptionDtoSchema = zod_1.z.object({
    companyId: zod_1.z.string().min(1),
    plan: zod_1.z.enum(["basic", "extended"]),
    endsAt: zod_1.z.string().datetime(),
    reason: zod_1.z.string().min(3),
});
exports.supportTicketDtoSchema = zod_1.z.object({
    category: zod_1.z.enum(["billing", "moderation_review", "company_management", "technical", "data_deletion", "other"]),
    subject: zod_1.z.string().min(3),
    text: zod_1.z.string().min(3),
});
