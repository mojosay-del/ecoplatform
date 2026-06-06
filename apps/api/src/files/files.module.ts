import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { VideoTranscodeService } from "./video-transcode.service";

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [FilesService, VideoTranscodeService],
  exports: [FilesService, VideoTranscodeService],
})
export class FilesModule {}
