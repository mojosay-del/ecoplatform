-- Перевод блока "paragraph" с поля payload.markdown на payload.html.
-- Простая конверсия: экранируем спецсимволы HTML, двойной перенос строки -> разделитель абзацев,
-- одиночный перенос -> <br>, итог оборачиваем в <p>...</p>.
-- Затрагиваются три таблицы: NewsContentBlock, LessonContentBlock, KnowledgeBaseBlock.

CREATE OR REPLACE FUNCTION pg_temp.markdown_to_html(src text) RETURNS text AS $$
DECLARE
  escaped text;
  paragraphs text;
BEGIN
  IF src IS NULL OR length(src) = 0 THEN
    RETURN '<p></p>';
  END IF;
  escaped := replace(replace(replace(src, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  paragraphs := regexp_replace(escaped, E'\\n{2,}', '</p><p>', 'g');
  paragraphs := replace(paragraphs, E'\n', '<br>');
  RETURN '<p>' || paragraphs || '</p>';
END;
$$ LANGUAGE plpgsql;

UPDATE "NewsContentBlock"
SET payload = jsonb_build_object('html', pg_temp.markdown_to_html(payload->>'markdown'))
WHERE type = 'paragraph' AND payload ? 'markdown';

UPDATE "LessonContentBlock"
SET payload = jsonb_build_object('html', pg_temp.markdown_to_html(payload->>'markdown'))
WHERE type = 'paragraph' AND payload ? 'markdown';

UPDATE "KnowledgeBaseBlock"
SET payload = jsonb_build_object('html', pg_temp.markdown_to_html(payload->>'markdown'))
WHERE type = 'paragraph' AND payload ? 'markdown';
