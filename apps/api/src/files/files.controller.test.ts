import { FileAccessLevel } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { FilesController } from "./files.controller";
import type { UploadedMemoryFile } from "./files.service";

const file: UploadedMemoryFile = {
  originalname: "photo.webp",
  mimetype: "image/webp",
  size: 128,
  buffer: Buffer.from("test"),
};

function controllerWithUpload(upload = vi.fn().mockResolvedValue({ id: "file-1" })) {
  return { controller: new FilesController({ upload } as any), upload };
}

function controllerWithDelete(deleteIfUnreferenced = vi.fn().mockResolvedValue(1)) {
  return { controller: new FilesController({ deleteIfUnreferenced } as any), deleteIfUnreferenced };
}

describe("FilesController upload access", () => {
  it("разрешает пользователю компании загрузку изображений и видео через общий upload", async () => {
    const { controller, upload } = controllerWithUpload();

    await controller.upload(file, { accessLevel: FileAccessLevel.authenticated, imagePreset: "cover" }, {
      id: "user-1",
      companyId: "company-1",
      platformRoles: [],
    } as any);

    expect(upload).toHaveBeenCalledWith(
      file,
      { accessLevel: FileAccessLevel.authenticated, imagePreset: "cover", restriction: "media_only" },
      "user-1",
    );
  });

  it("запрещает upload пользователю без компании и служебной роли", async () => {
    const { controller, upload } = controllerWithUpload();

    await expect(
      controller.upload(file, {}, { id: "user-1", companyId: null, platformRoles: [] } as any),
    ).rejects.toThrow("Недостаточно прав для этого раздела.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("оставляет CMS-upload доступным контент-менеджеру", async () => {
    const { controller, upload } = controllerWithUpload();

    await controller.upload(file, { accessLevel: FileAccessLevel.authenticated }, {
      id: "manager-1",
      platformRoles: ["content_manager"],
    } as any);

    expect(upload).toHaveBeenCalledWith(file, { accessLevel: FileAccessLevel.authenticated }, "manager-1");
  });

  it("передаёт обычного пользователя в безопасное удаление непривязанного файла", async () => {
    const { controller, deleteIfUnreferenced } = controllerWithDelete();
    const user = { id: "user-1", companyId: "company-1", platformRoles: [] };

    await expect(controller.deleteIfUnreferenced("file-1", user as any)).resolves.toEqual({ ok: true });

    expect(deleteIfUnreferenced).toHaveBeenCalledWith(["file-1"], user);
  });
});
