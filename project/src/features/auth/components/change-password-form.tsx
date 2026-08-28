"use client";

import { Check, ShieldAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { changePasswordAction } from "@/server/actions/auth.actions";

/**
 * 화면에 보여주는 규칙. **판정은 서버가 합니다** (`features/auth/schema.ts`).
 * 여기 목록은 입력 중 안내일 뿐이고, 「이전 비밀번호와 다름」처럼 서버만 알 수 있는
 * 조건(직전 3개 재사용 금지)은 제출 후 오류로 돌려받습니다.
 */
const RULES = [
  { label: "10자 이상", test: (p: string) => p.length >= 10 },
  {
    label: "영문·숫자·특수문자 중 2종 이상",
    test: (p: string) =>
      [/[a-zA-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(p)).length >=
      2,
  },
];

/**
 * SCR-006 초기 비밀번호 변경(강제) · 마이페이지 보안 탭 공용.
 *
 * **폼을 두 벌로 두지 않습니다.** 규칙과 오류 처리가 갈라지기 시작합니다
 * (`ResourceForm` 을 등록·수정 공용으로 만든 것과 같은 판단 — 메모리 `[010]`).
 * 다른 것은 «강제 안내를 보여주는가»와 «성공 후 어디로 가는가»뿐입니다.
 */
export function ChangePasswordForm({
  variant = "forced",
}: {
  variant?: "forced" | "settings";
}) {
  const forced = variant === "forced";
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const passed = RULES.map((r) => r.test(pw));
  const allOk =
    passed.every(Boolean) && pw === pw2 && pw2.length > 0 && current.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result = await changePasswordAction({
      currentPassword: current,
      newPassword: pw,
      confirmPassword: pw2,
    });

    if (!result.ok) {
      // 필드 오류가 있으면 그것을 우선 보여준다 — 어디를 고쳐야 하는지 알려준다
      const first = result.fieldErrors
        ? Object.values(result.fieldErrors)[0]?.[0]
        : undefined;
      setError(first ?? result.message);
      setPending(false);
      return;
    }

    toast.success("비밀번호를 변경했습니다. 다른 기기의 세션은 종료됐습니다.");
    setCurrent("");
    setPw("");
    setPw2("");
    setPending(false);

    // 세션 캐시가 무효화됐으므로 새 상태(mustChangePassword: false)를 다시 읽게 한다
    if (forced) router.replace("/dashboard");
    router.refresh();
  }

  const body = (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        {forced && (
          <Alert>
            <ShieldAlert />
            <AlertTitle>
              변경하기 전에는 다른 화면으로 갈 수 없습니다
            </AlertTitle>
            <AlertDescription>
              임시 비밀번호는 관리자도 알고 있는 값입니다.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>변경하지 못했습니다</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="current">현재 (임시) 비밀번호</FieldLabel>
          <Input
            id="current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="next">새 비밀번호</FieldLabel>
          <Input
            id="next"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
          <ul className="space-y-1 pt-1">
            {RULES.map((r, i) => (
              <li
                key={r.label}
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  !pw
                    ? "text-muted-foreground"
                    : passed[i]
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                )}
              >
                {pw && passed[i] ? (
                  <Check className="size-3" />
                ) : (
                  <X className="size-3" />
                )}
                {r.label}
              </li>
            ))}
          </ul>
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm">새 비밀번호 확인</FieldLabel>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
          />
          {pw2 && pw !== pw2 && (
            <p className="text-destructive text-xs">
              두 비밀번호가 일치하지 않습니다.
            </p>
          )}
        </Field>

        <Field>
          <Button type="submit" disabled={!allOk || pending}>
            {pending ? "변경 중…" : forced ? "변경하고 시작하기" : "변경"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );

  // 마이페이지에서는 바깥 Card 가 이미 있으므로 폼만 돌려준다
  if (!forced) return body;

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">비밀번호를 변경해 주세요</CardTitle>
        <CardDescription>
          관리자가 발급한 임시 비밀번호로 로그인하셨습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
