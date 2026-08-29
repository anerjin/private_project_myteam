import "server-only";

import { db } from "@/lib/db";
import { getDiskStatus } from "@/lib/disk";
import { AppError } from "@/lib/errors";
import { extensionOf, verify } from "@/lib/file-type";
import * as storage from "@/lib/storage";
import { canEditResource, type Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";
import * as settingsService from "@/server/services/settings.service";

/**
 * 파일 첨부 (`FR-FILE-001`~`004`).
 *
 * ## 업로드는 **스트림 그대로** 지납니다
 *
 * `request.formData()` 는 파일 전체를 메모리에 올립니다 —
 * `NFR-PERF-007` 이 *"파일 전체를 메모리에 올리지 않는다"* 로 막고 있고,
 * 50MB 를 여럿 올리면 개발 PC 가 그대로 눌립니다.
 * 그래서 라우트가 **본문을 그대로** 넘기고 여기서 디스크로 흘려보냅니다.
 *
 * ## 세 가지를 «쓰기 전에» 봅니다
 *
 * 디스크 여유(`NFR-BACKUP-007`) · 자료 편집 권한 · 파일 형식(`NFR-SEC-009`).
 * 형식은 **첫 청크의 매직 넘버**로 보므로 스트리밍이 끊기지 않습니다.
 */

export interface AttachInput {
  resourceId: string;
  filename: string;
  contentType: string;
  body: ReadableStream<Uint8Array>;
}

export interface Attachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export async function attach(
  actor: Actor,
  input: AttachInput
): Promise<Attachment> {
  const target = await db.resource.findFirst({
    where: { id: input.resourceId, deletedAt: null },
    select: { id: true, authorId: true, title: true },
  });
  if (!target) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");
  if (!canEditResource(actor, target.authorId)) {
    throw new AppError("FORBIDDEN", "이 자료에 첨부할 권한이 없습니다.");
  }

  /*
   * **상한과 임계치를 설정에서 읽습니다** (`FR-ADM-015`). 전에는 `.env` 상수라
   * 관리자 화면에서 바꿔도 아무 일도 일어나지 않았을 자리입니다 — 설정 화면이
   * 거짓말을 하지 않으려면 «읽는 쪽»이 같은 값을 봐야 합니다.
   */
  const [minFree, maxBytes] = await Promise.all([
    settingsService.minFreeGb(),
    settingsService.maxUploadBytes(),
  ]);

  const disk = await getDiskStatus(minFree);
  if (!disk.ok) {
    // **전용 코드가 있습니다** (`DEV-05 · 5.11`) — 507 이라야 「내 잘못이 아니다」가 전달됩니다
    throw new AppError(
      "DISK_FULL",
      `디스크 여유가 부족해 업로드를 받지 않습니다 (남은 용량 ${disk.freeGb}GB, 임계치 ${disk.minFreeGb}GB).`
    );
  }

  /*
   * 확장자는 **판정된 형식에서** 나옵니다 — 사용자가 준 이름이 아닙니다
   * (`NFR-SEC-019`). 이름은 `originalName` 컬럼에만 두고 다운로드 헤더에서 씁니다.
   */
  const ext = extensionOf(input.filename);
  const key = storage.newKey("attachments", ext);

  const written = await storage.writeStream(
    key,
    input.body,
    maxBytes,
    (head) => {
      const v = verify(input.filename, input.contentType, head);
      if (!v.ok) throw new AppError("VALIDATION_ERROR", v.reason!);
    }
  );

  /*
   * **트랜잭션이 실패하면 디스크에 고아 파일이 남습니다.**
   * 스트림을 먼저 받아야 크기·해시를 알 수 있으므로 순서를 뒤집을 수는 없고,
   * 대신 실패했을 때 **지웁니다** — `detach` 가 반대 방향으로 같은 규칙을
   * 지킵니다(디스크는 트랜잭션 밖에서, DB 가 정본).
   */
  const file = await db
    .$transaction(async (tx) => {
      const f = await tx.file.create({
        data: {
          storageKey: written.key,
          originalName: input.filename.slice(0, 255),
          mimeType: input.contentType.split(";")[0].trim(),
          sizeBytes: BigInt(written.sizeBytes),
          checksumSha256: written.sha256,
          uploadedById: actor.id,
        },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      });
      await tx.resourceFile.create({
        data: { resourceId: target.id, fileId: f.id, role: "ATTACHMENT" },
      });
      await audit.log(
        actor,
        {
          action: "FILE_UPLOAD",
          targetType: "FILE",
          targetId: f.id,
          summary: `${target.title} 에 ${f.originalName} 첨부`,
        },
        tx
      );
      return f;
    })
    .catch(async (e) => {
      await storage.remove(written.key).catch(() => {});
      throw e;
    });

  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    createdAt: file.createdAt.toISOString(),
  };
}

/** 자료의 첨부 목록 */
export async function listFor(resourceId: string): Promise<Attachment[]> {
  const rows = await db.resourceFile.findMany({
    where: { resourceId, role: "ATTACHMENT" },
    orderBy: { sortOrder: "asc" },
    select: {
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.file.id,
    originalName: r.file.originalName,
    mimeType: r.file.mimeType,
    sizeBytes: Number(r.file.sizeBytes),
    createdAt: r.file.createdAt.toISOString(),
  }));
}

/**
 * 초안을 볼 수 있는 범위 — `resource.service.getBySlug` 와 **같은 규칙**입니다.
 * 작성자와 `EDITOR` 이상만 보고, 나머지는 게시된 것만 봅니다.
 */
export function draftScope(viewer: Actor) {
  if (viewer.role === "EDITOR" || viewer.role === "ADMIN") return {};
  return {
    OR: [{ status: "PUBLISHED" as const }, { authorId: viewer.id }],
  };
}

export interface Downloadable {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * 내려받을 수 있는가 (`NFR-SEC-021`).
 *
 * **로그인·권한을 거친 요청만** 파일을 받습니다. `public/` 에 두지 않는
 * 이유이고, 그래서 이 함수가 라우트의 유일한 관문입니다.
 *
 * 자료는 승인 회원 전원이 봅니다(`DEC-018`). 그래서 「이 파일이 살아 있는
 * 자료에 붙어 있는가」만 봅니다 — 지운 자료의 첨부는 안 나갑니다.
 */
export async function forDownload(
  fileId: string,
  viewer: Actor
): Promise<Downloadable> {
  const link = await db.resourceFile.findFirst({
    where: {
      fileId,
      resource: {
        deletedAt: null,
        /*
         * **초안의 첨부는 새면 안 됩니다.** 자료 자체는 `getBySlug` 가
         * 「작성자·`EDITOR` 이상만」으로 막는데(`P4` 의 M3), 파일 경로는
         * `deletedAt: null` 만 보고 있었습니다 — 지금은 전부 `PUBLISHED` 라
         * 무해하지만 **`P7` 의 CLI 가 초안으로 밀어 넣는 순간 열립니다.**
         */
        ...draftScope(viewer),
      },
    },
    select: {
      file: {
        select: {
          storageKey: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
  });
  if (!link) throw new AppError("NOT_FOUND", "파일을 찾을 수 없습니다.");
  return {
    storageKey: link.file.storageKey,
    originalName: link.file.originalName,
    mimeType: link.file.mimeType,
    sizeBytes: Number(link.file.sizeBytes),
  };
}

/**
 * 첨부 삭제 (`FR-FILE-003`).
 *
 * **연결을 끊고, 다른 자료가 안 쓰면 실제 파일도 지웁니다.**
 * 같은 파일이 여러 자료에 붙을 수 있어(`checksum` 중복 제거의 여지) 연결만
 * 보고 지우면 남의 첨부가 사라집니다.
 */
export async function detach(actor: Actor, fileId: string): Promise<void> {
  const link = await db.resourceFile.findFirst({
    where: { fileId, role: "ATTACHMENT" },
    select: {
      resourceId: true,
      resource: { select: { authorId: true, title: true } },
      file: { select: { storageKey: true, originalName: true } },
    },
  });
  if (!link) throw new AppError("NOT_FOUND", "첨부를 찾을 수 없습니다.");
  if (!canEditResource(actor, link.resource.authorId)) {
    throw new AppError("FORBIDDEN", "이 첨부를 지울 권한이 없습니다.");
  }

  const orphan = await db.$transaction(async (tx) => {
    /*
     * **`role` 을 함께 봅니다.** 위 조회는 `ATTACHMENT` 로 좁히는데 여기만
     * `{ fileId, resourceId }` 였습니다 — 같은 파일이 `ARCHIVE` 로도 붙어
     * 있으면 첨부를 지우며 아카이브 연결까지 끊습니다.
     */
    await tx.resourceFile.deleteMany({
      where: { fileId, resourceId: link.resourceId, role: "ATTACHMENT" },
    });
    const left = await tx.resourceFile.count({ where: { fileId } });
    if (left === 0) await tx.file.delete({ where: { id: fileId } });

    await audit.log(
      actor,
      {
        action: "FILE_DELETE",
        targetType: "FILE",
        targetId: fileId,
        summary: `${link.resource.title} 의 ${link.file.originalName} 삭제`,
      },
      tx
    );
    return left === 0;
  });

  /*
   * **디스크는 트랜잭션 밖에서 지웁니다.** 트랜잭션 안에서 지우면 롤백돼도
   * 파일은 이미 없습니다 — DB 는 되돌아가고 파일만 사라지는 상태가 최악입니다.
   * 반대로 여기서 실패하면 «고아 파일»이 남는데, 그건 DB 가 정본이므로
   * 나중에 청소할 수 있습니다.
   */
  if (orphan) await storage.remove(link.file.storageKey).catch(() => {});
}
