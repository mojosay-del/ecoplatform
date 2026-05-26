import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { changePasswordDtoSchema, loginDtoSchema, registerDtoSchema } from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import type { RequestWithCsrf } from "../common/csrf.guard";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { AuthDataExportService } from "./auth-data-export.service";
import { AuthService } from "./auth.service";

// Жёсткое окно «10 запросов в минуту на IP» именно для login/register/refresh —
// чтобы перебор паролей и массовая регистрация ботов сразу натыкались на 429.
const AUTH_THROTTLE = { auth: { limit: 10, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly dataExport: AuthDataExportService,
  ) {}

  @Get("csrf")
  csrf(@Req() request: RequestWithCsrf) {
    return { csrfToken: request.csrfToken };
  }

  @Throttle(AUTH_THROTTLE)
  @Post("register")
  async register(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const input = parseBody(registerDtoSchema, body);
    const tokens = await this.auth.register(input, this.meta(request));
    this.setRefreshCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Throttle(AUTH_THROTTLE)
  @Post("login")
  async login(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const input = parseBody(loginDtoSchema, body);
    const tokens = await this.auth.login(input, this.meta(request));
    this.setRefreshCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Throttle(AUTH_THROTTLE)
  @Post("refresh")
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.refresh(request.cookies?.refreshToken as string | undefined);
    this.setRefreshCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(@CurrentUser() user: RequestUser, @Res({ passthrough: true }) response: Response) {
    response.clearCookie("refreshToken");
    return this.auth.logout(user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("sessions")
  async sessions(@CurrentUser() user: RequestUser) {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("sessions/:id/revoke")
  async revokeSession(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.revokeSession(user.id, user.sessionId, id);
    if (result.revokedCurrent) {
      response.clearCookie("refreshToken");
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post("sessions/logout-all")
  async logoutAll(@CurrentUser() user: RequestUser, @Res({ passthrough: true }) response: Response) {
    response.clearCookie("refreshToken");
    return this.auth.logoutAllSessions(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  async changePassword(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(changePasswordDtoSchema, body);
    return this.auth.changePassword(user.id, user.sessionId, input);
  }

  @UseGuards(JwtAuthGuard)
  @Post("me/export-data")
  async exportMyData(@CurrentUser() user: RequestUser, @Res() response: Response) {
    const archive = await this.dataExport.exportUserData(user.id);
    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Length", archive.buffer.length);
    response.setHeader("Content-Disposition", `attachment; filename="${archive.filename}"`);
    response.send(archive.buffer);
  }

  private setRefreshCookie(response: Response, refreshToken: string) {
    response.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  private meta(request: Request) {
    return {
      userAgent: request.header("user-agent"),
      ipAddress: request.ip,
    };
  }
}
