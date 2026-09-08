/**
 * 감사 로그가 기록하는 행위의 **한 벌** (`REQ-02 · 2.10`, `FR-AUDIT-001`).
 *
 * ## 왜 `features` 에 있는가
 *
 * `audit.service` 는 `server-only` 라 화면이 못 읽습니다. 필터의 선택지가
 * 필요해서 목록을 화면에 다시 적으면 **행위를 추가한 사람이 한쪽을
 * 빠뜨립니다** — 그러면 새 행위는 기록은 되는데 **필터로는 영원히 찾을 수
 * 없습니다.** `SCOPES` 를 `features/members/api-key.schema.ts` 에 둔 것과
 * 같은 자리·같은 이유입니다.
 *
 * `audit.service.AuditAction` 이 이 배열에서 나오므로, 여기 없는 값을
 * `log()` 에 넘기면 **컴파일이 실패합니다.**
 */

export const AUDIT_ACTIONS = [
  "USER_SIGNUP",
  "USER_SIGNIN",
  "USER_SIGNIN_FAILED",
  /** 비밀번호는 맞았지만 계정 상태로 막힌 경우 — 자격 증명 유출 신호 */
  "USER_SIGNIN_BLOCKED",
  "USER_SIGNOUT",
  "USER_APPROVE",
  "USER_REJECT",
  /** 거부를 되돌려 재검토 대기로 (`DEC-042`) */
  "USER_REOPEN",
  "USER_SUSPEND",
  "USER_REACTIVATE",
  "USER_ROLE_CHANGE",
  "USER_PASSWORD_CHANGE",
  "USER_PASSWORD_RESET",
  "USER_WITHDRAW",
  "APIKEY_CREATE",
  "APIKEY_REVOKE",
  "RESOURCE_CREATE",
  "RESOURCE_UPDATE",
  "RESOURCE_DELETE",
  "RESOURCE_RESTORE",
  "RESOURCE_PURGE",
  // `P6` — 파일은 디스크에 남으므로 «누가 올렸고 누가 지웠는가»가 특히 필요하다
  "FILE_UPLOAD",
  "FILE_DELETE",
  "ARCHIVE_RUN",
  "SETTING_UPDATE",
  /*
   * 관리자가 «기록 자체»를 지우는 행위 (`SCR-241`·`SCR-251`).
   *
   * **지운 사실은 지워지지 않아야 합니다.** 특히 `AUDIT_PURGE` 는 그 자신이
   * 감사 로그에 남는 유일한 흔적입니다 — 「왜 작년 기록이 없느냐」의 답이
   * 여기 있습니다. 보존 배치(`maintenance.service`)가 쓰던 방식과 같습니다.
   */
  /*
   * 프로젝트 (`FR-PROJ-*`).
   *
   * **그릇만 기록하고 안의 계획은 기록하지 않습니다.** 프로젝트를 만들고
   * 지우는 것은 팀 모두에게 보이는 구조 변경입니다 — 특히 삭제는 남의 일정을
   * 함께 감춥니다. 반면 항목을 옮기고 진척률을 찍는 것은 **계획을 세우는
   * 일**이고, 남기면 관리자 화면에 「누가 몇 번 고쳤는지」가 흐릅니다(개인
   * 메모를 기록하지 않는 것과 같은 선). 그 값은 되돌아볼 자리가 따로 있습니다 —
   * 항목은 고쳐도 그 줄이 타임라인에 그대로 있습니다.
   *
   * 🔄 **`DEC-075` 로 「문서」가 사라졌습니다.** 옛 주석은 판(`project_doc_versions`)을
   *    근거로 들었는데 그 표가 없어졌습니다 — 남은 근거는 위의 「타임라인에 그대로
   *    있다」 하나입니다. 프로젝트 안의 활동은 `FR-PROJ-020` 이 따로 봅니다.
   */
  "PROJECT_CREATE",
  "PROJECT_UPDATE",
  "PROJECT_DELETE",
  "PROJECT_RESTORE",
  /*
   * 항목 댓글 (`DEC-074`).
   *
   * **위 규칙을 지우지 않고 좁힙니다.** 항목을 안 남기는 근거는 「되돌아볼
   * 자리가 따로 있다」였습니다 — 고쳐도 그 줄이 타임라인에 그대로 있습니다.
   *
   * 댓글에는 그 자리가 없습니다. **남이 지울 수 있고**(쓴 사람 · 프로젝트를
   * 만든 사람 · `ADMIN` — `project-item-comment.service`), 지우면 어느 화면도
   * 그것을 다시 읽지 않습니다. 「내가 쓴 줄이 없어졌다」에 답할 곳이 여기밖에
   * 없습니다.
   *
   * ⚠️ **본문은 안 싣습니다.** 요약에 글을 넣으면 이 화면이 「남의 댓글을 모아
   * 읽는 곳」이 됩니다. 남는 것은 누가·언제·어느 항목에서, 그리고 남의 것을
   * 지웠다면 **누구의 것을 지웠는지**입니다.
   */
  "PROJECT_COMMENT_CREATE",
  "PROJECT_COMMENT_UPDATE",
  "PROJECT_COMMENT_DELETE",
  "JOB_PURGE",
  "AUDIT_PURGE",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * 사람이 읽는 이름.
 *
 * 표에는 `USER_ROLE_CHANGE` 를 그대로 보여줍니다 — 관리자가 기계 이름으로
 * 검색하는 일이 있고, 요약 칸이 이미 사람 말을 합니다. 이 표는 **필터의
 * 선택지**를 위한 것입니다: 드롭다운에 대문자 스물다섯 개가 있으면 아무도
 * 못 고릅니다.
 */
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  USER_SIGNUP: "가입 신청",
  USER_SIGNIN: "로그인",
  USER_SIGNIN_FAILED: "로그인 실패",
  USER_SIGNIN_BLOCKED: "로그인 차단",
  USER_SIGNOUT: "로그아웃",
  USER_APPROVE: "가입 승인",
  USER_REJECT: "가입 거부",
  USER_REOPEN: "재검토",
  USER_SUSPEND: "정지",
  USER_REACTIVATE: "정지 해제",
  USER_ROLE_CHANGE: "역할 변경",
  USER_PASSWORD_CHANGE: "비밀번호 변경",
  USER_PASSWORD_RESET: "비밀번호 초기화",
  USER_WITHDRAW: "탈퇴",
  APIKEY_CREATE: "API 키 발급",
  APIKEY_REVOKE: "API 키 폐기",
  RESOURCE_CREATE: "자료 등록",
  RESOURCE_UPDATE: "자료 수정",
  RESOURCE_DELETE: "자료 삭제",
  RESOURCE_RESTORE: "자료 복구",
  RESOURCE_PURGE: "자료 영구 삭제",
  FILE_UPLOAD: "파일 업로드",
  FILE_DELETE: "파일 삭제",
  ARCHIVE_RUN: "아카이브 실행",
  SETTING_UPDATE: "설정 변경",
  PROJECT_CREATE: "프로젝트 생성",
  PROJECT_UPDATE: "프로젝트 수정",
  PROJECT_DELETE: "프로젝트 삭제",
  PROJECT_RESTORE: "프로젝트 복구",
  PROJECT_COMMENT_CREATE: "항목 댓글 작성",
  PROJECT_COMMENT_UPDATE: "항목 댓글 수정",
  PROJECT_COMMENT_DELETE: "항목 댓글 삭제",
  JOB_PURGE: "작업 기록 정리",
  AUDIT_PURGE: "감사 로그 정리",
};

/**
 * 어느 묶음에 속하는가 — 드롭다운을 사람이 고를 수 있게 나눕니다.
 *
 * **행위를 추가하면 여기 빠뜨릴 수 있습니다.** 그래서 아래 `groupOf` 는
 * 접두사로 판정하고, 표를 따로 두지 않습니다.
 */
export const AUDIT_GROUPS = [
  "계정",
  "API 키",
  "자료·파일",
  "프로젝트",
  "설정",
  "운영",
] as const;

export function groupOf(action: AuditAction): (typeof AUDIT_GROUPS)[number] {
  if (action.startsWith("APIKEY_")) return "API 키";
  if (action.startsWith("USER_")) return "계정";
  if (action === "SETTING_UPDATE") return "설정";
  if (action.startsWith("PROJECT_")) return "프로젝트";
  /*
   * **`RESOURCE_PURGE` 보다 먼저 걸러지면 안 됩니다.** 접두사로 봅니다 —
   * `_PURGE` 로 끝나는 것을 뭉뚱그리면 자료 영구 삭제가 「운영」으로 갑니다.
   */
  if (action.startsWith("JOB_") || action.startsWith("AUDIT_")) return "운영";
  return "자료·파일";
}
