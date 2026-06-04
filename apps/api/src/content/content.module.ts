import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminActionLogService } from "../common/admin-action-log.service";
import { ModuleAccessService } from "../common/module-access.service";
import { FilesModule } from "../files/files.module";
import { ContentIndicesController } from "./content-indices.controller";
import { ContentKnowledgeBaseController } from "./content-knowledge-base.controller";
import { ContentLearningController } from "./content-learning.controller";
import { ContentNewsController } from "./content-news.controller";
import { ContentCommonService } from "./services/content-common.service";
import { IndicesService } from "./services/indices.service";
import { KnowledgeBaseService } from "./services/knowledge-base.service";
import { LearningService } from "./services/learning.service";
import { NewsService } from "./services/news.service";

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [
    ContentNewsController,
    ContentIndicesController,
    ContentLearningController,
    ContentKnowledgeBaseController,
  ],
  providers: [
    // 4 доменных сервиса (split по результатам Волны 3.2: было одно
    // ContentService на 2120 строк → 5 фокусных). Common — общие хелперы
    // (assertFunctionalAccess, payload, FileReference-операции, slug);
    // используется через инжект внутри доменных сервисов.
    ContentCommonService,
    NewsService,
    IndicesService,
    LearningService,
    KnowledgeBaseService,
    AdminActionLogService,
    ModuleAccessService,
  ],
})
export class ContentModule {}
