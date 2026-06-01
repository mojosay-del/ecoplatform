import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { NavigationService } from "./navigation.service";
import { SECTION_KEY } from "./section.decorator";

// Блокирует доступ к роутам скрытых разделов меню. Скрытие действует «от
// всех» — байпаса по ролям нет (даже админ не зайдёт по прямой ссылке, пока
// не вернёт раздел в редакторе). Бросаем 404, чтобы скрытый раздел выглядел
// как несуществующий.
@Injectable()
export class SectionVisibilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly navigation: NavigationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const guardKey = this.reflector.getAllAndOverride<string>(SECTION_KEY, [context.getHandler(), context.getClass()]);

    if (!guardKey) {
      return true;
    }

    if (this.navigation.isSectionHidden(guardKey)) {
      throw new NotFoundException();
    }

    return true;
  }
}
