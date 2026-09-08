import { decodeSegment } from "@/lib/path-segment";

/**
 * 지금 보고 있는 화면을 **사람 말로** 옮긴다.
 *
 * 채팅이 「해당 페이지에 맞게」 답하려면 경로가 아니라 **뜻**을 알아야 합니다.
 * `/resources/github-repo/pdal-…` 를 그대로 넘기면 모델이 주소를 해석하느라
 * 한 턴을 씁니다.
 *
 * `server` 와 `client` 양쪽이 씁니다 — 패널이 칩에 그리고(클라이언트),
 * 액션이 프롬프트에 싣습니다(서버). **한 곳에서 만듭니다.**
 */

const STATIC: Record<string, string> = {
  "/dashboard": "대시보드 (최근 자료와 내 서재)",
  "/resources": "자료 목록",
  "/resources/new": "자료 등록 화면",
  "/search": "통합 검색 결과",
  "/collections": "컬렉션 목록",
  "/bookmarks": "내 북마크",
  /*
   * **네오는 이 내용을 못 봅니다.** 개인 메모는 MCP 검색에 없습니다 —
   * 「어느 화면인가」만 알려 주고, 무엇이 적혀 있는지는 모릅니다.
   */
  "/notes": "나의 노트 (나만 보는 개인 메모 — 네오는 내용을 볼 수 없습니다)",
  "/me": "마이페이지",
};

const TYPE_LABEL: Record<string, string> = {
  "ai-material": "AI 자료",
  "github-repo": "GitHub 저장소",
  "mcp-server": "MCP 서버",
  skill: "Skill",
  "dev-note": "개발 노트",
  prompt: "프롬프트",
};

export interface PageContext {
  /** 칩에 보여줄 짧은 이름 */
  label: string;
  /** 프롬프트에 실을 한 줄 */
  detail: string;
}

export function describePage(pathname: string, query?: string): PageContext {
  const clean = pathname.split("?")[0] ?? pathname;
  const segments = clean.split("/").filter(Boolean).map(decodeSegment);

  const q = query?.trim();
  const withQuery = (base: string) => (q ? `${base} — 검색어 «${q}»` : base);

  if (STATIC[clean]) {
    return {
      label: STATIC[clean].split(" (")[0]!,
      detail: withQuery(STATIC[clean]),
    };
  }

  if (segments[0] === "resources" && segments[1]) {
    const type = TYPE_LABEL[segments[1]];
    // /resources/{type}/{slug}[/edit]
    if (type && segments[2]) {
      const slug = segments[2];
      const editing = segments[3] === "edit";
      return {
        label: editing ? `${type} 수정` : type,
        detail: editing
          ? `${type} 자료 «${slug}» 를 고치는 중`
          : `${type} 자료 «${slug}» 상세`,
      };
    }
    if (type) {
      return { label: type, detail: withQuery(`${type} 목록`) };
    }
  }

  if (segments[0] === "collections" && segments[1]) {
    return { label: "컬렉션", detail: `컬렉션 «${segments[1]}» 상세` };
  }

  /*
   * **모르면 «모른다»고 합니다.** 그럴듯한 이름을 지어내면 모델이 그것을
   * 사실로 받아 엉뚱한 화면 이야기를 합니다.
   */
  return { label: "Neowave Work", detail: `경로 ${clean} (설명이 없는 화면)` };
}
