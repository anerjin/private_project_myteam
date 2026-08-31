import { z } from "zod";

/**
 * 개인 메모 입력 규칙 (`FR-NOTE-001`·`002`).
 *
 * **서버와 화면이 같은 값을 봅니다.** 규칙이 두 곳에 있으면 한 곳만 고치는
 * 날이 옵니다 — `api-key.schema` 를 같은 이유로 이 자리에 둔 것과 같습니다.
 * service 는 `server-only` 라 화면이 못 읽습니다.
 */

/** 제목은 목록에 그려집니다 — 길면 목록이 깨집니다 */
export const NOTE_TITLE_MAX = 100;
/**
 * 본문 상한.
 *
 * 자료 본문(`resources.body`)과 달리 **첨부도 이미지도 없습니다.** 메모에
 * 논문을 붙여 넣을 이유가 없고, 상한이 없으면 한 사람이 DB 를 채웁니다.
 */
export const NOTE_BODY_MAX = 20_000;

export const noteSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "제목을 적어 주세요.")
    .max(NOTE_TITLE_MAX, `제목은 ${NOTE_TITLE_MAX}자까지입니다.`),
  /**
   * **본문은 비어 있어도 됩니다.** 제목만 적어 두는 메모가 있습니다 —
   * 「나중에 확인」 같은 것. 그걸 막을 이유가 없습니다.
   */
  body: z
    .string()
    .max(NOTE_BODY_MAX, `본문은 ${NOTE_BODY_MAX}자까지입니다.`)
    .default(""),
});

export type NoteInput = z.infer<typeof noteSchema>;
