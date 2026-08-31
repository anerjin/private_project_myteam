"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  updateProfileAction,
  withdrawSelfAction,
} from "@/server/actions/profile.actions";

/**
 * SCR-141 프로필 수정 (`FR-USER-002`).
 *
 * ## 여기 있던 칸들은 전부 `disabled` 였습니다
 *
 * `P3` 가 그렇게 두었고 그때는 정직했습니다 — 고칠 수 있는 칸과 `onClick`
 * 없는 「저장」 버튼보다 낫습니다 (`DEC-045`). 이제 배선과 함께 열립니다.
 *
 * ## 아이디는 여전히 못 바꿉니다
 *
 * 감사 로그가 `actor_username` 을 스냅샷으로 갖고 있어(`DEC-021`), 바꾸면
 * 옛 기록이 다른 사람을 가리키는 것처럼 보입니다.
 */
export function ProfileForm({
  profile,
}: {
  profile: {
    username: string;
    name: string;
    department: string | null;
    bio: string | null;
  };
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [values, setValues] = useState({
    name: profile.name,
    department: profile.department ?? "",
    bio: profile.bio ?? "",
  });

  const dirty =
    values.name !== profile.name ||
    values.department !== (profile.department ?? "") ||
    values.bio !== (profile.bio ?? "");

  return (
    // JS 가 안 뜨면 기본 GET 으로 제출됩니다 (`login-form` 주석)
    <form
      method="post"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await updateProfileAction({
            name: values.name,
            department: values.department || null,
            bio: values.bio || null,
          });
          if (!r.ok) {
            toast.error(r.message ?? "저장하지 못했습니다.");
            return;
          }
          toast.success("프로필을 저장했습니다.");
          router.refresh();
        });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="username">아이디</FieldLabel>
          <Input id="username" value={profile.username} disabled />
          <p className="text-muted-foreground text-xs">
            아이디는 바꿀 수 없습니다. 감사 기록이 이 값으로 남습니다.
          </p>
        </Field>
        <Field>
          <FieldLabel htmlFor="name">이름</FieldLabel>
          <Input
            id="name"
            value={values.name}
            disabled={busy}
            onChange={(e) =>
              setValues((v) => ({ ...v, name: e.target.value }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="dept">소속 팀</FieldLabel>
          <Input
            id="dept"
            value={values.department}
            disabled={busy}
            onChange={(e) =>
              setValues((v) => ({ ...v, department: e.target.value }))
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="bio">자기소개</FieldLabel>
          <Textarea
            id="bio"
            rows={3}
            value={values.bio}
            disabled={busy}
            onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value }))}
          />
        </Field>
      </FieldGroup>

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={busy || !dirty || !values.name.trim()}>
          {busy ? "저장 중…" : "저장"}
        </Button>
        {dirty && (
          <span className="text-muted-foreground text-xs">
            저장하지 않은 변경이 있습니다.
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * SCR-141 회원 탈퇴 (`FR-USER-007`).
 *
 * **비밀번호를 다시 받습니다** (`REQ-02 · 2.3`) — 되돌릴 수 없고, 자리를
 * 비운 사이 남이 누를 수 있는 조작입니다.
 *
 * 마지막 관리자는 서버가 막습니다(`FR-ADM-009`). 화면이 미리 판정하지
 * 않는 이유는 **그 사이 다른 관리자가 생기거나 사라질 수 있어서**입니다 —
 * 서버가 트랜잭션 안에서 다시 셉니다.
 */
export function WithdrawButton({ name }: { name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="outline"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        탈퇴하기
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setPassword("");
          setOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{name} 님, 정말 탈퇴하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>되돌릴 수 없습니다.</b> 모든 기기에서 로그아웃되고 API 키가
              폐기되며, 이름은 가려지고 비공개 컬렉션과 북마크가 삭제됩니다.
              등록한 자료와 팀 공개 컬렉션은 남습니다. 아이디는 다시 쓸 수
              없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="withdraw-password">비밀번호 확인</Label>
            <Input
              id="withdraw-password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy || password.length === 0}
              onClick={() =>
                startTransition(async () => {
                  const r = await withdrawSelfAction({ password });
                  if (!r.ok) {
                    toast.error(r.message ?? "탈퇴하지 못했습니다.");
                    return;
                  }
                  /*
                   * **세션이 이미 끊겼습니다.** `push` 뒤에 `refresh` 를 함께
                   * 부릅니다 — `push` 만 하면 캐시된 RSC 페이로드가 남아
                   * 「로그아웃됐는데 화면은 그대로」가 될 수 있습니다.
                   */
                  toast.success("탈퇴 처리되었습니다.");
                  router.push("/login");
                  router.refresh();
                })
              }
            >
              {busy ? "처리 중…" : "탈퇴"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
