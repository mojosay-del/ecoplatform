import { describe, expect, it } from "vitest";
import type { OpenAPIObject } from "@nestjs/swagger";
import type { OperationObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { buildOpenApiDocument, buildZodOpenApiDocument, isOpenApiEnabled } from "./openapi";

describe("openapi", () => {
  it("is disabled in production unless explicitly enabled", () => {
    expect(isOpenApiEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isOpenApiEnabled({ NODE_ENV: "production", OPENAPI_ENABLED: "1" })).toBe(true);
    expect(isOpenApiEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("generates request schemas from zod route definitions", () => {
    const zodDocument = buildZodOpenApiDocument();

    expect(zodDocument.paths["/api/auth/login"]?.post?.requestBody).toBeDefined();
    expect(zodDocument.paths["/api/billing/company"]?.patch?.requestBody).toBeDefined();
    expect(zodDocument.paths["/api/admin/billing/companies"]?.get?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "limit", in: "query" })]),
    );
  });

  it("patches scanned Nest routes with request schemas, auth, csrf and common errors", () => {
    const document = buildOpenApiDocument(fakeBaseDocument());
    const login = operation(document, "/api/auth/login", "post");
    const verify = operation(document, "/api/auth/register/verify", "post");
    const updateCompany = operation(document, "/api/billing/company", "patch");

    expect(login.requestBody).toBeDefined();
    expect(login.parameters ?? []).not.toContainEqual({ $ref: "#/components/parameters/CsrfTokenHeader" });
    expect(login.security).toBeUndefined();

    expect(verify.security).toBeUndefined();
    expect(verify.parameters).toContainEqual({ $ref: "#/components/parameters/CsrfTokenHeader" });

    expect(updateCompany.requestBody).toBeDefined();
    expect(updateCompany.security).toEqual([{ bearerAuth: [] }]);
    expect(updateCompany.parameters).toContainEqual({ $ref: "#/components/parameters/CsrfTokenHeader" });
    expect(updateCompany.responses.default).toEqual({ $ref: "#/components/responses/ApiError" });
    expect(document.components?.schemas?.ApiErrorResponse).toBeDefined();
  });
});

function fakeBaseDocument(): OpenAPIObject {
  return {
    openapi: "3.0.0",
    info: { title: "Test", version: "1.0.0" },
    paths: {
      "/api/auth/login": { post: { responses: { 200: { description: "ok" } } } },
      "/api/auth/register/verify": { post: { responses: { 200: { description: "ok" } } } },
      "/api/billing/company": { patch: { responses: { 200: { description: "ok" } } } },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  };
}

function operation(document: OpenAPIObject, path: string, method: "post" | "patch"): OperationObject {
  const result = document.paths[path]?.[method];
  if (!result) throw new Error(`Missing operation ${method.toUpperCase()} ${path}`);
  return result;
}
