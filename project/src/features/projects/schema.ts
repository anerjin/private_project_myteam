import { z } from "zod";

/**
 * 프로젝트 입력 규칙 (`FR-PROJ-*` · `DEC-069`).
 *
 * **서버와 화면이 같은 값을 봅니다.** service 는 `server-only` 라 화면이 못
 * 읽습니다 — `notes/schema` 를 같은 이유로 이 자리에 둔 것과 같습니다.
 */

export const PROJECT_NAME_MAX = 100;
export const PROJECT_DESC_MAX = 300;
export const DOC_TITLE_MAX = 150;
/** 자료 본문과 같은 상한입니다. 기획서 한 편이 들어갈 자리입니다 */
export const DOC_BODY_MAX = 100_000;
export const TASK_TITLE_MAX = 150;

/**
 * 문서 구획 (`FR-PROJ-005`).
 *
 * **enum 이지 표가 아닙니다** (`DEC-069`). 셋이 고정이고 운영자가 늘리는
 * 물건이 아닙니다 — 표로 두면 「구획 관리」 화면이 따라오고, 그건 아무도
 * 안 여는 화면이 됩니다.
 *
 * `slug` 는 주소에 쓰고(`/projects/x/plan`) `value` 는 DB 에 들어갑니다.
 * 둘을 같게 두고 싶었지만 Prisma enum 은 대문자 관례라 여기서 잇습니다.
 */
export const SECTIONS = [
  { value: "PLAN", slug: "plan", label: "기획" },
  { value: "DESIGN", slug: "design", label: "디자인" },
  { value: "DEV", slug: "dev", label: "개발" },
] as const;

export type SectionSlug = (typeof SECTIONS)[number]["slug"];
export type SectionValue = (typeof SECTIONS)[number]["value"];

export const SECTION_SLUGS = SECTIONS.map((s) => s.slug) as [
  SectionSlug,
  ...SectionSlug[],
];

export function sectionBySlug(slug: string) {
  return SECTIONS.find((s) => s.slug === slug);
}

export function sectionLabel(value: string): string {
  return SECTIONS.find((s) => s.value === value)?.label ?? value;
}

export const PROJECT_STATUS = [
  { value: "PLANNED", label: "예정" },
  { value: "ACTIVE", label: "진행 중" },
  { value: "PAUSED", label: "보류" },
  { value: "DONE", label: "완료" },
] as const;

export const TASK_STATUS = [
  { value: "TODO", label: "할 일" },
  { value: "DOING", label: "진행 중" },
  { value: "DONE", label: "완료" },
  { value: "HOLD", label: "보류" },
] as const;

export const statusLabel = (v: string) =>
  PROJECT_STATUS.find((s) => s.value === v)?.label ?? v;
export const taskStatusLabel = (v: string) =>
  TASK_STATUS.find((s) => s.value === v)?.label ?? v;

/**
 * 날짜는 **문자열로 오고 갑니다** (`YYYY-MM-DD`).
 *
 * `Date` 로 주고받으면 브라우저가 자기 시간대로 해석해 **하루씩 밀립니다** —
 * 「9월 3일」이 2일 저녁으로 저장되는 그 문제입니다. 컬럼도 `date` 이고
 * (`DEC-069`), 경계에서 문자열로 붙잡아 둡니다.
 */
const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식입니다.")
  .optional()
  .or(z.literal("").transform(() => undefined));

/** `YYYY-MM-DD` → UTC 자정. **시간대를 타지 않게 `Z` 를 박습니다** */
export function toDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

/** UTC 자정 → `YYYY-MM-DD`. `toISOString` 을 쓰면 시간대를 안 탑니다 */
export function fromDate(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

/**
 * 시작이 끝보다 뒤면 막습니다.
 *
 * **DB 가 못 막습니다** — 체크 제약을 걸 수도 있지만, 그러면 오류가
 * 「제약 위반」으로 올라와 화면이 어느 칸을 가리켜야 할지 모릅니다.
 */
const orderedDates = <T extends { startsOn?: string; endsOn?: string }>(
  v: T,
  ctx: z.RefinementCtx
) => {
  if (v.startsOn && v.endsOn && v.startsOn > v.endsOn) {
    ctx.addIssue({
      code: "custom",
      path: ["endsOn"],
      message: "종료일이 시작일보다 앞설 수 없습니다.",
    });
  }
};

export const projectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "이름을 적어 주세요.")
      .max(PROJECT_NAME_MAX, `이름은 ${PROJECT_NAME_MAX}자까지입니다.`),
    description: z.string().trim().max(PROJECT_DESC_MAX).default(""),
    status: z.enum(["PLANNED", "ACTIVE", "PAUSED", "DONE"]).default("PLANNED"),
    startsOn: dateString,
    endsOn: dateString,
  })
  .superRefine(orderedDates);

export type ProjectInput = z.infer<typeof projectSchema>;

export const projectDocSchema = z.object({
  section: z.enum(["PLAN", "DESIGN", "DEV"]),
  title: z
    .string()
    .trim()
    .min(1, "제목을 적어 주세요.")
    .max(DOC_TITLE_MAX, `제목은 ${DOC_TITLE_MAX}자까지입니다.`),
  /** 제목만 적어 두는 문서가 있습니다 — 「나중에 채움」. 막을 이유가 없습니다 */
  body: z.string().max(DOC_BODY_MAX, `본문은 ${DOC_BODY_MAX}자까지입니다.`).default(""),
});

export type ProjectDocInput = z.infer<typeof projectDocSchema>;

export const projectTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "할 일을 적어 주세요.")
      .max(TASK_TITLE_MAX, `제목은 ${TASK_TITLE_MAX}자까지입니다.`),
    startsOn: dateString,
    endsOn: dateString,
    isMilestone: z.boolean().default(false),
    progress: z.coerce.number().int().min(0).max(100).default(0),
    status: z.enum(["TODO", "DOING", "DONE", "HOLD"]).default("TODO"),
    /** 빈 문자열은 «비움»입니다 — 폼의 「담당자 없음」이 그렇게 옵니다 */
    assigneeId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    parentId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
  })
  .superRefine(orderedDates)
  .superRefine((v, ctx) => {
    /*
     * **마일스톤은 한 점입니다** (`FR-PROJ-017`). 기간을 가지면 그건 그냥
     * 할 일이고, 간트가 마름모가 아니라 막대로 그립니다.
     */
    if (v.isMilestone && v.startsOn && v.endsOn && v.startsOn !== v.endsOn) {
      ctx.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "마일스톤은 하루짜리입니다 — 시작일과 종료일이 같아야 합니다.",
      });
    }
  });

export type ProjectTaskInput = z.infer<typeof projectTaskSchema>;
