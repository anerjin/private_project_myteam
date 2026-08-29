import { cn } from "@/lib/utils";

/**
 * 콘텐츠 타입 배지의 **표현만** (`DEV-06 · 6.9`).
 *
 * ## 왜 `features/resources` 밖에 있는가
 *
 * 관리 화면(`features/admin`)과 컬렉션(`features/collections`)이 같은 배지를
 * 그립니다. 그쪽에서 `features/resources/components/badges` 를 import 하면
 * **`features/A → features/B`** 가 되고 `check-deps` 가 막습니다 —
 * 실제로 막혔습니다.
 *
 * 규칙이 말하는 답은 「공유가 필요하면 `components/common` 으로 올린다」이고,
 * **올릴 수 있는 것은 표현뿐**입니다. 레지스트리를 아는 부분까지 올리면
 * `components/common → features/resources` 가 되어 방향만 바뀝니다.
 *
 * 그래서 여기는 `label` 과 `className` 만 받습니다. 레지스트리에서 그 둘을
 * 꺼내는 일은 **부르는 쪽**이 합니다 — `features/resources` 는 `TypeBadge` 로,
 * 서버 화면은 이미 갖고 있는 값으로.
 */
export function TypeChip({
  label,
  className,
}: {
  label: string;
  /** 레지스트리의 `badgeClass` — 색을 여기서 정하지 않습니다 */
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        className
      )}
    >
      {label}
    </span>
  );
}
