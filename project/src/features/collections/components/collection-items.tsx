"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TypeChip } from "@/components/common/type-chip";
import {
  removeFromCollectionAction,
  reorderCollectionAction,
} from "@/server/actions/collection.actions";

/**
 * 컬렉션 담긴 자료 — 순서 변경 · 빼기 (`FR-COLL-004`·`005`).
 *
 * ## 드래그 대신 **위/아래 버튼**입니다
 *
 * 규격은 드래그를 말하지만, 그건 라이브러리 하나와 터치·키보드 대응을
 * 데려옵니다. 온보딩 묶음이 열 몇 개 규모인 이 시스템에서는 버튼이
 * **키보드로 되고 스크린리더에서도 말이 됩니다.** 서버와의 계약은
 * 「이 순서로 해 주세요」라 입력 방식과 무관하고, 항목이 수십 개로 늘면
 * 화면만 바꾸면 됩니다.
 *
 * ## 순서는 **낙관적으로** 바꿉니다
 *
 * 누르자마자 화면이 움직이고 서버에 보냅니다. 실패하면 되돌리고 문구를
 * 띄웁니다 — 왕복을 기다리면 연달아 두 칸 올리는 것이 답답합니다.
 */

export interface CollectionResource {
  id: string;
  slug: string;
  typeSlug: string;
  typeLabel: string;
  badgeClass: string;
  title: string;
  summary?: string;
}

export function CollectionItems({
  slug,
  items,
}: {
  slug: string;
  items: CollectionResource[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [order, setOrder] = useState(items);

  function move(index: number, delta: number) {
    const next = [...order];
    const a = next[index];
    const b = next[index + delta];
    if (!a || !b) return;
    next[index] = b;
    next[index + delta] = a;

    const previous = order;
    setOrder(next);
    startTransition(async () => {
      const r = await reorderCollectionAction({
        slug,
        resourceIds: next.map((i) => i.id),
      });
      if (!r.ok) {
        // 실패하면 **되돌립니다** — 화면만 바뀐 채로 두면 거짓말이 됩니다
        setOrder(previous);
        toast.error(r.message ?? "순서를 바꾸지 못했습니다.");
        return;
      }
      router.refresh();
    });
  }

  function remove(item: CollectionResource) {
    startTransition(async () => {
      const r = await removeFromCollectionAction({
        slug,
        resourceId: item.id,
      });
      if (!r.ok) {
        toast.error(r.message ?? "빼지 못했습니다.");
        return;
      }
      setOrder((o) => o.filter((x) => x.id !== item.id));
      toast.success(`«${item.title}» 을(를) 뺐습니다.`);
      router.refresh();
    });
  }

  if (order.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border py-8 text-center text-sm">
        담긴 자료가 없습니다. 자료 상세에서 «컬렉션에 담기»를 누르세요.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {order.map((resource, i) => (
        <Card key={resource.id}>
          <CardContent className="flex items-start gap-4 p-4">
            <span className="text-muted-foreground mt-0.5 w-5 shrink-0 text-sm tabular-nums">
              {i + 1}
            </span>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <TypeChip
                  label={resource.typeLabel}
                  className={resource.badgeClass}
                />
                <Link
                  href={`/resources/${resource.typeSlug}/${resource.slug}`}
                  className="hover:text-primary font-medium"
                >
                  {resource.title}
                </Link>
              </div>
              {resource.summary && (
                <p className="text-muted-foreground line-clamp-1 text-sm">
                  {resource.summary}
                </p>
              )}
            </div>

            <div className="flex shrink-0 gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="위로"
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="아래로"
                disabled={busy || i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive size-7"
                aria-label="빼기"
                disabled={busy}
                onClick={() => remove(resource)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
