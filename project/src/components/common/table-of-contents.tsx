import { HEADING_ID_PREFIX } from "@/components/common/markdown-viewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * 마크다운 본문에서 `##`, `###` 을 뽑아 목차를 만든다.
 * 앵커 id 는 `rehype-slug` 가 붙이는 규칙과 맞춘다.
 */
export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;

    const text = m[2].replace(/[*_`~]/g, "").trim();
    items.push({
      // sanitize 가 붙이는 접두어를 그대로 맞춘다 — 안 맞으면 앵커가 죽는다
      id: HEADING_ID_PREFIX + slugify(text),
      text,
      level: m[1].length as 2 | 3,
    });
  }
  return items;
}

/** github-slugger 와 같은 규칙 (rehype-slug 기본값) */
function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

export function TableOfContents({ items }: { items: TocItem[] }) {
  if (items.length < 2) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">목차</CardTitle>
      </CardHeader>
      <CardContent>
        <nav aria-label="본문 목차">
          <ul className="space-y-1.5 text-sm">
            {items.map((i) => (
              <li key={i.id} className={i.level === 3 ? "pl-3" : undefined}>
                <a
                  href={`#${i.id}`}
                  className="text-muted-foreground hover:text-foreground block truncate"
                >
                  {i.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </CardContent>
    </Card>
  );
}
