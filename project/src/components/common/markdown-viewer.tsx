import { ExternalLink } from "lucide-react";
import Markdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * 마크다운 렌더러 (`FR-RES-015`) — 자료 본문을 마크다운으로 쓰고 렌더한다.
 *
 * **sanitize 는 필수입니다** (`NFR-SEC-007`). 자료 본문은 사용자·에이전트가 쓴 값이라
 * 그대로 렌더하면 XSS 가 됩니다. `dangerouslySetInnerHTML` 을 쓰지 않고
 * `rehype-sanitize` 화이트리스트를 통과시킵니다.
 *
 * 기본 스키마에서 딱 두 가지만 넓혔습니다.
 *   · 헤딩의 `id` — 목차 앵커에 필요 (rehype-slug 가 붙인다)
 *   · `code` 의 `className` — ```` ```ts ```` 같은 언어 표시
 */
/**
 * `rehype-sanitize` 는 DOM clobbering 을 막으려고 `id`·`name` 에 접두어를 붙입니다.
 * 그래서 `## 증상` 의 실제 앵커는 `#증상` 이 아니라 `#user-content-증상` 입니다.
 * 목차 링크도 이 접두어를 붙여야 스크롤이 맞습니다.
 */
export const HEADING_ID_PREFIX = defaultSchema.clobberPrefix ?? "user-content-";

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    h1: [...(defaultSchema.attributes?.h1 ?? []), "id"],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "id"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "id"],
    h4: [...(defaultSchema.attributes?.h4 ?? []), "id"],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./],
    ],
  },
};

export function MarkdownViewer({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-headings:scroll-mt-20 prose-headings:font-semibold",
        "prose-pre:bg-muted prose-pre:text-foreground prose-pre:border",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-a:text-primary prose-a:underline-offset-4",
        "prose-table:block prose-table:overflow-x-auto",
        className
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeSanitize, schema]]}
        components={{
          a: ({ href, children, ...props }) => {
            const external = !!href && /^https?:\/\//.test(href);
            return (
              <a
                href={href}
                {...props}
                {...(external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {children}
                {external && (
                  <ExternalLink className="ml-0.5 inline size-3 align-baseline" />
                )}
              </a>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
