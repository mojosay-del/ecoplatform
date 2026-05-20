import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { loginDtoSchema, registerDtoSchema } from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const input = parseBody(registerDtoSchema, body);
    const tokens = await this.auth.register(input, this.meta(request));
    this.setRefreshCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post("login")
  async login(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const input = parseBody(loginDtoSchema, body);
    const tokens = await this.auth.login(input, this.meta(request));
    this.setRefreshCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

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
  @Get("me")
  async me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id);
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
