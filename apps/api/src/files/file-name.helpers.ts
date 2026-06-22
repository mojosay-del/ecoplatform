const UTF8_MOJIBAKE_MARKER = /[\u00c2\u00c3\u00d0\u00d1][\u0080-\u00bf]/;
const CYRILLIC_TEXT = /[\u0400-\u04ff]/;

export function normalizeFileNameEncoding(fileName: string): string {
  if (!UTF8_MOJIBAKE_MARKER.test(fileName)) {
    return fileName;
  }

  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  if (!decoded || decoded.includes("\uFFFD") || !CYRILLIC_TEXT.test(decoded)) {
    return fileName;
  }
  return decoded;
}
