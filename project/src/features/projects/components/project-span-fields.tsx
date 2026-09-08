"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 시작·끝 **두 칸** — 기간을 적는 자리가 셋인데 칸은 하나입니다 (`DEC-075`).
 *
 * 쓰는 곳:
 *   ① 목록의 프로젝트 만들기·수정 폼 (`projects-view.tsx`)
 *   ② 상세 머리말의 「기간 수정」 (`project-span-edit.tsx`)
 *   ③ 간트의 「항목 추가」 대화 (`project-item-dialogs.tsx`)
 *
 * 🔴 **셋이 각자 세우면 안 됩니다.** 한 곳에만 「비울 수 있음」이 붙거나 한 곳만
 *    `min`/`max` 를 갖는 날이 오고, 그때 *"목록에서는 기간을 지울 수 있는데
 *    상세에서는 못 지운다"* 가 됩니다. 원본(Orbee)이 같은 이유로 이 조각을
 *    뽑았고, 거기서는 ①②만 썼습니다 — ③ 은 자기 칸을 따로 세우고 있었습니다.
 *    옮기면서 셋으로 합쳤습니다: 라벨도 규약도 같은 칸이 둘로 나뉘어 있을
 *    이유가 없습니다.
 *
 * 🔴 **파일이 따로 있는 이유는 모듈 그래프입니다.** 원본은 이 조각을 「기간
 *    수정」 대화와 **같은 파일**에 두었는데, 그러면 간트의 「항목 추가」 대화가
 *    그 대화의 **서버 액션까지 통째로** 끌고 들어옵니다. 이 파일에는 서버
 *    액션 import 가 하나도 없습니다 — `project-person.tsx` 를 따로 뺀 것과 같은
 *    근거입니다.
 *
 * ⚠️ **날짜 고르개를 새로 만들지 않았습니다.** 원본은 전용 `DatePicker` 를
 *    쓰는데 우리 `components/ui` 에는 그것이 없고, 이 저장소의 다른 폼들은 전부
 *    `<Input type="date">` 입니다. 여기만 팝오버 달력을 세우면 프로젝트 화면의
 *    날짜 칸이 저장소에서 혼자 다른 물건이 됩니다.
 * ⚠️ **비우는 길은 브라우저가 줍니다** — 네이티브 날짜 칸은 지우면 값이 `""`
 *    입니다. 그것이 「안 정함」이고, 저장 경계에서 `null` 이 됩니다
 *    (`schema.ts` 의 `ymdOrNull`).
 */

/** 폼이 다루는 값 — 양끝이고, `""` 는 **안 정함**입니다(저장할 때 `null` 이 됩니다) */
export interface ProjectSpanValue {
  start: string;
  end: string;
}

export function ProjectSpanFields({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  /**
   * 🔴 **`id` 를 부르는 쪽이 정합니다.** 한 화면에 이 조각이 둘 이상 붙을 수
   *    있고(만들기 대화와 수정 대화가 같은 트리에 삽니다), `id` 가 겹치면
   *    `<Label htmlFor>` 이 **먼저 나온 칸**을 가리켜 두 번째 칸의 라벨이 남의
   *    칸을 누릅니다.
   */
  idPrefix: string;
  value: ProjectSpanValue;
  onChange: (next: ProjectSpanValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3" data-slot="project-span-fields">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-start`}>시작</Label>
        <Input
          id={`${idPrefix}-start`}
          type="date"
          value={value.start}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-end`}>끝</Label>
        <Input
          id={`${idPrefix}-end`}
          type="date"
          value={value.end}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
        />
      </div>
    </div>
  );
}
