"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";
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

/**
 * shadcn `login-03` 블록 기반. DEV-04 · 4.3절의 필수 수정 사항을 반영했다.
 *   · 소셜 로그인 버튼·구분선 제거 (DEC-002)
 *   · 이메일 → 아이디 (DEC-014)
 *   · "비밀번호를 잊으셨나요?" 링크 제거 + 안내 문구 (DEC-015)
 *   · 로그인 상태 유지 체크박스 (FR-AUTH-008)
 *   · 폼 상단 오류 Alert 영역 (SCR-001)
 */
export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // UI 확인용 — 인증은 M1에서 붙인다.
    if (!username || !password) {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    setPending(true);
    if (username === "pending") {
      router.push("/pending");
      return;
    }
    router.push("/dashboard");
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
          <form onSubmit={onSubmit}>
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
                <Checkbox id="remember" defaultChecked />
                <FieldLabel htmlFor="remember" className="font-normal">
                  로그인 상태 유지
                </FieldLabel>
              </Field>

              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? "로그인 중…" : "로그인"}
                </Button>
                <FieldDescription className="text-center">
                  계정이 없으신가요? <Link href="/signup">회원가입</Link>
                </FieldDescription>
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
