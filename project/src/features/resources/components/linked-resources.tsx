"use client";

import { Link2, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getContentType } from "@/features/resources/content-types";
import {
  linkResourcesAction,
  searchLinkTargetsAction,
  unlinkResourcesAction,
} from "@/server/actions/relation.actions";
import type { RelationType, ResourceType } from "@/types";

export interface LinkedItem {
  id: string;
  slug: string;
  type: ResourceType;
  title: string;
  relationType: RelationType;
  outgoing: boolean;
}

/**
 * 사람이 이은 자료 (`FR-RES-012`).
 *
 * ## 태그가 겹치는 「관련 자료」와 **나눠 보여줍니다**
 *
 * 그쪽은 **추측**이고 이쪽은 **사람이 이은 것**입니다. 한 자리에 섞으면
 * 「왜 이게 관련이지?」가 생기고, 그러면 둘 다 안 믿게 됩니다.
 *
 * ## 방향이 있는 관계는 **반대쪽에서 다르게 읽힙니다**
 *
 * 「A 가 B 를 대체한다」와 「A 가 B 로 대체됐다」는 다른 문장입니다.
 * 행은 하나이고 `outgoing` 이 어느 쪽에서 보고 있는지 알려 줍니다.
 */
const LABEL: Record<RelationType, string> = {
  RELATED: "관련",
  SOURCE_OF: "출처",
  SUPERSEDES: "대체함",
  PART_OF: "일부",
};
const LABEL_REVERSE: Record<RelationType, string> = {
  RELATED: "관련",
  SOURCE_OF: "~에서 파생",
  SUPERSEDES: "~로 대체됨",
  PART_OF: "구성 요소",
};

export function LinkedResources({
  resourceId,
  items,
  canEdit,
}: {
  resourceId: string;
  items: LinkedItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<RelationType>("RELATED");
  const [found, setFound] = useState<
    { id: string; title: string; typeLabel: string }[]
  >([]);
  const [pending, startTransition] = useTransition();

  if (items.length === 0 && !canEdit) return null;

  function search(value: string) {
    setQ(value);
    startTransition(async () => {
      const r = await searchLinkTargetsAction(resourceId, value);
      setFound(r.ok ? r.data : []);
    });
  }

  function link(toId: string) {
    startTransition(async () => {
      const r = await linkResourcesAction({
        fromId: resourceId,
        toId,
        relationType: kind,
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("이었습니다.");
      setAdding(false);
      setQ("");
      setFound([]);
      router.refresh();
    });
  }

  function unlink(otherId: string, relationType: RelationType) {
    startTransition(async () => {
      const r = await unlinkResourcesAction({
        fromId: resourceId,
        toId: otherId,
        relationType,
      });
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("연결을 끊었습니다.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4" />이 자료와 이어진 것{" "}
          {items.length > 0 && `(${items.length})`}
        </CardTitle>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus className="size-4" />
            잇기
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex gap-2">
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as RelationType)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LABEL).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={q}
                onChange={(e) => search(e.target.value)}
                placeholder="제목으로 찾기"
                aria-label="이을 자료 찾기"
              />
            </div>
            {found.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {q ? "맞는 자료가 없습니다." : "제목을 적으면 찾아 줍니다."}
              </p>
            ) : (
              <ul className="divide-y">
                {found.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {f.title}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => link(f.id)}
                    >
                      잇기
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            아직 이어진 자료가 없습니다. GitHub 저장소와 그 MCP 서버처럼 함께
            보는 것을 이어 두면 다음 사람이 한 번에 찾습니다.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((it) => {
              const meta = getContentType(it.type);
              return (
                <li
                  key={`${it.id}-${it.relationType}`}
                  className="flex items-center gap-2 py-2"
                >
                  <span className="text-muted-foreground w-24 shrink-0 text-xs">
                    {it.outgoing
                      ? LABEL[it.relationType]
                      : LABEL_REVERSE[it.relationType]}
                  </span>
                  <Link
                    href={`/resources/${meta.slug}/${encodeURIComponent(it.slug)}`}
                    className="min-w-0 flex-1 truncate text-sm underline-offset-4 hover:underline"
                  >
                    {it.title}
                  </Link>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="연결 끊기"
                      disabled={pending}
                      onClick={() => unlink(it.id, it.relationType)}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
