import { headers } from "next/headers";

import { listContentTypes } from "@/features/resources/content-types";
import { decodeSegment } from "@/lib/path-segment";
import { PATHNAME_HEADER } from "@/lib/request-headers";
import * as collectionService from "@/server/services/collection.service";
import * as memberService from "@/server/services/member.service";
import * as projectService from "@/server/services/project.service";
import * as resourceService from "@/server/services/resource.service";

/**
 * 브레드크럼의 **동적 세그먼트** 라벨 맵.
 * `/resources/mcp-server/filesystem-mcp` 처럼 URL 조각이 slug·id 인 자리를
 * 사람이 읽는 이름으로 바꾸기 위해 서버 레이아웃에서 만들어 넘긴다.
 * 정적 세그먼트는 `config/navigation.ts` 의 `SEGMENT_LABEL` 이 담당한다.
 *
 * 여러 도메인의 데이터를 엮으므로 feature 가 아니라 app 계층에 둔다 (DEV-06 · 6.9절).
 *
 * ## **지금 경로에 있는 것만** 조회합니다
 *
 * 전에는 전체 자료·컬렉션·회원의 맵을 만들었습니다. 목 데이터일 때는 공짜였지만
 * **1만 건이면 매 요청 1만 행을 읽어 그중 하나를 씁니다.**
 * 경로를 `proxy` 가 헤더로 알려 주므로(`PATHNAME_HEADER`) 마지막 세그먼트 하나만 찾습니다.
 *
 * 못 찾으면 **아무것도 넣지 않습니다** — 빵부스러기는 원래 세그먼트를 그대로 보여줍니다.
 * 「알 수 없음」 같은 자리표시자를 넣으면 그게 제목인 줄 압니다.
 */

/**
 * **푼 조각을 돌려줍니다.**
 *
 * 헤더에 실려 오는 경로는 퍼센트 인코딩되어 있습니다(HTTP 헤더 값은
 * ByteString 이라 한글을 그대로 실을 수 없습니다). 안 풀면 한글 slug 로
 * `titleBySlug` 를 찾을 때 **`%EB%9D%BC…` 로 조회해 언제나 못 찾고**,
 * 빵부스러기는 그 주소 문자열을 제목 자리에 그대로 그립니다.
 *
 * 화면 쪽(`components/common/breadcrumbs.tsx`)도 같은 함수로 풀어 **키를
 * 맞춥니다** — 한쪽만 풀면 맵은 채워지는데 아무도 못 꺼냅니다.
 */
async function currentSegments(): Promise<string[]> {
  const h = await headers();
  const pathname = h.get(PATHNAME_HEADER) ?? "";
  return pathname.split("/").filter(Boolean).map(decodeSegment);
}

export async function serviceBreadcrumbLabels(): Promise<
  Record<string, string>
> {
  const labels: Record<string, string> = {};
  // 콘텐츠 타입은 레지스트리에 있는 «상수»라 조회가 필요 없다
  for (const type of listContentTypes()) labels[type.slug] = type.label;

  const segments = await currentSegments();

  /*
   * **«마지막» 조각이 아니라 «자리»로 찾습니다.**
   *
   * 전에는 마지막 조각 하나만 조회했습니다. `/resources/{type}/{slug}` 에서는
   * 맞았지만 **`/resources/{type}/{slug}/edit` 에서는 마지막이 `edit`** 이라
   * slug 가 영영 라벨을 못 받고, 빵부스러기에 제목 대신 slug 가 찍혔습니다.
   *
   * 자리는 라우트가 정해 놓은 것이라 흔들리지 않습니다. 질의 수도 그대로 하나입니다.
   *
   * **질의는 service 가 합니다** (`DEV-06 · 6.6`). 이 파일이 app 계층에 있는
   * 이유는 «여러 도메인을 엮기» 때문이지 «Prisma 를 부르기» 때문이 아닙니다 —
   * 전에는 여기서 직접 불렀고, `check-deps` 가 이제 그것을 막습니다.
   */
  if (segments[0] === "resources" && segments.length >= 3) {
    // /resources/{type}/{slug}[/edit]
    const slug = segments[2]!;
    if (!labels[slug]) {
      const title = await resourceService.titleBySlug(slug);
      if (title) labels[slug] = title;
    }
  } else if (segments[0] === "collections" && segments.length >= 2) {
    // /collections/{slug}
    const slug = segments[1]!;
    const name = await collectionService.nameBySlug(slug);
    if (name) labels[slug] = name;
  } else if (segments[0] === "projects" && segments.length >= 2) {
    /*
     * `/projects/{slug}[/docs/{section}|/tasks]` — 동적인 것은 **slug 하나**입니다.
     * 구획(`plan`·`design`·`dev`)은 상수라 `SEGMENT_LABEL` 이 맡습니다.
     *
     * `my-tasks` 도 이 자리에 오지만 프로젝트 slug 가 아닙니다 — 못 찾으면
     * 아무것도 안 넣고, 빵부스러기는 `SEGMENT_LABEL` 의 「내 할 일」을 씁니다.
     */
    const slug = segments[1]!;
    if (slug !== "my-tasks") {
      const name = await projectService.nameBySlug(slug);
      if (name) labels[slug] = name;
    }
  }
  /*
   * **노트에는 동적 세그먼트가 없습니다.** 상세를 화면이 아니라 **가운데
   * 레이어**로 열기로 하면서(`?note=<id>`) 경로가 `/notes` 하나가 됐습니다 —
   * 빵부스러기가 풀 `id` 자체가 없습니다.
   *
   * 그래도 `note.service.titleFor` 는 남겨 둡니다. 「제목도 소유자를 봐야
   * 한다」는 규칙이 `verify:notes` 에 남아 있고, 언젠가 깊은 링크를 다시
   * 만들 때 그 규칙이 먼저 있어야 합니다.
   */

  return labels;
}

export async function adminBreadcrumbLabels(): Promise<Record<string, string>> {
  const segments = await currentSegments();
  // `/admin/members/{id}` — 여기만 동적 세그먼트다. 자리로 집습니다 (위와 같은 이유)
  const id = segments[2];
  if (segments[0] !== "admin" || segments[1] !== "members" || !id) return {};

  const name = await memberService.nameById(id);
  return name ? { [id]: name } : {};
}
