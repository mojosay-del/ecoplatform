import type { RouteConfig, ZodRequestBody } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  accountContactChangeApplyDtoSchema,
  accountContactChangeStartDtoSchema,
  accountContactChangeVerifyDtoSchema,
  accountProfileUpdateDtoSchema,
  changePasswordDtoSchema,
  companyProfileUpdateDtoSchema,
  consentSubmitDtoSchema,
  createListingDtoSchema,
  createOfferDtoSchema,
  createReviewDtoSchema,
  dealDecisionDtoSchema,
  legalDocumentCreateDtoSchema,
  loginDtoSchema,
  manualSubscriptionDtoSchema,
  registerDtoSchema,
  registrationResendDtoSchema,
  registrationVerifyDtoSchema,
  reviewResponseDtoSchema,
  selfSubscriptionDtoSchema,
  supportTicketDtoSchema,
  tripCalculatorSettingsSchema,
  updateListingDtoSchema,
} from "@ecoplatform/shared";
import { setAvatarSchema } from "../account/account.controller";
import { broadcastRecipientsQuerySchema, broadcastSendInputSchema } from "../admin/broadcast/admin-broadcast.schemas";
import { adminCompanyListQuerySchema, adminCompanyStatusInputSchema } from "../admin/companies/admin-companies.schemas";
import { adminJournalsQuerySchema } from "../admin/journals/admin-journals.schemas";
import { platformSettingUpdateBodySchema } from "../admin/settings/platform-settings.definitions";
import {
  adminStaffCreateInputSchema,
  adminStaffListQuerySchema,
  adminStaffUpdateInputSchema,
} from "../admin/staff/admin-staff.schemas";
import {
  adminUserBlockInputSchema,
  adminUserListQuerySchema,
  adminUserPlatformRolesInputSchema,
  adminUserUnblockInputSchema,
} from "../admin/users/admin-users.schemas";
import { adminBillingCompaniesQuerySchema } from "../billing/billing.schemas";
import {
  adminContentListQuerySchema,
  adminNewsListQuerySchema,
  chapterInputSchema,
  chapterUpdateInputSchema,
  commentInputSchema,
  documentationArticleInputSchema,
  documentationMoveInputSchema,
  documentationRecentQuerySchema,
  documentationTreeQuerySchema,
  knowledgeArticleInputSchema,
  knowledgeMoveInputSchema,
  knowledgeTreeQuerySchema,
  learningModuleInputSchema,
  learningModuleUpdateInputSchema,
  lessonInputSchema,
  lessonUpdateInputSchema,
  newsInputSchema,
  newsListQuerySchema,
  newsTagsQuerySchema,
  nomenclatureInputSchema,
  nomenclatureMoveInputSchema,
  nomenclatureUpdateInputSchema,
  optionalReasonBodySchema,
  priceIndexInputSchema,
  priceIndexValueInputSchema,
  publicContentListQuerySchema,
} from "../content/content.schemas";
import { fileUploadSchema } from "../files/files.controller";
import {
  forumAcceptInputSchema,
  forumAdminListQuerySchema,
  forumAnswerInputSchema,
  forumListQuerySchema,
  forumQuestionInputSchema,
  forumQuestionUpdateSchema,
  forumTaxonomyInputSchema,
  forumTaxonomyUpdateSchema,
} from "../forum/forum.schemas";
import { addressSuggestQuerySchema } from "../marketplace/marketplace.controller";
import { marketplaceListQuerySchema } from "../marketplace/marketplace.schemas";
import {
  adminSanctionInputSchema,
  complaintInputSchema,
  moderationCaseListQuerySchema,
  moderationDecisionInputSchema,
  sanctionLiftInputSchema,
} from "../moderation/moderation.schemas";
import { notificationListQuerySchema, notificationPreferencesSchema } from "../notifications/notifications.controller";
import { seoPageQuerySchema } from "../seo/seo.schemas";
import { supportListQuerySchema, supportReplySchema } from "../support/support.controller";

const successResponse = { description: "Успешный ответ." };
const registerOpenApiSchema = registerDtoSchema.omit({ billingInn: true });

const booleanQuerySchema = z.enum(["1", "true"]).optional();
const idsQuerySchema = z.object({ ids: z.string().trim().optional() });
const legalDocumentsQuerySchema = z.object({ types: z.string().trim().optional() });
const previewQuerySchema = z.object({ preview: booleanQuerySchema });
const searchQuerySchema = z.object({ q: z.string().trim().optional() });

function apiPath(path: string) {
  return `/api/${path}`.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function jsonBody(schema: z.ZodType, required = true): ZodRequestBody {
  return {
    required,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function multipartUploadBody(): ZodRequestBody {
  return {
    required: true,
    content: {
      "multipart/form-data": {
        schema: fileUploadSchema.extend({
          file: z.string().meta({ format: "binary", description: "Файл для загрузки." }),
        }),
      },
    },
  };
}

function route(
  method: RouteConfig["method"],
  path: string,
  request?: {
    body?: z.ZodType;
    bodyRequired?: boolean;
    query?: z.ZodType;
    requestBody?: ZodRequestBody;
  },
): RouteConfig {
  return {
    method,
    path: apiPath(path),
    request: {
      ...(request?.query ? { query: request.query as NonNullable<RouteConfig["request"]>["query"] } : {}),
      ...(request?.body ? { body: jsonBody(request.body, request.bodyRequired ?? true) } : {}),
      ...(request?.requestBody ? { body: request.requestBody } : {}),
    },
    responses: {
      200: successResponse,
    },
  };
}

export const openApiRouteSchemas: RouteConfig[] = [
  route("get", "auth/csrf"),
  route("get", "auth/registration"),
  route("post", "auth/register", { body: registerOpenApiSchema }),
  route("post", "auth/register/resend", { body: registrationResendDtoSchema }),
  route("post", "auth/register/verify", { body: registrationVerifyDtoSchema }),
  route("post", "auth/login", { body: loginDtoSchema }),
  route("post", "auth/refresh"),
  route("post", "auth/logout"),
  route("get", "auth/sessions"),
  route("post", "auth/sessions/:id/revoke"),
  route("post", "auth/sessions/logout-all"),
  route("get", "auth/me"),
  route("post", "auth/change-password", { body: changePasswordDtoSchema }),
  route("post", "auth/me/export-data"),
  route("post", "auth/me/request-deletion"),
  route("post", "auth/me/cancel-deletion"),

  route("patch", "account/profile", { body: accountProfileUpdateDtoSchema }),
  route("post", "account/contact-change/start", { body: accountContactChangeStartDtoSchema }),
  route("post", "account/contact-change/verify", { body: accountContactChangeVerifyDtoSchema }),
  route("post", "account/contact-change/apply", { body: accountContactChangeApplyDtoSchema }),
  route("post", "account/contact-change/confirm", { body: accountContactChangeVerifyDtoSchema }),
  route("post", "account/avatar", { body: setAvatarSchema }),
  route("delete", "account/avatar"),

  route("get", "billing/status"),
  route("patch", "billing/company", { body: companyProfileUpdateDtoSchema }),
  route("post", "billing/subscriptions", { body: selfSubscriptionDtoSchema }),
  route("post", "billing/trial"),
  route("get", "admin/billing/companies", { query: adminBillingCompaniesQuerySchema }),
  route("post", "admin/billing/manual-subscriptions", { body: manualSubscriptionDtoSchema }),

  route("get", "legal/documents", { query: legalDocumentsQuerySchema }),
  route("get", "legal/documents/:type/:version"),
  route("post", "legal/consents", { body: consentSubmitDtoSchema }),
  route("get", "legal/me/consents"),
  route("get", "admin/legal/documents"),
  route("post", "admin/legal/documents", { body: legalDocumentCreateDtoSchema }),
  route("post", "admin/legal/documents/:id/publish"),

  route("get", "files", { query: idsQuerySchema }),
  route("post", "files/upload", { requestBody: multipartUploadBody() }),
  route("delete", "files/:id"),

  route("get", "support/tickets", { query: supportListQuerySchema }),
  route("post", "support/tickets", { body: supportTicketDtoSchema }),
  route("post", "support/tickets/:id/replies", { body: supportReplySchema }),
  route("get", "admin/support/tickets", { query: supportListQuerySchema }),
  route("post", "admin/support/tickets/:id/replies", { body: supportReplySchema }),

  route("post", "moderation/complaints", { body: complaintInputSchema }),
  route("get", "admin/moderation/cases", { query: moderationCaseListQuerySchema }),
  route("post", "admin/moderation/cases/:id/decisions", { body: moderationDecisionInputSchema }),
  route("post", "admin/moderation/cases/:id/admin-sanctions", { body: adminSanctionInputSchema }),
  route("post", "admin/moderation/sanctions/:id/lift", { body: sanctionLiftInputSchema }),

  route("get", "news", { query: newsListQuerySchema }),
  route("get", "news/tags", { query: newsTagsQuerySchema }),
  route("get", "news/:slug", { query: previewQuerySchema }),
  route("post", "news/:id/comments", { body: commentInputSchema }),
  route("get", "admin/content/news", { query: adminNewsListQuerySchema }),
  route("post", "admin/content/news", { body: newsInputSchema }),
  route("patch", "admin/content/news/:id", { body: newsInputSchema }),
  route("post", "admin/content/news/:id/unpublish", { body: optionalReasonBodySchema, bodyRequired: false }),
  route("delete", "admin/content/news/:id", { body: optionalReasonBodySchema, bodyRequired: false }),

  route("get", "indices", { query: publicContentListQuerySchema }),
  route("get", "admin/content/indices", { query: adminContentListQuerySchema }),
  route("post", "admin/content/indices/nomenclature", { body: nomenclatureInputSchema }),
  route("patch", "admin/content/indices/nomenclature/:id/move", { body: nomenclatureMoveInputSchema }),
  route("patch", "admin/content/indices/nomenclature/:id", { body: nomenclatureUpdateInputSchema }),
  route("delete", "admin/content/indices/nomenclature/:id", { body: optionalReasonBodySchema, bodyRequired: false }),
  route("post", "admin/content/indices", { body: priceIndexInputSchema }),
  route("post", "admin/content/indices/:id/values", { body: priceIndexValueInputSchema }),
  route("post", "admin/content/indices/:id/unpublish", { body: optionalReasonBodySchema, bodyRequired: false }),
  route("delete", "admin/content/indices/:id", { body: optionalReasonBodySchema, bodyRequired: false }),

  route("get", "documentation", { query: documentationTreeQuerySchema }),
  route("get", "documentation/recent", { query: documentationRecentQuerySchema }),
  route("get", "documentation/search", { query: searchQuerySchema }),
  route("get", "admin/content/documentation", { query: adminContentListQuerySchema }),
  route("post", "admin/content/documentation", { body: documentationArticleInputSchema }),
  route("patch", "admin/content/documentation/:id", { body: documentationArticleInputSchema }),
  route("post", "admin/content/documentation/:id/unpublish", { body: optionalReasonBodySchema, bodyRequired: false }),
  route("patch", "admin/content/documentation/:id/move", { body: documentationMoveInputSchema }),
  route("delete", "admin/content/documentation/:id", { body: optionalReasonBodySchema, bodyRequired: false }),

  route("get", "knowledge-base", { query: knowledgeTreeQuerySchema }),
  route("get", "knowledge-base/search", { query: searchQuerySchema }),
  route("get", "admin/content/knowledge-base", { query: adminContentListQuerySchema }),
  route("post", "admin/content/knowledge-base", { body: knowledgeArticleInputSchema }),
  route("patch", "admin/content/knowledge-base/:id", { body: knowledgeArticleInputSchema }),
  route("post", "admin/content/knowledge-base/:id/unpublish", { body: optionalReasonBodySchema, bodyRequired: false }),
  route("patch", "admin/content/knowledge-base/:id/move", { body: knowledgeMoveInputSchema }),
  route("delete", "admin/content/knowledge-base/:id", { body: optionalReasonBodySchema, bodyRequired: false }),

  route("get", "education/modules", { query: publicContentListQuerySchema }),
  route("get", "education/modules/:id", { query: previewQuerySchema }),
  route("get", "admin/content/education", { query: adminContentListQuerySchema }),
  route("post", "admin/content/education/modules", { body: learningModuleInputSchema }),
  route("patch", "admin/content/education/modules/:id", { body: learningModuleUpdateInputSchema }),
  route("post", "admin/content/education/modules/:id/unpublish", {
    body: optionalReasonBodySchema,
    bodyRequired: false,
  }),
  route("delete", "admin/content/education/modules/:id", { body: optionalReasonBodySchema, bodyRequired: false }),
  route("post", "admin/content/education/modules/:moduleId/chapters", { body: chapterInputSchema }),
  route("patch", "admin/content/education/chapters/:id", { body: chapterUpdateInputSchema }),
  route("delete", "admin/content/education/chapters/:id", { body: optionalReasonBodySchema, bodyRequired: false }),
  route("post", "admin/content/education/chapters/:chapterId/lessons", { body: lessonInputSchema }),
  route("patch", "admin/content/education/lessons/:id", { body: lessonUpdateInputSchema }),
  route("delete", "admin/content/education/lessons/:id", { body: optionalReasonBodySchema, bodyRequired: false }),
  route("post", "admin/content/education/lessons/:id/unpublish", {
    body: optionalReasonBodySchema,
    bodyRequired: false,
  }),

  route("post", "admin/broadcast/recipients-count", { body: broadcastRecipientsQuerySchema }),
  route("post", "admin/broadcast", { body: broadcastSendInputSchema }),
  route("get", "admin/companies", { query: adminCompanyListQuerySchema }),
  route("post", "admin/companies/:id/status", { body: adminCompanyStatusInputSchema }),
  route("get", "admin/staff", { query: adminStaffListQuerySchema }),
  route("post", "admin/staff", { body: adminStaffCreateInputSchema }),
  route("patch", "admin/staff/:id", { body: adminStaffUpdateInputSchema }),
  route("get", "admin/users", { query: adminUserListQuerySchema }),
  route("post", "admin/users/:id/block", { body: adminUserBlockInputSchema }),
  route("post", "admin/users/:id/unblock", { body: adminUserUnblockInputSchema, bodyRequired: false }),
  route("patch", "admin/users/:id/platform-roles", { body: adminUserPlatformRolesInputSchema }),
  route("patch", "admin/settings/:key", { body: platformSettingUpdateBodySchema }),
  route("get", "admin/journals", { query: adminJournalsQuerySchema }),

  route("get", "marketplace/listings", { query: marketplaceListQuerySchema }),
  route("get", "marketplace/my/listings", { query: marketplaceListQuerySchema }),
  route("get", "marketplace/address-suggest", { query: addressSuggestQuerySchema }),
  route("post", "marketplace/listings", { body: createListingDtoSchema }),
  route("patch", "marketplace/listings/:id", { body: updateListingDtoSchema }),
  route("get", "marketplace/my/offers", { query: marketplaceListQuerySchema }),
  route("post", "marketplace/listings/:id/offers", { body: createOfferDtoSchema }),
  route("patch", "marketplace/offers/:id", { body: createOfferDtoSchema }),
  route("post", "marketplace/offers/:id/deal", { body: dealDecisionDtoSchema }),
  route("post", "marketplace/offers/:id/reviews", { body: createReviewDtoSchema }),
  route("post", "marketplace/reviews/:id/response", { body: reviewResponseDtoSchema }),

  route("get", "forum", { query: forumListQuerySchema }),
  route("post", "forum/q", { body: forumQuestionInputSchema }),
  route("patch", "forum/q/:id", { body: forumQuestionUpdateSchema }),
  route("post", "forum/q/:id/answers", { body: forumAnswerInputSchema }),
  route("post", "forum/q/:id/accept", { body: forumAcceptInputSchema }),
  route("patch", "forum/answers/:id", { body: forumAnswerInputSchema }),
  route("post", "forum/answers/:id/replies", { body: forumAnswerInputSchema }),
  route("get", "admin/content/forum/questions", { query: forumAdminListQuerySchema }),
  route("post", "admin/content/forum/raw-materials", { body: forumTaxonomyInputSchema }),
  route("patch", "admin/content/forum/raw-materials/:id", { body: forumTaxonomyUpdateSchema }),
  route("post", "admin/content/forum/question-types", { body: forumTaxonomyInputSchema }),
  route("patch", "admin/content/forum/question-types/:id", { body: forumTaxonomyUpdateSchema }),
  route("post", "admin/content/forum/questions", { body: forumQuestionInputSchema }),
  route("post", "admin/content/forum/questions/:id/answers", { body: forumAnswerInputSchema }),

  route("get", "notifications", { query: notificationListQuerySchema }),
  route("patch", "notifications/preferences", { body: notificationPreferencesSchema }),
  route("patch", "trip-calculator/settings", { body: tripCalculatorSettingsSchema }),
  route("get", "seo/pages", { query: seoPageQuerySchema }),
];
