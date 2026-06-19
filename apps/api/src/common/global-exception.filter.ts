import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { redactLogString, redactLogValue, requestPath } from "./logging";
import { captureApiException } from "./sentry";

// Глобальный filter ловит ВСЁ, что вылетает из контроллеров/сервисов.
// Цель — гарантировать, что:
//   1) логи всегда содержат stack trace + URL + actor (когда есть);
//   2) клиент получает структурированный 500 без утечки stack'а;
//   3) HttpException-ы (404/403/400/...) проходят как раньше, но с записью в лог.
//
// Раньше неперехваченное исключение приходило к Nest-built-in handler'у,
// который писал бесполезный `[ExceptionsHandler] Internal server error` без
// контекста — debug-усложнение в проде.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HTTP");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: "Внутренняя ошибка сервера.", error: "InternalServerError", statusCode: 500 };

    // Серверные 5xx логируем как error (со stack), всё остальное (4xx) — warn,
    // чтобы шум 404/403 не забивал error-канал.
    const isServerError = status >= 500;
    const actorId = (request as Request & { user?: { id?: string } }).user?.id ?? "anonymous";
    const baseContext = `${request.method} ${requestPath(request)} [${actorId}] →${status}`;

    if (isServerError) {
      const stack = exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
      captureApiException(exception, request, status);
      this.logger.error(baseContext, redactLogString(stack));
    } else if (status >= 400) {
      this.logger.warn(`${baseContext} ${JSON.stringify(redactLogValue(payload))}`);
    }

    response.status(status).json(payload);
  }
}

// Process-level хендлеры. Без них процесс молча умирает на unhandledRejection
// в новом Node — Nest сам это не ловит.
export function registerProcessErrorHandlers() {
  const logger = new Logger("Process");
  process.on("unhandledRejection", (reason) => {
    captureApiException(reason);
    const message = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    logger.error(`unhandledRejection: ${redactLogString(message)}`);
  });
  process.on("uncaughtException", (error) => {
    captureApiException(error);
    logger.error(`uncaughtException: ${redactLogString(error.stack ?? error.message)}`);
  });
}
