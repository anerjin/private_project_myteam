"use client";

import { Monitor } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { revokeSessionAction } from "@/server/actions/auth.actions";

/**
 * 활성 세션 (FR-USER-006, API-007).
 *
 * 「낯선 기기가 있으면 종료하세요」가 이 화면의 목적이므로,
 * **현재 기기를 분명히 표시**하고 그것만 종료 버튼을 숨깁니다 —
 * 자기 세션을 끊고 로그아웃되면 무엇이 일어난 건지 알기 어렵습니다.
 */

export interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  current: boolean;
}

/** UA 문자열 전체를 보여주면 읽을 수 없다. 알아볼 만큼만 줄인다 */
function deviceLabel(ua: string | null): string {
  if (!ua) return "알 수 없는 기기";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "기타";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Safari\//.test(ua)
        ? "Safari"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : "기타";
  return `${os} · ${browser}`;
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">활성 세션</CardTitle>
        <CardDescription>
          로그인된 기기 목록입니다. 낯선 기기가 있으면 종료하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            <Monitor className="text-muted-foreground size-4" />
            <div className="flex-1 text-sm">
              <p>
                {deviceLabel(s.userAgent)}
                {s.current && (
                  <span className="text-muted-foreground ml-2 text-xs">
                    현재 기기
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                {s.ip ?? "IP 미기록"} · 마지막 사용{" "}
                {(s.lastSeenAt ?? s.createdAt).slice(0, 16).replace("T", " ")}
              </p>
            </div>
            {!s.current && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    const r = await revokeSessionAction(s.id);
                    if (!r.ok) {
                      toast.error(r.message);
                      return;
                    }
                    toast.success("세션을 종료했습니다.");
                    router.refresh();
                  })
                }
              >
                종료
              </Button>
            )}
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="text-muted-foreground text-sm">활성 세션이 없습니다.</p>
        )}
      </CardContent>
    </Card>
  );
}
