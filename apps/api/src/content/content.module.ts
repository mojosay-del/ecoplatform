import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ContentController } from "./content.controller";
import { ContentService } from "./content.service";

@Module({
  imports: [AuthModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
