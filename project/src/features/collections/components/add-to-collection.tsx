"use client";

import { Check, FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addToCollectionAction } from "@/server/actions/collection.actions";

/**
 * 자료 상세의 「컬렉션에 담기」 (`FR-COLL-004`).
 *
 * ## 목록은 **서버가 미리 계산해** 줍니다
 *
 * 「어느 컬렉션에 담을 수 있는가」와 「이미 담겼는가」를 컬렉션마다 물으면
 * 질의가 개수만큼 늘어납니다. `listForPicker` 가 한 번에 냅니다.
 *
 * ## 이미 담긴 것을 눌러도 **오류가 아닙니다**
 *
 * 두 번 누르는 것은 실수가 아니라 확인이고, 「이미 있습니다」는 사용자가
 * 할 일이 없는 문구입니다. 대신 **체크 표시로** 이미 담겼음을 보여줍니다.
 */
export function AddToCollection({
  resourceId,
  collections,
}: {
  resourceId: string;
  collections: { slug: string; name: string; contains: boolean }[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [added, setAdded] = useState<string[]>([]);

  const has = (slug: string) =>
    added.includes(slug) ||
    collections.find((c) => c.slug === slug)?.contains === true;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy}>
          <FolderPlus className="size-4" />
          컬렉션에 담기
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>내 컬렉션</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {collections.length === 0 ? (
          <DropdownMenuItem disabled>
            컬렉션이 없습니다 — 먼저 만드세요
          </DropdownMenuItem>
        ) : (
          collections.map((c) => (
            <DropdownMenuItem
              key={c.slug}
              onSelect={() =>
                startTransition(async () => {
                  const r = await addToCollectionAction({
                    slug: c.slug,
                    resourceId,
                  });
                  if (!r.ok) {
                    toast.error(r.message ?? "담지 못했습니다.");
                    return;
                  }
                  setAdded((a) => [...a, c.slug]);
                  toast.success(
                    r.data.added
                      ? `«${c.name}» 에 담았습니다.`
                      : `«${c.name}» 에 이미 있습니다.`
                  );
                  router.refresh();
                })
              }
            >
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {has(c.slug) && <Check className="size-4" />}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
