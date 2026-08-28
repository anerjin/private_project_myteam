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

/**
 * UA 문자열 전체를 보여주면 읽을 수 없다. 알아볼 만큼만 줄인다.
 *
 * **순서가 규칙입니다.** 좁은 것을 먼저 봅니다 —
 * - iOS UA 에는 `like Mac OS X` 가 들어 있어서 `/Mac OS/` 를 먼저 보면
 *   **모든 iPhone·iPad 가 「macOS」가 됩니다**(그리고 `iOS` 분기는 죽은 코드가 됩니다).
 *   이 화면의 목적이 「낯선 기기 식별」이라, 폰만 쓰는 사람에게 「macOS」가 뜨면
 *   **자기 세션을 침입으로 오인해 끊고**, 진짜 맥에서 온 침입자는 자기 폰으로 착각합니다.
 * - iOS 의 Chrome·Firefox 는 `CriOS`·`FxiOS` 이고 UA 에 `Safari/` 도 함께 들어 있어서
 *   `Safari` 를 먼저 보면 전부 Safari 가 됩니다.
 * - Android UA 에는 `Linux` 가 들어 있어 `Android` 가 먼저여야 합니다.
 */
function deviceLabel(ua: string | null): string {
  if (!ua) return "알 수 없는 기기";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "기타";
  const browser = /Edg(?:iOS|A)?\//.test(ua)
    ? "Edge"
    : /CriOS\//.test(ua) || /Chrome\//.test(ua)
      ? "Chrome"
      : /FxiOS\//.test(ua) || /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
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
