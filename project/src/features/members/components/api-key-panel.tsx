"use client";

import { KeyRound, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/common/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createApiKeyAction,
  revokeApiKeyAction,
} from "@/server/actions/api-key.actions";

/**
 * API 키 관리 (FR-USER-008, SCR-141 보안 탭).
 *
 * **키의 권한은 내 역할을 넘지 못합니다** — 그런데 그 판정은 매 요청 서버가
 * 다시 합니다 (`DEC-037`). 여기서 «지금 역할로 가능한 스코프»를 미리 걸러 보여주면
 * 같은 규칙이 두 곳에 생기므로, 선택 가능 목록도 서버가 준 것을 씁니다.
 */

const SCOPE_LABEL: Record<string, string> = {
  "resources:read": "자료 읽기",
  "resources:write": "자료 쓰기",
  "archive:run": "아카이브 실행",
};

export interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

function mcpSnippet(appUrl: string) {
  return `{
  "mcpServers": {
    "queenbee": {
      "command": "npx",
      "args": ["-y", "@queenbee/mcp"],
      "env": {
        "QUEENBEE_URL": "${appUrl}",
        "QUEENBEE_API_KEY": "여기에 방금 발급한 키를 붙여넣으세요"
      }
    }
  }
}`;
}

const MAX_KEYS = 5;

export function ApiKeyPanel({
  keys,
  allowedScopes,
  appUrl,
}: {
  keys: ApiKeyRow[];
  /** 이 역할로 선택할 수 있는 스코프 — 서버가 계산해서 준다 (DEC-037) */
  allowedScopes: string[];
  appUrl: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [issued, setIssued] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(
    allowedScopes.filter((s) => s !== "archive:run")
  );

  const alive = keys.filter((k) => !k.revokedAt);

  function toggleScope(s: string) {
    setScopes((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]));
  }

  async function create() {
    const r = await createApiKeyAction({ name: name.trim(), scopes });
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    setOpen(false);
    setName("");
    // **이 화면을 벗어나면 다시 볼 수 없습니다** — 저장하지 않기 때문입니다 (NFR-SEC-017)
    setIssued(r.data.plaintext);
    router.refresh();
  }

  async function revoke(k: ApiKeyRow) {
    const r = await revokeApiKeyAction(k.id);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`${k.name} 키를 폐기했습니다.`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            API 키
          </CardTitle>
          <CardDescription>
            Claude Code에서 QueenBee에 자료를 등록하려면 API 키가 필요합니다.
            키의 권한은 내 역할을 넘지 못합니다.
          </CardDescription>
        </div>
        <Button
          size="sm"
          disabled={alive.length >= MAX_KEYS || busy}
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" />키 발급
        </Button>
      </CardHeader>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API 키 발급</DialogTitle>
            <DialogDescription>
              용도를 알아볼 수 있는 이름을 붙여주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="keyName">이름</Label>
              <Input
                id="keyName"
                placeholder="노트북 Claude Code"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>스코프</Label>
              {allowedScopes.map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <Checkbox
                    id={s}
                    checked={scopes.includes(s)}
                    onCheckedChange={() => toggleScope(s)}
                  />
                  <Label htmlFor={s} className="font-normal">
                    {SCOPE_LABEL[s] ?? s}{" "}
                    <code className="text-muted-foreground text-xs">{s}</code>
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              disabled={name.trim().length < 2 || scopes.length === 0 || busy}
              onClick={() => startTransition(create)}
            >
              발급
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CardContent className="space-y-4">
        {issued && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>이 화면을 벗어나면 다시 볼 수 없습니다</AlertTitle>
            <AlertDescription className="space-y-3">
              <div className="flex w-full items-center gap-2">
                <code className="bg-muted flex-1 overflow-x-auto rounded px-3 py-2 font-mono text-xs">
                  {issued}
                </code>
                <CopyButton value={issued} />
              </div>
              <div className="w-full space-y-1.5">
                <p className="text-xs">Claude Code 설정에 붙여넣으세요.</p>
                <div className="flex items-start gap-2">
                  <pre className="bg-muted flex-1 overflow-x-auto rounded p-3 font-mono text-[11px]">
                    {mcpSnippet(appUrl)}
                  </pre>
                  <CopyButton value={mcpSnippet(appUrl)} label="설정 복사" />
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {keys.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border py-8 text-center text-sm">
            아직 발급한 키가 없습니다.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {keys.map((k) => (
              <div
                key={k.id}
                className={`flex flex-wrap items-center gap-3 p-4 ${k.revokedAt ? "opacity-50" : ""}`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{k.name}</p>
                    {k.revokedAt ? (
                      <Badge variant="outline" className="text-xs">
                        폐기됨
                      </Badge>
                    ) : (
                      !k.lastUsedAt && (
                        <Badge variant="outline" className="text-xs">
                          사용 안 함
                        </Badge>
                      )
                    )}
                  </div>
                  <code className="text-muted-foreground text-xs">
                    {k.keyPrefix}…
                  </code>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <Badge
                        key={s}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="text-muted-foreground space-y-0.5 text-xs">
                  <p>생성 {k.createdAt.slice(0, 10)}</p>
                  <p>만료 {k.expiresAt.slice(0, 10)}</p>
                  <p>
                    마지막 사용{" "}
                    {k.lastUsedAt ? k.lastUsedAt.slice(0, 10) : "없음"}
                  </p>
                </div>
                {!k.revokedAt && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`${k.name} 폐기`}
                    disabled={busy}
                    onClick={() => startTransition(() => revoke(k))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
