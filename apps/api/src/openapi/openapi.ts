import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import type {
  OperationObject,
  ParameterObject,
  ReferenceObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { OpenApiGeneratorV3, OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { openApiRouteSchemas } from "./openapi-route-schemas";

export const OPENAPI_DOCS_PATH = "docs";
export const OPENAPI_JSON_PATH = "openapi.json";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "options", "head", "trace"] as const;
const MUTATING_METHODS = new Set<string>(["post", "put", "patch", "delete"]);
const CSRF_EXEMPT_OPERATIONS = new Set(["post /api/auth/login", "post /api/auth/register"]);
const PUBLIC_OPERATIONS = new Set([
  "get /api/auth/csrf",
  "get /api/auth/registration",
  "post /api/auth/register",
  "post /api/auth/register/resend",
  "post /api/auth/register/verify",
  "post /api/auth/login",
  "post /api/auth/refresh",
  "get /api/legal/documents",
  "get /api/legal/documents/{type}/{version}",
  "get /api/health",
  "get /api/health/deep",
  "get /api/ready",
  "get /api/seo/sitemap",
  "get /api/seo/pages",
  "get /api/metrics",
]);

type HttpMethod = (typeof HTTP_METHODS)[number];
type OperationEntry = {
  method: HttpMethod;
  path: string;
  operation: OperationObject;
};

export function isOpenApiEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.OPENAPI_ENABLED === "1" || env.NODE_ENV !== "production";
}

export function setupOpenApi(app: INestApplication) {
  if (!isOpenApiEnabled()) return;

  const config = new DocumentBuilder()
    .setTitle("Ecoplatform API")
    .setDescription("Машиночитаемый контракт API ЭкоПлатформы.")
    .setVersion("1.0.0")
    .addServer("/", "Текущий origin")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearerAuth")
    .build();

  const baseDocument = SwaggerModule.createDocument(app, config, {
    autoTagControllers: true,
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey.replace(/Controller$/, "")}_${methodKey}`,
  });
  const document = buildOpenApiDocument(baseDocument);

  SwaggerModule.setup(OPENAPI_DOCS_PATH, app, document, {
    useGlobalPrefix: true,
    raw: ["json"],
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    customSiteTitle: "Ecoplatform API Docs",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: "none",
      tagsSorter: "alpha",
      operationsSorter: "alpha",
    },
  });
}

export function buildOpenApiDocument(baseDocument: OpenAPIObject): OpenAPIObject {
  const zodDocument = buildZodOpenApiDocument();
  const document: OpenAPIObject = {
    ...baseDocument,
    components: mergeComponents(baseDocument.components, {
      ...zodDocument.components,
      ...commonComponents(),
    }),
  };

  applyRequestSchemas(document, zodDocument);
  applyOperationSecurity(document);
  return document;
}

export function buildZodOpenApiDocument(): Pick<OpenAPIObject, "components" | "paths"> {
  extendZodWithOpenApi(z);
  const registry = new OpenAPIRegistry();
  for (const route of openApiRouteSchemas) {
    registry.registerPath(route);
  }
  const generated = new OpenApiGeneratorV3(registry.definitions, { sortComponents: "alphabetically" }).generateDocument(
    {
      openapi: "3.0.0",
      info: { title: "Ecoplatform API request schemas", version: "1.0.0" },
    },
  );

  return {
    components: generated.components as OpenAPIObject["components"],
    paths: generated.paths as OpenAPIObject["paths"],
  };
}

function applyRequestSchemas(document: OpenAPIObject, zodDocument: Pick<OpenAPIObject, "paths">) {
  for (const { method, path, operation } of operationsOf(document)) {
    const zodOperation = zodDocument.paths[path]?.[method];
    if (!zodOperation) continue;

    if (zodOperation.requestBody) {
      operation.requestBody = zodOperation.requestBody;
    }

    if (zodOperation.parameters?.length) {
      operation.parameters = mergeParameters(operation.parameters, zodOperation.parameters);
    }
  }
}

function applyOperationSecurity(document: OpenAPIObject) {
  for (const { method, path, operation } of operationsOf(document)) {
    const operationKey = `${method} ${path}`;
    operation.responses = {
      ...operation.responses,
      default: operation.responses.default ?? { $ref: "#/components/responses/ApiError" },
    };

    if (!PUBLIC_OPERATIONS.has(operationKey)) {
      operation.security = operation.security ?? [{ bearerAuth: [] }];
    }

    if (MUTATING_METHODS.has(method) && !CSRF_EXEMPT_OPERATIONS.has(operationKey)) {
      operation.parameters = mergeParameters(operation.parameters, [
        { $ref: "#/components/parameters/CsrfTokenHeader" },
      ]);
    }
  }
}

function operationsOf(document: OpenAPIObject): OperationEntry[] {
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = pathItem[method];
      return operation ? [{ method, path, operation }] : [];
    }),
  );
}

function mergeParameters(
  current: OperationObject["parameters"] = [],
  incoming: NonNullable<OperationObject["parameters"]>,
): OperationObject["parameters"] {
  const merged = [...current];
  for (const parameter of incoming) {
    if (hasEquivalentParameter(merged, parameter)) continue;
    merged.push(parameter);
  }
  return merged;
}

function hasEquivalentParameter(
  parameters: NonNullable<OperationObject["parameters"]>,
  candidate: ParameterObject | ReferenceObject,
) {
  if ("$ref" in candidate) {
    return parameters.some((parameter) => "$ref" in parameter && parameter.$ref === candidate.$ref);
  }

  return parameters.some(
    (parameter) => !("$ref" in parameter) && parameter.name === candidate.name && parameter.in === candidate.in,
  );
}

function mergeComponents(
  base: OpenAPIObject["components"] = {},
  incoming: OpenAPIObject["components"] = {},
): OpenAPIObject["components"] {
  const keys: Array<keyof NonNullable<OpenAPIObject["components"]>> = [
    "schemas",
    "responses",
    "parameters",
    "examples",
    "requestBodies",
    "headers",
    "securitySchemes",
    "links",
    "callbacks",
  ];
  const merged: OpenAPIObject["components"] = { ...base };
  for (const key of keys) {
    merged[key] = {
      ...(base[key] ?? {}),
      ...(incoming[key] ?? {}),
    } as never;
  }
  return merged;
}

function commonComponents(): OpenAPIObject["components"] {
  return {
    schemas: {
      ApiErrorResponse: {
        type: "object",
        required: ["message", "error", "statusCode"],
        properties: {
          message: {
            oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          },
          error: { type: "string" },
          statusCode: { type: "integer" },
        },
      },
    },
    responses: {
      ApiError: {
        description: "Стандартная ошибка API.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiErrorResponse" },
          },
        },
      },
    },
    parameters: {
      CsrfTokenHeader: {
        name: "X-CSRF-Token",
        in: "header",
        required: true,
        description: "CSRF-токен из `/api/auth/csrf` для mutating-запросов.",
        schema: {
          type: "string",
          minLength: 43,
          maxLength: 43,
        },
      },
    },
  };
}
