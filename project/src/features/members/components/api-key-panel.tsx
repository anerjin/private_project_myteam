"use client";

import { KeyRound, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiKeys } from "@/mocks";

const SCOPES = [
  { id: "resources:read", label: "자료 읽기" },
  { id: "resources:write", label: "자료 쓰기" },
  { id: "archive:run", label: "아카이브 실행" },
];

const MCP_SNIPPET = `{
  "mcpServers": {
    "queenbee": {
      "command": "npx",
      "args": ["-y", "@queenbee/mcp"],
      "env": {
        "QUEENBEE_URL": "http://localhost:3100",
        "QUEENBEE_API_KEY": "qb_live_xxxxxxxxxxxxxxxx"
      }
    }
  }
}`;

export function ApiKeyPanel() {
  const [issued, setIssued] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={apiKeys.length >= 5}>
              <Plus className="size-4" />키 발급
            </Button>
          </DialogTrigger>
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
                <Input id="keyName" placeholder="노트북 Claude Code" />
              </div>
              <div className="space-y-2">
                <Label>스코프</Label>
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <Checkbox
                      id={s.id}
                      defaultChecked={s.id !== "archive:run"}
                    />
                    <Label htmlFor={s.id} className="font-normal">
                      {s.label}{" "}
                      <code className="text-muted-foreground text-xs">
                        {s.id}
                      </code>
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
                onClick={() => {
                  setOpen(false);
                  setIssued("qb_live_7Kd2mQx9pR4vT8nZaB3cE6hJ1sL5wY0u");
                }}
              >
                발급
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

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
                    {MCP_SNIPPET}
                  </pre>
                  <CopyButton value={MCP_SNIPPET} label="설정 복사" />
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="divide-y rounded-lg border">
          {apiKeys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{k.name}</p>
                  {!k.lastUsedAt && (
                    <Badge variant="outline" className="text-xs">
                      사용 안 함
                    </Badge>
                  )}
                </div>
                <code className="text-muted-foreground text-xs">
                  {k.keyPrefix}…
                </code>
                <div className="flex flex-wrap gap-1">
                  {k.scopes.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">
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
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => toast.success("키를 폐기했습니다.")}
              >
                <Trash2 className="size-4" />
                폐기
              </Button>
            </div>
          ))}
        </div>

        <p className="text-muted-foreground text-xs">
          사용자당 최대 5개 · 현재 {apiKeys.length}개
        </p>
      </CardContent>
    </Card>
  );
}
