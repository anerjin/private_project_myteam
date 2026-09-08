/**
 * HTTP 오류 → **사람이 읽을 안내 문구** (`DEV-08 · 8.3` 오류 처리 표).
 *
 * 에이전트는 이 문구를 사용자에게 그대로 전달합니다. 그래서 「401」이 아니라
 * **다음에 무엇을 할지**를 적습니다.
 *
 * ## 자동 재시도를 넣지 않습니다
 *
 * 등록은 부작용이 있는 작업입니다. 실패를 조용히 재시도하면 **중복 등록**이
 * 생깁니다. 판단은 에이전트와 사람에게 맡깁니다 (`DEV-08 · 8.3`,
 * `FR-CLI-005` 수용 기준).
 */

export interface ApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

/** 도구가 사용자에게 돌려줄 문구. `retryable` 는 **표시용**이지 재시도 신호가 아닙니다 */
export interface Explained {
  text: string;
  /** 에이전트가 «고쳐서» 다시 부를 수 있는가 (스스로 판단하도록 알려 준다) */
  fixable: boolean;
}

const KEY_HINT =
  "Neowave Work 마이페이지 > API 키에서 키를 발급하고 NEOWAVE_WORK_API_KEY 에 넣어 주세요.";

export function explain(
  status: number,
  error: ApiError | undefined,
  retryAfter?: string | null
): Explained {
  const code = error?.code ?? "";
  const message = error?.message ?? "";

  switch (code) {
    case "KEY_INVALID":
    case "KEY_REVOKED":
    case "KEY_EXPIRED":
      return {
        text: `${message || "API 키를 쓸 수 없습니다."} ${KEY_HINT}`,
        fixable: false,
      };

    /*
     * **계정 상태는 재시도로 풀리지 않습니다.** 정지 해제는 관리자가 하는
     * 일이고, 에이전트가 할 수 있는 것은 사용자에게 말하는 것뿐입니다.
     */
    case "ACCOUNT_BLOCKED":
      return { text: message, fixable: false };

    case "SCOPE_INSUFFICIENT":
      return {
        text: `${message} 마이페이지에서 필요한 권한을 가진 키를 새로 발급하거나, 관리자에게 역할 변경을 요청하세요.`,
        fixable: false,
      };

    /*
     * **검증 실패는 고칠 수 있는 오류입니다** — 어떤 칸이 왜 틀렸는지 그대로
     * 전달합니다 (`FR-CLI-005`: 「에이전트가 고쳐 재시도할 수 있어야 한다」).
     */
    case "VALIDATION_ERROR": {
      const fields = error?.fieldErrors
        ? Object.entries(error.fieldErrors)
            .map(([k, v]) => `  - ${k}: ${v.join(", ")}`)
            .join("\n")
        : "";
      return {
        text: fields ? `${message}\n${fields}` : message,
        fixable: true,
      };
    }

    case "RATE_LIMITED":
      return {
        text: retryAfter
          ? `${message} (Retry-After: ${retryAfter}초) 자동으로 다시 시도하지 않습니다.`
          : `${message} 자동으로 다시 시도하지 않습니다.`,
        fixable: false,
      };

    case "DISK_FULL":
    case "ARCHIVE_QUOTA_EXCEEDED":
      return {
        text: `${message} 관리자에게 알려 주세요.`,
        fixable: false,
      };

    case "NOT_FOUND":
      return { text: message || "대상을 찾을 수 없습니다.", fixable: true };

    case "FORBIDDEN":
      return { text: message, fixable: false };
  }

  if (status === 401) {
    return { text: `인증에 실패했습니다. ${KEY_HINT}`, fixable: false };
  }
  return {
    text:
      message || `Neowave Work 서버가 오류를 반환했습니다 (HTTP ${status}).`,
    fixable: false,
  };
}

/**
 * 서버에 닿지 못한 경우 — **재시도하지 않고 즉시 실패**합니다 (`DEV-08 · 8.3`).
 *
 * 원인을 문구에 남기되 스택은 싣지 않습니다. 사용자가 할 일은 하나입니다:
 * 서버가 떠 있는지, 주소가 맞는지 보는 것.
 */
export function explainOffline(baseUrl: string, cause: unknown): string {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return `Neowave Work 서버(${baseUrl})에 연결하지 못했습니다. 서버가 실행 중인지, NEOWAVE_WORK_URL 이 맞는지 확인하세요. (${reason})`;
}
