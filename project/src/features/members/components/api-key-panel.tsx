"use client";

import { KeyRound, Plus, Trash2, TriangleAlert, X } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  MAX_KEYS_PER_USER,
  SCOPE_LABEL,
  type Scope,
} from "@/features/members/api-key.schema";
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

/**
 * Claude Code 설정 스니펫 (`SCR-141`, `DEV-08 · 8.3`).
 *
 * **키를 스니펫 «안»에 넣습니다.** 이 스니펫은 평문을 보여주는 그 순간에만
 * 나타나고(발급 직후), 사용자가 할 일은 설정 파일에 붙여넣는 것 하나입니다.
 * 자리 표시자를 두면 복사를 두 번 하고 그 사이에 키를 잃어버릴 수 있습니다 —
 * 이 화면을 벗어나면 평문은 다시 볼 수 없기 때문입니다 (`NFR-SEC-017`).
 */
function mcpSnippet(appUrl: string, apiKey: string) {
  return `{
  "mcpServers": {
    "queenbee": {
      "command": "npx",
      "args": ["-y", "@queenbee/mcp"],
      "env": {
        "QUEENBEE_URL": "${appUrl}",
        "QUEENBEE_API_KEY": "${apiKey}"
      }
    }
  }
}`;
}

/** 90일 이상 안 쓴 키에 경고를 붙인다 (`SCR-141`) */
const STALE_DAYS = 90;

function isStale(k: ApiKeyRow): boolean {
  const last = k.lastUsedAt ?? k.createdAt;
  return Date.now() - new Date(last).getTime() > STALE_DAYS * 86_400_000;
}

const isExpired = (k: ApiKeyRow) =>
  new Date(k.expiresAt).getTime() <= Date.now();

/** 「지금 쓸 수 있는」 키 — 발급 상한이 세는 것과 같은 정의여야 한다 (service 와 일치) */
const isUsable = (k: ApiKeyRow) => !k.revokedAt && !isExpired(k);

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

  // 만료된 키는 자리를 차지하지 않는다 — 서버의 상한 계산과 같은 정의다
  const usable = keys.filter(isUsable);
  const atLimit = usable.length >= MAX_KEYS_PER_USER;

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
        <div className="flex flex-col items-end gap-1">
          <Button
            size="sm"
            disabled={atLimit || busy}
            onClick={() => setOpen(true)}
          >
            <Plus className="size-4" />키 발급
          </Button>
          {/* 「왜 못 누르는가」를 말한다 (FR-USER-008 수용 기준) */}
          {atLimit && (
            <p className="text-muted-foreground text-xs">
              키 {MAX_KEYS_PER_USER}개를 모두 쓰고 있습니다. 쓰지 않는 키를
              폐기해 주세요.
            </p>
          )}
        </div>
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
                    {SCOPE_LABEL[s as Scope] ?? s}{" "}
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
            <AlertTitle className="flex items-center justify-between gap-2">
              <span>이 화면을 벗어나면 다시 볼 수 없습니다</span>
              {/*
                **닫는 순간이 이 평문의 수명입니다.**
                전에는 지우는 경로가 없어서, 실제로 사라지는 조건이
                「탭을 옮겨 Radix 가 언마운트할 때」와 「전체 리로드」뿐이었습니다 —
                수명을 정하는 주체가 코드에 없었습니다 (`SCR-141` 은 다이얼로그를
                요구했고, 그랬다면 «닫기»가 곧 수명이었을 자리입니다).
              */}
              <Button
                variant="ghost"
                size="icon"
                aria-label="발급된 키 감추기"
                onClick={() => setIssued(null)}
              >
                <X className="size-4" />
              </Button>
            </AlertTitle>
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
                    {mcpSnippet(appUrl, issued)}
                  </pre>
                  <CopyButton
                    value={mcpSnippet(appUrl, issued)}
                    label="설정 복사"
                  />
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
                    {/*
                      만료를 «폐기됨»과 나란히 보여줍니다. 전에는 만료된 키가
                      배지 없이 정상 키처럼 보였고, 그러면서 발급 상한만 잡아먹었습니다.
                    */}
                    {k.revokedAt ? (
                      <Badge variant="outline" className="text-xs">
                        폐기됨
                      </Badge>
                    ) : isExpired(k) ? (
                      <Badge variant="outline" className="text-xs">
                        만료됨
                      </Badge>
                    ) : (
                      isStale(k) && (
                        <Badge variant="outline" className="text-xs">
                          {STALE_DAYS}일 이상 미사용
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
                        title={s}
                      >
                        {SCOPE_LABEL[s as Scope] ?? s}
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
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        aria-label={`${k.name} 폐기`}
                        disabled={busy}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {k.name} 키를 폐기할까요?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {/*
                            되돌리는 함수가 없습니다 (`DEC-037`: 폐기는 돌아오는
                            전이가 없음). 이웃 행의 아이콘을 잘못 눌러 즉시 폐기되면
                            Claude Code 설정을 다시 써야 합니다.
                          */}
                          되돌릴 수 없습니다. 이 키를 쓰던 Claude Code 설정은
                          곧바로 동작을 멈추고, 새 키를 발급해 다시 넣어야
                          합니다.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => startTransition(() => revoke(k))}
                        >
                          폐기
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
