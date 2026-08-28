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

const RULES = [
  { label: "10자 이상", test: (p: string) => p.length >= 10 },
  {
    label: "영문·숫자·특수문자 중 2종 이상",
    test: (p: string) =>
      [/[a-zA-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(p)).length >= 2,
  },
  {
    label: "이전 비밀번호와 다름",
    test: (p: string) => p.length > 0 && p !== "queenbee-temp-2026",
  },
];

/** SCR-006 초기 비밀번호 변경 (강제) */
export function ChangePasswordForm() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const passed = RULES.map((r) => r.test(pw));
  const allOk = passed.every(Boolean) && pw === pw2 && pw2.length > 0;

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">비밀번호를 변경해 주세요</CardTitle>
        <CardDescription>
          관리자가 발급한 임시 비밀번호로 로그인하셨습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            toast.success("비밀번호를 변경했습니다.");
            router.push("/dashboard");
          }}
        >
          <FieldGroup>
            <Alert>
              <ShieldAlert />
              <AlertTitle>변경하기 전에는 다른 화면으로 갈 수 없습니다</AlertTitle>
              <AlertDescription>
                임시 비밀번호는 관리자도 알고 있는 값입니다.
              </AlertDescription>
            </Alert>

            <Field>
              <FieldLabel htmlFor="current">현재 (임시) 비밀번호</FieldLabel>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
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
              <Button type="submit" disabled={!allOk}>
                변경하고 시작하기
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
