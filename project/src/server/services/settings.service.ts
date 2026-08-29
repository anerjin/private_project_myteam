import "server-only";

import {
  SETTING_KEYS,
  SETTING_SCHEMA,
  type SettingKey,
} from "@/features/admin/settings.schema";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { isAdmin, type Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";

/**
 * 시스템 설정 (`system_settings`, `FR-ADM-015`).
 *
 * ## 같은 이름을 두 곳에서 읽고 있었습니다
 *
 * `auth.service.signUp` 이 `signup.enabled` 를 읽어 가입을 막고,
 * `admin/settings` **page 가 Prisma 를 직접 불러** 같은 행을 읽어 스위치를
 * 그렸습니다. 이름 문자열이 두 곳에 있으면 한쪽 오타가 「설정 없음」이 되고,
 * 그러면 화면은 꺼진 것처럼 보이는데 가입은 열려 있습니다.
 *
 * ## 행이 있으면 DB 가 이기고, 없으면 **환경변수**입니다
 *
 * `content_type_settings` 와 **같은 규칙**입니다. 설정 화면에서 한 번도 안
 * 건드린 값에 대해 「DB 에 행이 없다」와 「0 으로 정했다」를 구별해야 하고,
 * 기본값을 코드에 또 적으면 세 번째 출처가 생깁니다.
 *
 * ## 「없음」의 안전한 쪽 (`DEC-040` 계열)
 *
 * `signup.enabled` 는 **행이 없으면 켜진 것**입니다(기본은 가입 허용).
 * 숫자 설정은 행이 없으면 `.env` 값입니다 — 둘 다 「설정하지 않았다」가
 * 서비스를 멈추지 않게 하는 쪽입니다.
 */

/** 행이 없을 때의 값 — **여기가 아니라 `.env` 가 정합니다** */
function fallback(key: SettingKey): boolean | number {
  switch (key) {
    case "signup.enabled":
      return true;
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

/**
 * 신규 가입을 받는가.
 *
 * **`auth.service.signUp` 과 화면이 같은 함수를 지납니다.** 전에는 page 가
 * Prisma 를 직접 불러 같은 행을 읽었습니다 — 이름 문자열이 두 곳에 있었고,
 * 화면은 `db` 를 직접 만지고 있었습니다 (`DEV-06 · 6.6` 위반).
 */
export async function isSignupEnabled(): Promise<boolean> {
  return get<boolean>("signup.enabled");
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
 * 값 바꾸기 — **`ADMIN` 만** (`FR-ADM-015`).
 *
 * 분류 편집은 `EDITOR` 도 하지만(`DEC-057`) 시스템 설정은 다릅니다 —
 * 가입을 막거나 업로드 상한을 0 에 가깝게 만드는 것은 **서비스 전체**에
 * 걸리는 조작입니다.
 *
 * 무엇이 무엇으로 바뀌었는지 감사 로그에 남깁니다 — 「어제부터 업로드가
 * 안 된다」의 답이 여기 있어야 합니다.
 */
export async function set(
  actor: Actor,
  key: SettingKey,
  value: unknown
): Promise<void> {
  if (!isAdmin(actor)) {
    throw new AppError("FORBIDDEN", "시스템 설정은 관리자만 바꿀 수 있습니다.");
  }

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
