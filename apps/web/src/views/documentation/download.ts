import { ApiError, api } from "../../lib/api";

// Получает свежую presigned-ссылку и запускает скачивание (ссылка приходит с
// content-disposition=attachment, поэтому открытие в новой вкладке скачивает
// файл, не уводя со страницы). Возвращает текст ошибки для UI, если скачать
// сейчас нельзя.
export async function triggerDocumentDownload(node: { id: string }): Promise<string | null> {
  try {
    const { url } = await api.documentation.download(node.id);
    if (!url) return "Файл временно недоступен. Попробуйте скачать его позже.";
    if (typeof window === "undefined") return null;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    anchor.target = "_blank";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.message) {
      return error.message;
    }
    return "Не удалось скачать файл. Попробуйте ещё раз позже.";
  }
}
