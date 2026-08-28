"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const USERNAME_RE = /^[a-z][a-z0-9_.]{3,19}$/;
const TAKEN = ["jaehyun", "minsu", "seoyeon", "hyunwoo", "admin"];

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[a-zA-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

export function SignupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [touched, setTouched] = useState(false);
  const [password, setPassword] = useState("");

  const valid = USERNAME_RE.test(username);
  const taken = TAKEN.includes(username);
  const usernameState =
    !touched || !username ? null : !valid ? "invalid" : taken ? "taken" : "ok";

  const s = strength(password);
  const bars = ["매우 약함", "약함", "보통", "강함", "매우 강함"];

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">회원가입</CardTitle>
        <CardDescription>
          신청 후 관리자가 승인하면 이용할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push("/signup/complete");
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="username">아이디 *</FieldLabel>
              <Input
                id="username"
                autoComplete="username"
                placeholder="jaehyun"
                value={username}
                onBlur={() => setTouched(true)}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
              />
              {usernameState === "ok" ? (
                <FieldDescription className="text-emerald-600 dark:text-emerald-400">
                  <Check className="inline size-3" /> 사용할 수 있는
                  아이디입니다
                </FieldDescription>
              ) : usernameState === "taken" ? (
                <FieldDescription className="text-destructive">
                  <X className="inline size-3" /> 이미 사용 중인 아이디입니다
                </FieldDescription>
              ) : (
                <FieldDescription>
                  영문 소문자·숫자·<code>_</code>·<code>.</code> 4~20자, 첫
                  글자는 영문
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="password">비밀번호 *</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className="flex gap-1" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      i < s
                        ? s <= 1
                          ? "bg-destructive"
                          : s === 2
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        : "bg-muted"
                    )}
                  />
                ))}
              </div>
              <FieldDescription>
                {password
                  ? bars[s]
                  : "최소 10자, 영문·숫자·특수문자 중 2종 이상"}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="password2">비밀번호 확인 *</FieldLabel>
              <Input
                id="password2"
                type="password"
                autoComplete="new-password"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="name">이름 *</FieldLabel>
              <Input id="name" placeholder="김재현" required />
            </Field>

            <Field>
              <FieldLabel htmlFor="department">소속 팀 *</FieldLabel>
              <Input id="department" placeholder="개발팀" required />
            </Field>

            <Field>
              <FieldLabel htmlFor="reason">가입 사유</FieldLabel>
              <Textarea
                id="reason"
                rows={3}
                maxLength={200}
                placeholder="관리자가 승인 여부를 판단하는 데 참고합니다. (200자)"
              />
            </Field>

            <Field orientation="horizontal">
              <Checkbox id="agree" required />
              <FieldLabel htmlFor="agree" className="font-normal">
                개인정보 수집·이용에 동의합니다 *
              </FieldLabel>
            </Field>

            <Field>
              <Button type="submit">가입 신청</Button>
              <FieldDescription className="text-center">
                이미 계정이 있으신가요? <Link href="/login">로그인</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
