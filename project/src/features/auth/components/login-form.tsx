"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandMark } from "@/components/layout/brand-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SITE } from "@/config/site";
import { signInAction } from "@/server/actions/auth.actions";

/**
 * shadcn `login-03` 블록 기반. DEV-04 · 4.3절의 필수 수정 사항을 반영했다.
 *   · 소셜 로그인 버튼·구분선 제거 (DEC-002)
 *   · 이메일 → 아이디 (DEC-014)
 *   · "비밀번호를 잊으셨나요?" 링크 제거 + 안내 문구 (DEC-015)
 *   · 로그인 상태 유지 체크박스 (FR-AUTH-008)
 *   · 폼 상단 오류 Alert 영역 (SCR-001)
 *   · "계정이 없으신가요? 회원가입" 링크 제거 (`DEC-077`) — 가입할 곳이 없습니다
 *
 * 인증은 `signInAction`(API-004)이 합니다. 이 컴포넌트는 **결과를 보여주기만** 합니다 —
 * 아이디·비밀번호 판정, 시도 제한, 상태 차단은 전부 서버의 일입니다 (`NFR-SEC-006`).
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result = await signInAction({ username, password, remember }, next);

    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }

    // 서버가 정한 목적지로 간다. 클라이언트가 정하면 `mustChangePassword` 같은
    // 조건을 화면마다 다시 구현하게 된다.
    router.replace(result.data.redirectTo);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="text-center">
          <BrandMark
            className="mx-auto mb-2 size-11 rounded-xl"
            iconClassName="size-6"
          />
          <CardTitle className="text-xl">{SITE.name}</CardTitle>
          <CardDescription>{SITE.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {/*
            **`method="post"` 이 필요합니다 — 자바스크립트가 안 뜬 경우 때문에.**

            `onSubmit` 은 JS 가 살아 있을 때만 돕니다. 안 뜨면 브라우저가
            **기본값인 GET 으로** 네이티브 제출을 하고, 그러면 주소가
            `/login?username=…&password=…` 가 됩니다 — 비밀번호가 주소창·
            방문 기록·서버 접근 로그·`Referer` 헤더에 그대로 남습니다.

            사내망 IP 로 접속했을 때 실제로 그렇게 됐고, dev 서버 로그에
            평문 비밀번호가 찍힌 것을 확인했습니다. `POST` 로 두면 그 경로가
            막힙니다 — 로그인은 여전히 안 되지만 **적어도 새지 않습니다.**
          */}
          <form method="post" onSubmit={onSubmit}>
            <FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>로그인하지 못했습니다</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Field>
                <FieldLabel htmlFor="username">아이디</FieldLabel>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="jaehyun"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">비밀번호</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>

              <Field orientation="horizontal">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                />
                <FieldLabel htmlFor="remember" className="font-normal">
                  로그인 상태 유지
                </FieldLabel>
              </Field>

              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? "로그인 중…" : "로그인"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <FieldDescription className="px-6 text-center">
        비밀번호를 잊으셨다면 관리자에게 초기화를 요청하세요.
      </FieldDescription>
    </div>
  );
}
