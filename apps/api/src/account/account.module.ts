import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";

// AuthModule — ради JwtAuthGuard; FilesModule — ради FilesService (удаление
// старого файла аватара). FilesModule сам импортирует AuthModule, поэтому цикла
// нет: AccountModule никем не импортируется.
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
