import "server-only";

import {
  SETTING_KEYS,
  SETTING_SCHEMA,
  type SettingKey,
} from "@/features/admin/settings.schema";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";

/**
 * 시스템 설정 (`system_settings`, `FR-ADM-015`).
 *
 * ## 같은 이름을 두 곳에서 읽으면 안 됩니다
 *
 * 전에 `signup.enabled` 가 그랬습니다 — `auth.service.signUp` 과 `admin/settings`
 * page 가 **각자** 같은 행을 읽었고(page 는 Prisma 를 직접 불렀습니다), 이름
 * 문자열이 두 곳에 있으니 한쪽 오타가 「설정 없음」이 됐습니다. 그 키는
 * 가입 절차와 함께 없어졌지만(`DEC-077`) **규칙은 남습니다**: 설정을 읽는 문은
 * 이 파일 하나입니다.
 *
 * ## 행이 있으면 DB 가 이기고, 없으면 **환경변수**입니다
 *
 * `content_type_settings` 와 **같은 규칙**입니다. 설정 화면에서 한 번도 안
 * 건드린 값에 대해 「DB 에 행이 없다」와 「0 으로 정했다」를 구별해야 하고,
 * 기본값을 코드에 또 적으면 세 번째 출처가 생깁니다.
 *
 * ## 「없음」의 안전한 쪽
 *
 * 행이 없으면 `.env` 값입니다 — 「설정하지 않았다」가 서비스를 멈추지 않게
 * 하는 쪽입니다. 지금 남은 설정은 전부 숫자라 `SettingRow.value` 의 `boolean`
 * 갈래는 **당장은 아무도 쓰지 않습니다.** 타입은 그대로 둡니다: 다음 스위치가
 * 들어올 때 `SETTING_SCHEMA` 한 줄로 끝나야 하고, 좁혀 놨다가 되돌리면
 * 화면(`system-settings.tsx`)의 Switch 분기까지 함께 되살려야 합니다.
 */

/** 행이 없을 때의 값 — **여기가 아니라 `.env` 가 정합니다** */
function fallback(key: SettingKey): boolean | number {
  switch (key) {
    case "upload.maxMb":
      return env.MAX_UPLOAD_MB;
    case "archive.maxMb":
      return env.MAX_ARCHIVE_MB;
    case "disk.minFreeGb":
      return env.DISK_MIN_FREE_GB;
  }
}

export interface SettingRow {
  key: SettingKey;
  value: boolean | number;
  /** DB 에 행이 있는가 — 화면이 「기본값입니다」를 말할 수 있어야 합니다 */
  overridden: boolean;
  updatedAt: Date | null;
}

/**
 * 전부 읽기 — 설정 화면이 한 번에 묻습니다.
 *
 * **DB 에 있지만 스키마를 통과 못 하는 값은 버리고 기본값을 씁니다.**
 * 누군가 DB 를 직접 만져 `upload.maxMb = -1` 을 넣었을 때, 그 값을 그대로
 * 쓰면 업로드가 통째로 죽습니다 — 설정은 서비스를 멈추는 자리가 아닙니다.
 */
export async function getAll(): Promise<SettingRow[]> {
  const rows = await db.systemSetting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return SETTING_KEYS.map((key) => {
    const row = byKey.get(key);
    if (!row) {
      return { key, value: fallback(key), overridden: false, updatedAt: null };
    }
    const parsed = SETTING_SCHEMA[key].safeParse(row.value);
    if (!parsed.success) {
      console.error(`[settings] ${key} 값이 규격을 벗어나 기본값을 씁니다`);
      return { key, value: fallback(key), overridden: false, updatedAt: null };
    }
    return {
      key,
      value: parsed.data as boolean | number,
      overridden: true,
      updatedAt: row.updatedAt,
    };
  });
}

/** 값 하나 — 서비스 코드가 부르는 쪽 */
export async function get<T extends boolean | number>(
  key: SettingKey
): Promise<T> {
  const row = await db.systemSetting.findUnique({ where: { key } });
  if (!row) return fallback(key) as T;
  const parsed = SETTING_SCHEMA[key].safeParse(row.value);
  return (parsed.success ? parsed.data : fallback(key)) as T;
}

/** 첨부 파일 상한 (바이트) — `.env` 기본값 위에 DB 가 얹힌다 */
export async function maxUploadBytes(): Promise<number> {
  return (await get<number>("upload.maxMb")) * 1024 * 1024;
}

/** 아카이브 단건 상한 (바이트) */
export async function maxArchiveBytes(): Promise<number> {
  return (await get<number>("archive.maxMb")) * 1024 * 1024;
}

/** 디스크 최소 여유 (GB) */
export async function minFreeGb(): Promise<number> {
  return get<number>("disk.minFreeGb");
}

/**
 * 값 바꾸기 (`FR-ADM-015`).
 *
 * 🔄 **`ADMIN` 만**이었습니다. 등급이 사라져(`DEC-077`) 그 검사가 언제나 통과가
 *    되어 지웠습니다. 이 조작이 **서비스 전체에 걸린다**는 사실은 그대로입니다 —
 *    업로드 상한을 0 에 가깝게 만들면 아무도 파일을 못 올립니다. 달라진 것은
 *    그것을 할 수 있는 사람이 「관리자」에서 「로그인한 사람」이 된 것뿐이고,
 *    지금 그 둘은 같은 집합입니다.
 *
 * 그래서 **감사 로그가 더 중요해집니다** — 무엇이 무엇으로 바뀌었는지 남깁니다.
 * 「어제부터 업로드가 안 된다」의 답이 여기 있어야 합니다.
 */
export async function set(
  actor: Actor,
  key: SettingKey,
  value: unknown
): Promise<void> {
  const parsed = SETTING_SCHEMA[key].safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      `«${key}» 에 넣을 수 없는 값입니다: ${parsed.error.issues[0]?.message ?? ""}`
    );
  }

  const before = await get(key);

  await db.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: parsed.data as never,
        updatedById: actor.id,
      },
      update: { value: parsed.data as never, updatedById: actor.id },
    });

    await audit.log(
      actor,
      {
        action: "SETTING_UPDATE",
        targetType: "system_setting",
        targetId: key,
        summary: `시스템 설정 변경 — ${key}`,
        diff: {
          [key]: { before: String(before), after: String(parsed.data) },
        },
      },
      tx
    );
  });
}
