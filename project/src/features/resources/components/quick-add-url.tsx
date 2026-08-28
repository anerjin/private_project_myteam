"use client";

import { Link2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { detectTypeFromUrl, getContentType } from "../content-types";

/** FR-RES-005 URL 붙여넣기 → 타입 자동 추정. 등록 화면(SCR-113) 상단에 있다. */
export function QuickAddUrl() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  // 타입 추정 규칙은 각 타입의 meta 에 있다 (FR-RES-005)
  const detected = url.trim() ? detectTypeFromUrl(url) : null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary size-4" />
          <p className="text-sm font-medium">URL 빠른 등록</p>
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            router.push("/resources/new");
          }}
        >
          <div className="relative flex-1">
            <Link2 className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/… 또는 아티클 주소를 붙여넣으세요"
              className="bg-background pl-9"
            />
          </div>
          <Button type="submit">등록 폼 열기</Button>
        </form>

        <p className="text-muted-foreground text-xs">
          {detected ? (
            <>
              <span className="text-foreground font-medium">
                {getContentType(detected).label}
              </span>{" "}
              으로 추정됩니다. 메타데이터는 등록 후 자동으로 채워집니다.
            </>
          ) : (
            <>
              대부분의 자료는 Claude Code에서 수집합니다. 웹 등록은 손으로 정리하는
              자료(MCP·Skill·노트)에 씁니다.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
