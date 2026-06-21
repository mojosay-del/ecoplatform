import { createZip, type ZipFile } from "../common/simple-zip";

export type AuthDataExportArchiveInput = {
  generatedAt: Date;
  userId: string;
  companyId: string | null;
  profile: unknown;
  company: unknown;
  consents: unknown;
  sessions: unknown;
  notifications: unknown;
  notificationDeliveries: unknown;
  supportTickets: unknown;
  lessonProgress: unknown;
  comments: unknown;
  reactions: unknown;
  moderation: unknown;
  files: unknown;
  authoredContent: unknown;
  auditLog: unknown;
};

export type AuthDataExportResult = {
  buffer: Buffer;
  filename: string;
};

const EXPORT_FILES = [
  "profile.json",
  "company.json",
  "consents.json",
  "sessions.json",
  "notifications.json",
  "support-tickets.json",
  "learning-progress.json",
  "comments.json",
  "reactions.json",
  "moderation.json",
  "files.json",
  "authored-content.json",
  "audit-log.json",
];

export function buildAuthDataExportArchive(input: AuthDataExportArchiveInput): AuthDataExportResult {
  const generatedAtIso = input.generatedAt.toISOString();
  const zipFiles: ZipFile[] = [
    {
      name: "manifest.json",
      data: jsonBuffer({
        generatedAt: generatedAtIso,
        format: "ecoplatform-personal-data-export-v1",
        userId: input.userId,
        companyId: input.companyId,
        files: EXPORT_FILES,
        notes: [
          "Пароль, refresh-token hashes, provider tokens и API key hashes не включаются в экспорт.",
          "Файлы включены как metadata FileAsset; бинарные объекты хранятся во внешнем S3-хранилище.",
        ],
      }),
    },
    { name: "profile.json", data: jsonBuffer(input.profile) },
    { name: "company.json", data: jsonBuffer(input.company) },
    { name: "consents.json", data: jsonBuffer(input.consents) },
    { name: "sessions.json", data: jsonBuffer(input.sessions) },
    {
      name: "notifications.json",
      data: jsonBuffer({
        notifications: input.notifications,
        notificationDeliveries: input.notificationDeliveries,
      }),
    },
    { name: "support-tickets.json", data: jsonBuffer(input.supportTickets) },
    { name: "learning-progress.json", data: jsonBuffer(input.lessonProgress) },
    { name: "comments.json", data: jsonBuffer(input.comments) },
    { name: "reactions.json", data: jsonBuffer(input.reactions) },
    { name: "moderation.json", data: jsonBuffer(input.moderation) },
    { name: "files.json", data: jsonBuffer(input.files) },
    { name: "authored-content.json", data: jsonBuffer(input.authoredContent) },
    { name: "audit-log.json", data: jsonBuffer(input.auditLog) },
  ];

  return {
    buffer: createZip(zipFiles, input.generatedAt),
    filename: `ecoplatform-data-export-${generatedAtIso.slice(0, 10)}.zip`,
  };
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2),
    "utf8",
  );
}
