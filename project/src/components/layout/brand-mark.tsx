import { Hexagon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * QueenBee 브랜드 마크.
 * 아이콘은 **lucide-react 만** 사용한다. 이모지를 아이콘으로 쓰지 않는다.
 * (DEV-04 · 4.5절 아이콘 규칙)
 */
export function BrandMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        "bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg",
        className
      )}
    >
      <Hexagon className={cn("size-4 fill-current", iconClassName)} />
    </div>
  );
}
