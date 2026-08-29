import { z } from "zod";

/**
 * 시스템 설정의 **한 벌** (`FR-ADM-015`, `SCR-261`).
 *
 * ## 화면과 서버가 같은 표를 봅니다
 *
 * `settings.service` 는 `server-only` 라 화면이 못 읽습니다. 키 이름과 범위를
 * 화면에 다시 적으면 **한쪽만 고치는 날**이 옵니다 — 이 프로젝트가
 * `SCOPES`·`AUDIT_ACTIONS` 에서 이미 두 번 내린 판단입니다.
 *
 * ## 기본값은 **`.env`** 에 있습니다
 *
 * 표에는 기본값을 적지 않습니다. 「행이 있으면 DB 가 이기고, 없으면 환경변수」가
 * 규칙이고(`content_type_settings` 와 같은 형태), 여기에 숫자를 또 적으면
 * **세 번째 출처**가 생깁니다.
 */

export const SETTING_KEYS = [
  "signup.enabled",
  "upload.maxMb",
  "archive.maxMb",
  "disk.minFreeGb",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/**
 * 값의 모양과 **허용 범위**.
 *
 * 범위는 임의가 아닙니다 — 0 이나 음수를 넣으면 업로드가 통째로 막히고,
 * 관리자는 「왜 안 되지」를 겪습니다. 상한은 이 규모(`REQ-01 · 1.7`)에서
 * 실수로 디스크를 채우는 것을 막는 자리입니다.
 */
export const SETTING_SCHEMA = {
  "signup.enabled": z.boolean(),
  "upload.maxMb": z.number().int().min(1).max(500),
  "archive.maxMb": z.number().int().min(1).max(2000),
  "disk.minFreeGb": z.number().int().min(1).max(1000),
} satisfies Record<SettingKey, z.ZodTypeAny>;

export interface SettingMeta {
  label: string;
  description: string;
  unit?: string;
}

export const SETTING_META: Record<SettingKey, SettingMeta> = {
  "signup.enabled": {
    label: "신규 가입 허용",
    description:
      "끄면 가입 신청 자체를 받지 않습니다. 이미 신청한 건은 그대로 남습니다.",
  },
  "upload.maxMb": {
    label: "첨부 파일 최대 크기",
    description:
      "한 파일의 상한입니다. 넘는 파일은 받기 전에 거절합니다.",
    unit: "MB",
  },
  "archive.maxMb": {
    label: "아카이브 최대 크기",
    description:
      "저장소 하나를 내려받을 때의 상한입니다. 총량 상한(100GB)은 따로입니다.",
    unit: "MB",
  },
  "disk.minFreeGb": {
    label: "디스크 최소 여유",
    description:
      "이 아래로 내려가면 업로드와 아카이브를 거부하고 관리자 화면이 경고합니다.",
    unit: "GB",
  },
};

export const settingUpdateSchema = z.object({
  key: z.enum(SETTING_KEYS),
  /** 값 검증은 키마다 다르므로 service 가 `SETTING_SCHEMA` 로 다시 봅니다 */
  value: z.unknown(),
});
