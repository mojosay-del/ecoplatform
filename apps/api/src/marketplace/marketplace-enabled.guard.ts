import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";

@Injectable()
export class MarketplaceEnabledGuard implements CanActivate {
  constructor(private readonly settings: PlatformSettingsService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    if (await this.settings.getValue("marketplace.enabled")) {
      return true;
    }

    throw new ForbiddenException("Торговая площадка временно закрыта для тестирования.");
  }
}
