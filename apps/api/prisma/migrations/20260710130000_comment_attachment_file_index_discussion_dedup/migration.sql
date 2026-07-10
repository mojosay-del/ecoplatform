-- Индекс на CommentAttachment.fileId: очистка файлов-сирот (files-cleanup.helpers)
-- считает ссылки через count({ where: { fileId } }) — без индекса это seq scan.
CREATE INDEX "CommentAttachment_fileId_idx" ON "CommentAttachment"("fileId");

-- Дедуп: обычный индекс Discussion(targetType,targetId) полностью повторял
-- уникальный ключ на тех же колонках — держать оба незачем.
DROP INDEX "Discussion_targetType_targetId_idx";
