"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  checkUsernameAction,
  signUpAction,
} from "@/server/actions/auth.actions";

const USERNAME_RE = /^[a-z][a-z0-9_.]{3,19}$/;

/**
 * 아이디 사용 가능 여부는 **서버가 답합니다** (`FR-AUTH-002`).
 *
 * 여기 `const TAKEN = [...]` 다섯 개가 박혀 있었습니다. 그래서 **실제로
 * 쓰이는 아이디에도 초록불**이 켜졌고, 지운 계정 이름에는 계속 「이미 사용
 * 중」이 떴습니다. `checkUsernameAction` 은 처음부터 있었는데 **아무도
 * 부르지 않았습니다.**
 *
 * 점유된 아이디(`reserved_usernames`)도 「사용 중」입니다 (`DEC-021`).
 */
type Availability = "checking" | "ok" | "taken" | "unknown";

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
  const [availability, setAvailability] = useState<Availability>("unknown");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 칸 이름 → 문구. 서버가 보내 준 것을 그 칸 아래에 그립니다 (`FR-AUTH-001`) */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const err = (k: string) => fieldErrors[k]?.[0];

  /*
   * **입력이 멈추면 묻습니다.** 글자마다 부르면 열 글자에 열 번 갑니다 —
   * 서버가 IP 기준으로 막고 있어(`limitAnonymous`) 실제로 한도에 닿습니다.
   * 태그 자동완성과 같은 400ms 대기입니다.
   */
  useEffect(() => {
    if (!valid) {
      return;
    }
    const timer = setTimeout(async () => {
      setAvailability("checking");
      const r = await checkUsernameAction(username);
      /*
       * **못 물어봤으면 「사용 가능」이라고 말하지 않습니다.** 한도에 걸리거나
       * 서버가 안 뜬 상태에서 초록불을 켜면, 제출하고 나서야 거절당합니다.
       */
      setAvailability(!r.ok ? "unknown" : r.data.available ? "ok" : "taken");
    }, 400);
    return () => clearTimeout(timer);
  }, [username, valid]);

  const usernameState =
    !touched || !username
      ? null
      : !valid
        ? "invalid"
        : availability === "taken"
          ? "taken"
          : availability === "ok"
            ? "ok"
            : "checking";

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
        {/*
          **여기가 `router.push("/signup/complete")` 한 줄이었습니다.**

          서버를 부르지 않고 완료 화면으로 갔습니다 — 신청자는 「접수되었습니다」를
          보고 **오지 않을 승인을 기다렸고**, 관리자 목록에는 아무것도 없었습니다.
          `M0.5` UI 프로토타입의 잔재이고, 목이 화면에 숨은 **네 번째** 사례이며
          그중 가장 해롭습니다 — `FR-AUTH-001` 은 `P0` 입니다.

          `signUpAction`(`API-002`)은 처음부터 있었습니다. 서버 HTML 만 보는
          검증으로는 «폼이 그려진다»까지만 보였고, E2E 가 브라우저에서 눌러
          보자마자 드러났습니다.
        */}
        {/* JS 가 안 뜨면 기본 GET 으로 제출돼 비밀번호가 주소에 남습니다 (`login-form` 주석) */}
        <form
          method="post"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pending) return;
            setPending(true);
            setError(null);

            setFieldErrors({});

            const fd = new FormData(e.currentTarget);
            const r = await signUpAction({
              username,
              password,
              passwordConfirm: String(fd.get("passwordConfirm") ?? ""),
              name: String(fd.get("name") ?? ""),
              department: String(fd.get("department") ?? ""),
              signupReason: String(fd.get("reason") ?? ""),
              agreed: fd.get("agree") === "on",
            });
            setPending(false);

            if (!r.ok) {
              /*
               * **완료 화면으로 보내지 않습니다.** 실패했는데 「접수되었습니다」를
               * 보여 주는 것이 바로 이 자리의 원래 문제였습니다.
               *
               * **그리고 «어느 칸»인지 말합니다.** 전에는 `r.message` 만 썼고,
               * 그게 「입력값을 확인해 주세요.」였습니다 — 여섯 칸짜리 폼에서
               * 그 문장은 아무것도 알려 주지 않습니다. 서버는 처음부터 칸마다
               * 문구를 보내고 있었는데(`fieldErrors`) 화면이 버렸습니다.
               * `FR-AUTH-001` 도 「실패 시 **필드별 오류 메시지**」라고 적어
               * 두었습니다.
               */
              const fe = r.fieldErrors ?? {};
              setFieldErrors(fe);
              /*
               * **칸마다 문구가 붙었으면 배너는 그쪽을 가리킵니다.**
               * 「입력값을 확인해 주세요.」를 위에도 또 쓰면 같은 말이 두 번
               * 나오면서 정작 어느 칸인지는 여전히 안 알려 줍니다.
               * 배너의 원래 몫은 **칸에 못 붙는 실패**입니다 — 가입이 닫혔거나,
               * 서버가 죽었거나.
               */
              setError(
                Object.keys(fe).length > 0
                  ? "아래 표시된 칸을 확인해 주세요."
                  : (r.message ?? "신청하지 못했습니다.")
              );
              return;
            }
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
              ) : usernameState === "checking" ? (
                /* 「확인 중」을 말합니다 — 아무 표시도 없으면 사용자는 초록불을 기다립니다 */
                <FieldDescription>확인 중…</FieldDescription>
              ) : (
                <FieldDescription>
                  영문 소문자·숫자·<code>_</code>·<code>.</code> 4~20자, 첫
                  글자는 영문
                </FieldDescription>
              )}
              {err("username") && <FieldError>{err("username")}</FieldError>}
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
              {err("password") ? (
                <FieldError>{err("password")}</FieldError>
              ) : (
                <FieldDescription>
                  {password
                    ? bars[s]
                    : "최소 10자, 영문·숫자·특수문자 중 2종 이상"}
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="passwordConfirm">비밀번호 확인 *</FieldLabel>
              {/*
                **`name` 이 없었습니다.** 칸은 있는데 어디에도 실리지 않아,
                서로 다른 값을 넣어도 그대로 가입됐습니다 — 신청자는 자기가
                무엇을 비밀번호로 정했는지 모른 채 승인을 기다리게 됩니다.
              */}
              <Input
                id="passwordConfirm"
                name="passwordConfirm"
                type="password"
                autoComplete="new-password"
                required
              />
              {err("passwordConfirm") && (
                <FieldError>{err("passwordConfirm")}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="name">이름 *</FieldLabel>
              <Input id="name" name="name" placeholder="김재현" required />
              {err("name") && <FieldError>{err("name")}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="department">소속 팀 *</FieldLabel>
              <Input
                id="department"
                name="department"
                placeholder="개발팀"
                required
              />
              {err("department") && <FieldError>{err("department")}</FieldError>}
            </Field>

            <Field>
              {/*
                **`*` 가 없는 것이 맞습니다** — `FR-AUTH-001` 의 「선택」입니다.
                스키마가 `min(5)` 로 필수처럼 굴고 있어서, 비워 둔 사람이
                「입력값을 확인해 주세요」에 막혔습니다. 스키마를 고쳤습니다.
              */}
              <FieldLabel htmlFor="reason">가입 사유 (선택)</FieldLabel>
              <Textarea
                id="reason"
                name="reason"
                rows={3}
                maxLength={200}
                placeholder="관리자가 승인 여부를 판단하는 데 참고합니다. (200자)"
              />
              {err("signupReason") && (
                <FieldError>{err("signupReason")}</FieldError>
              )}
            </Field>

            <Field orientation="horizontal">
              <Checkbox id="agree" name="agree" required />
              <FieldLabel htmlFor="agree" className="font-normal">
                개인정보 수집·이용에 동의합니다 *
              </FieldLabel>
            </Field>
            {err("agreed") && <FieldError>{err("agreed")}</FieldError>}

            <Field>
              {/* 실패를 «말합니다» — 조용히 아무 일도 안 일어나는 것이 원래 문제였습니다 */}
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>신청하지 못했습니다</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={pending}>
                {pending ? "신청 중…" : "가입 신청"}
              </Button>
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
