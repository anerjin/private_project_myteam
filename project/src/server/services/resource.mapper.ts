import "server-only";

import type { ResourceCardRow } from "@/server/repositories/resource.repository";
import type {
  McpServerDetail,
  PromptDetail,
  Resource,
  ResourceDetail,
} from "@/types";

/**
 * Prisma 행 → 화면 DTO (`Resource`).
 *
 * **경계에서 한 번만 바꿉니다.** 화면이 `Date` 를 받으면 서버 컴포넌트에서
 * 클라이언트 컴포넌트로 넘길 때마다 직렬화 규칙을 신경 써야 하고,
 * `null` 과 `undefined` 가 섞이면 표현 계층이 매번 `?? undefined` 를 붙입니다
 * (`session.ts` 의 `department` 와 같은 판단).
 *
 * **타입별 상세는 여기서 판별 유니온으로 조립합니다.** 화면의
 * `ResourceDetail` 은 `type` 으로 좁혀지는 유니온이라, 그 태그를 붙이는 곳이
 * 한 곳이어야 합니다 — 카드·상세·폼이 각자 조립하면 세 곳이 어긋납니다.
 */

/** DB 는 `null`, 화면 DTO 는 `undefined` — 경계에서 한 번 */
const u = <T>(v: T | null | undefined): T | undefined => v ?? undefined;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
const day = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : undefined;

/**
 * Prisma 의 `Json` 컬럼 → 화면 타입.
 *
 * **`as never` 로 뭉개지 않습니다.** JSONB 는 런타임에 무엇이든 들어올 수 있으므로
 * 단언은 거짓말이고, 형태가 어긋나면 화면에서 터집니다.
 * 배열이 아닌 값은 «없음»으로 떨어뜨립니다 — 카드 한 장이 목록을 깨뜨리지 않게.
 */
function json<T>(value: unknown): T | undefined {
  return Array.isArray(value) ? (value as T) : undefined;
}

type DetailRows = Pick<
  ResourceCardRow,
  "aiMaterial" | "githubRepo" | "mcpServer" | "skill" | "devNote" | "prompt"
>;

/**
 * 상세 조립. **타입에 맞는 행이 없으면 그 타입의 «빈» 상세를 만듭니다** —
 * `null` 을 돌려주면 화면이 매번 존재 검사를 해야 하고, 카드 한 장이
 * 렌더를 통째로 깨뜨립니다. 데이터가 덜 온 것은 화면이 조용히 덜 그릴 일입니다.
 */
function toDetail(type: Resource["type"], rows: DetailRows): ResourceDetail {
  switch (type) {
    case "AI_MATERIAL": {
      const d = rows.aiMaterial;
      return {
        type: "AI_MATERIAL",
        materialKind: d?.materialKind ?? "ARTICLE",
        sourceName: u(d?.sourceName),
        authors: d?.authors,
        publishedAt: day(d?.publishedAt),
        language: u(d?.language),
        readingTime: u(d?.readingTime),
        keyPoints: u(d?.keyPoints),
        applicability: u(d?.applicability),
      };
    }
    case "GITHUB_REPO": {
      const d = rows.githubRepo;
      return {
        type: "GITHUB_REPO",
        owner: d?.owner ?? "",
        repo: d?.repo ?? "",
        stars: u(d?.stars),
        forks: u(d?.forks),
        primaryLanguage: u(d?.primaryLanguage),
        license: u(d?.license),
        topics: d?.topics,
        pushedAt: iso(d?.pushedAt),
        latestRelease: u(d?.latestRelease),
        archiveStatus: d?.archiveStatus ?? "NONE",
        archiveSizeBytes: d?.archiveSizeBytes
          ? Number(d.archiveSizeBytes)
          : undefined,
        archivedSha: u(d?.archivedSha),
        isGone: d?.isGone ?? false,
      };
    }
    case "MCP_SERVER": {
      const d = rows.mcpServer;
      return {
        type: "MCP_SERVER",
        packageName: u(d?.packageName),
        transport: d?.transport ?? "STDIO",
        installCommand: u(d?.installCommand),
        configJson: d?.configJson ?? "{}",
        envVars: json<McpServerDetail["envVars"]>(d?.envVars),
        providedTools: json<McpServerDetail["providedTools"]>(d?.providedTools),
        clientSupport: d?.clientSupport,
        usageStatus: d?.usageStatus ?? "REVIEWING",
      };
    }
    case "SKILL": {
      const d = rows.skill;
      return {
        type: "SKILL",
        skillName: d?.skillName ?? "",
        definition: d?.definition ?? "",
        triggerCondition: d?.triggerCondition ?? "",
        usageExample: d?.usageExample ?? "",
        targetClients: d?.targetClients,
        version: u(d?.version),
        usageStatus: d?.usageStatus ?? "REVIEWING",
      };
    }
    case "DEV_NOTE": {
      const d = rows.devNote;
      return {
        type: "DEV_NOTE",
        noteKind: d?.noteKind ?? "TIP",
        relatedProject: u(d?.relatedProject),
        occurredAt: day(d?.occurredAt),
      };
    }
    case "PROMPT": {
      const d = rows.prompt;
      return {
        type: "PROMPT",
        promptText: d?.promptText ?? "",
        useCase: d?.useCase ?? "",
        targetModel: u(d?.targetModel),
        variables: json<PromptDetail["variables"]>(d?.variables),
        usageStatus: d?.usageStatus ?? "REVIEWING",
      };
    }
  }
}

export function toResource(
  row: ResourceCardRow,
  opts: { bookmarked?: boolean; body?: string | null; updatedAt?: Date } = {}
): Resource {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    summary: u(row.summary),
    body: u(opts.body),
    url: u(row.url),
    // **행의 값을 그대로 씁니다.** 전에는 `"PUBLISHED"` 를 박아 넣어서
    // 초안이 화면에서 「게시됨」이라고 «단언»했습니다.
    status: row.status,
    sourceChannel: row.sourceChannel,
    category: u(row.category?.slug),
    tags: row.tags.map((t) => t.tag.slug),
    author: {
      id: row.author.id,
      username: row.author.username,
      name: row.author.name,
      department: row.author.department ?? "",
    },
    viewCount: row.viewCount,
    bookmarkCount: row.bookmarkCount,
    bookmarked: opts.bookmarked,
    createdAt: row.createdAt.toISOString(),
    updatedAt: (opts.updatedAt ?? row.createdAt).toISOString(),
    detail: toDetail(row.type, row),
  };
}
