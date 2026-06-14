import { api } from "../../lib/api";

// Получает свежую presigned-ссылку и запускает скачивание (ссылка приходит с
// content-disposition=attachment, поэтому открытие в новой вкладке скачивает
// файл, не уводя со страницы). Ошибки глотаем — кнопка просто не сработает.
export async function triggerDocumentDownload(node: { id: string }): Promise<void> {
  try {
    const { url } = await api.documentation.download(node.id);
    if (!url || typeof window === "undefined") return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    anchor.target = "_blank";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    // нет файла / S3 недоступен — оставляем без действия
  }
}
