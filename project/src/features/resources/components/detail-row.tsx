import type { ReactNode } from "react";

/** 타입별 상세 블록에서 공통으로 쓰는 라벨-값 한 줄 */
export function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <dt className="text-muted-foreground w-28 shrink-0 text-sm">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
