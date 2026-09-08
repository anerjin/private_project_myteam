"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * 프로젝트에서 **사람 하나를 그리는 조각** (`DEC-075`).
 *
 * 🔴 **쓰는 곳이 둘입니다** — 트리 줄의 담당자 얼굴(`project-item-assignee.tsx`)과
 *    댓글의 작성자(`project-item-comments.tsx`). 각자 `Avatar` 를 조립하면
 *    이니셜을 자르는 법과 「이름 없음」을 부르는 말이 갈리고, 그러면 **같은
 *    계정이 두 화면에서 다르게 보입니다.**
 * ⚠️ 이 파일에는 **서버 액션 import 가 하나도 없습니다.** 순수 표시 조각입니다 —
 *    원본(Orbee)이 같은 파일을 따로 뺀 이유가 그것입니다(참가자 대화 상자를
 *    간트의 모듈 그래프로 끌고 들어오지 않으려고).
 */

/**
 * 화면에 그릴 사람 하나.
 *
 * 🔴 **`ProjectMemberCard` 가 아닙니다.** 원본은 이 값을 참가자 표에서 뽑고
 *    `role` 을 함께 싣지만, 우리에게는 참가자도 역할별 프로젝트 권한도 없습니다
 *    (`DEC-018` · `DEC-075`) — 여기 오는 것은 **승인 회원 전원**입니다
 *    (`project.service.assignableMembers`).
 */
export interface ProjectPerson {
  id: string;
  name: string;
  username: string;
  /** 프로필 사진. 없으면 이니셜로 떨어집니다 */
  avatarUrl?: string;
}

/**
 * 이름이 없는 계정이 실재합니다 — 빈 칸으로 두면 줄이 통째로 사라진 것처럼 보입니다.
 *
 * 🔴 **부르는 말이 화면마다 갈리면 안 됩니다.** 담당자 목록과 댓글이 같은 사람을
 *    다른 말로 부르면 같은 계정인지 알 수 없습니다.
 */
export function displayName(name: string | null | undefined): string {
  return (name ?? "").trim() || "이름 없음";
}

/**
 * 이니셜 한 글자.
 *
 * 🔴 **`slice(0, 1)` 이 아니라 `Array.from(...)[0]` 입니다.** 자바스크립트의
 *    문자열 인덱스는 UTF-16 코드 단위라, 이모지처럼 대리쌍으로 된 첫 글자를
 *    **반토막** 냅니다(화면에는 `�` 가 나옵니다). 이 저장소의 `nav-user` 는
 *    아직 `slice` 인데 거기는 로그인한 본인의 이름 하나뿐이고, 여기는 사내
 *    전원이 지나가는 자리입니다.
 */
function initialOf(name: string | null | undefined): string {
  return Array.from(displayName(name))[0] ?? "?";
}

/**
 * 얼굴 하나.
 *
 * 🔴 프롭이 `name`·`image` 인 것이 요점입니다 — 댓글의 작성자에게는 `username`
 *    도 `id` 도 필요 없습니다. 「사람 전체」를 받게 두면 부르는 쪽마다 없는 칸을
 *    지어내야 합니다.
 * ⚠️ **폴백 색을 이름에서 만들지 않았습니다.** 원본은 이름을 해시해 색을
 *    고르는데(`avatarColor`), 그 팔레트가 우리에게 없습니다 — 여기서 새로
 *    지으면 「이 저장소의 색은 어디서 오는가」가 두 곳이 됩니다(간트 색이
 *    벤더 팔레트를 그대로 쓰는 것과 같은 규율 — `gantt-color-css.ts`).
 *    공용 `Avatar` 의 기본 폴백(`bg-muted`)을 그대로 씁니다.
 */
export function PersonAvatar({
  name,
  image,
  size = "sm",
  className,
}: {
  /** 🔴 **다듬기 전의 원본**을 받습니다 — 이름이 없다는 사실이 여기까지 와야 합니다 */
  name: string | null | undefined;
  image?: string | null;
  /** 공용 `Avatar` 의 크기 그대로(`sm` 24px · `default` 32px · `lg` 40px) */
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={cn("shrink-0", className)}>
      {/* 사진이 죽어도 깨진 이미지가 안 나옵니다 — Radix 가 로드를 먼저 확인하고
          폴백으로 넘깁니다. `alt` 가 빈 것은 이름이 바로 옆 글자로 이미 있기
          때문입니다(두 번 읽히면 낭독기에서 이름이 겹칩니다). */}
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback className="text-[11px] font-bold">
        {initialOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
