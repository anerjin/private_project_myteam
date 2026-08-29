/**
 * Ingest API HTTP 클라이언트 (`DEV-06 · 6.2`).
 *
 * 이 패키지의 **유일한 의존**입니다 — 앱 코드도 Prisma 도 import 하지 않습니다.
 * 검증·중복·권한은 전부 서버가 판정합니다. 여기서 흉내 내면 규칙이 두 곳에
 * 생기고, 어긋나는 순간 「웹에서는 되는데 CLI 에서는 안 되는」 것이 생깁니다.
 */
import type { z } from "zod";

import { explain, explainOffline, type ApiError } from "./errors.js";
import type { Config } from "./env.js";

/**
 * 도구가 실패를 말하는 방법.
 *
 * **예외를 던지지 않습니다.** MCP 도구가 던지면 클라이언트에는 「도구 실행
 * 실패」만 남고, 우리가 공들여 만든 안내 문구가 사라집니다. 대신 `isError`
 * 를 세운 결과로 돌려주면 에이전트가 문구를 읽고 판단합니다.
 */
export class ToolFailure extends Error {
  constructor(
    message: string,
    /** 에이전트가 고쳐서 다시 부를 수 있는가 */
    readonly fixable = false,
    /** 오류와 «함께» 온 정보 (중복 자료 등) */
    readonly data?: unknown
  ) {
    super(message);
    this.name = "ToolFailure";
  }
}

export interface Envelope {
  data?: unknown;
  /** 목록형 응답의 부가 정보 — `searchTruncated`·`nextCursor` (`DEC-048`) */
  meta?: Record<string, unknown>;
  error?: ApiError;
}

/**
 * 도구 한 개의 정의.
 *
 * 도구 파일은 **순수한 정의**만 두고, 등록·오류 포장은 `index.ts` 가 한 번에
 * 합니다 — 여덟 파일에 같은 try/catch 를 복사하면 한 곳만 고쳐지는 날이 옵니다.
 */
export interface ToolDef<A = Record<string, unknown>> {
  name: string;
  title: string;
  description: string;
  /**
   * zod raw shape. **서버가 검증하므로 여기서는 모양만** 잡습니다 —
   * 필수 여부·길이·열거값을 여기 옮겨 적으면 규칙이 두 벌이 됩니다
   * (`DEV-06 · 6.2` 「비즈니스 로직을 두지 않는다」).
   */
  inputSchema: z.ZodRawShape;
  /** 읽기 전용 도구인가 — 클라이언트가 확인 없이 부를 수 있는지 판단합니다 */
  readOnly: boolean;
  /** 메서드 문법입니다(양변성) — `index.ts` 가 여덟 개를 한 배열에 담습니다 */
  run(client: QueenBeeClient, args: A): Promise<unknown>;
}

/**
 * 도구가 받는 자료 입력 — `DEV-08 · 8.3` 의 도구 입출력 예시 모양입니다.
 * (`detail` 중첩 · `tags` 배열)
 */
export interface ResourceArgs {
  type?: string;
  title?: string;
  summary?: string;
  url?: string;
  body?: string;
  category?: string;
  tags?: string[];
  detail?: Record<string, unknown>;
}

/**
 * 도구 입력 → Ingest 본문.
 *
 * **서버는 평평한 본문을 받습니다** — 웹 폼과 같은 zod 를 지나기 때문입니다
 * (`FR-CLI-005`: 「웹 등록과 같은 서비스 계층을 거친다」). 반면 에이전트에게는
 * `detail` 이 나뉘어 있는 편이 낫습니다 — `queenbee_list_content_types` 가
 * 주는 것이 **`detailSchema`** 라서 그대로 채우면 되기 때문입니다.
 *
 * **그 번역이 여기 한 곳에 있습니다.** 도구마다 펼치면 등록과 수정이 서로
 * 다른 모양을 보내게 되고, 그 차이는 서버에서만 드러납니다.
 */
export function flatten(args: ResourceArgs): Record<string, unknown> {
  const { detail, tags, ...base } = args;
  return {
    ...base,
    // 폼과 같은 스키마라 태그는 쉼표로 구분된 한 줄입니다
    ...(tags === undefined ? {} : { tags: tags.join(", ") }),
    ...(detail ?? {}),
  };
}

export class QueenBeeClient {
  constructor(private readonly config: Config) {}

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  async get(path: string, query?: Record<string, string | undefined>): Promise<Envelope> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== "") qs.set(k, v);
    }
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request("GET", `${path}${suffix}`);
  }

  async post(path: string, body?: unknown): Promise<Envelope> {
    return this.request("POST", path, body);
  }

  async patch(path: string, body: unknown): Promise<Envelope> {
    return this.request("PATCH", path, body);
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Envelope> {
    const url = `${this.config.baseUrl}/api/ingest${path}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      // **재시도하지 않습니다** (`DEV-08 · 8.3`)
      throw new ToolFailure(explainOffline(this.config.baseUrl, e));
    }

    const envelope = (await res.json().catch(() => ({}))) as Envelope;

    if (!res.ok) {
      const { text, fixable } = explain(
        res.status,
        envelope.error,
        res.headers.get("retry-after")
      );
      /*
       * **오류와 함께 온 `data` 를 버리지 않습니다.** 중복(`409`)은 기존 자료를
       * 실어 보내고(`DEV-05 · 5.11`), 그게 「건너뛸지 보강할지」를 판단할 재료입니다.
       */
      throw new ToolFailure(text, fixable, envelope.data);
    }

    /*
     * **`data` 만 꺼내 주지 않습니다.** 검색은 `meta.searchTruncated` 로
     * 「없다」와 「안 보여준다」를 구별해 알려 주는데(`DEC-048`), 봉투를 벗기면
     * 그 사실이 조용히 사라지고 에이전트는 없는 줄 알고 중복을 만듭니다.
     */
    return envelope;
  }
}
