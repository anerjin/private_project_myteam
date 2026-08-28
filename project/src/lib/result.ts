import type { ZodError } from "zod";

import { AppError, isAppError, type ErrorCode } from "@/lib/errors";

/**
 * Server Action 결과 (DEV-05 · 5.2절).
 *
 * **액션은 예외를 던지지 않고 결과 객체를 반환합니다.** 화면에서 분기하기 쉽고,
 * 예외가 새어 나가 내부 구조가 노출되는 일도 없습니다 (`NFR-SEC-016`).
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(
  code: ErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>
): ActionResult<never> {
  return { ok: false, code, message, fieldErrors };
}

/** zod 실패를 필드별 오류로 옮긴다 (DEV-05 · 5.10절 2단계) */
export function validationError(error: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fail("VALIDATION_ERROR", "입력값을 확인해 주세요.", fieldErrors);
}

/**
 * 액션 본문을 감싸 예외를 결과로 바꾼다.
 *
 * **`AppError` 가 아닌 예외는 메시지를 그대로 내보내지 않습니다.** DB 오류 문구에는
 * 테이블·컬럼 이름이 섞여 있습니다 (`NFR-SEC-016`). 서버 로그에만 남깁니다.
 */
export async function guard<T>(
  fn: () => Promise<ActionResult<T>>
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (isAppError(e)) {
      return fail(e.code, e.message, e.fieldErrors);
    }
    console.error("[action]", e);
    return fail(
      "INTERNAL_ERROR",
      "처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
    );
  }
}

export { AppError };
