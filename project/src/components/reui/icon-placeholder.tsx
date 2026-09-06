import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  MinusIcon,
  PlusIcon,
  RepeatIcon,
  type LucideProps,
} from "lucide-react";

/**
 * ReUI 간트가 부르는 아이콘 어댑터 — **우리가 쓴 것**입니다.
 *
 * ## 왜 우리가 쓰는가
 *
 * ReUI 레지스트리의 간트 파일들은 `@/app/(create)/components/icon-placeholder`
 * 를 임포트합니다. 그건 **ReUI 자기 사이트의 경로**가 레지스트리에 새어
 * 나온 것이고, 우리 저장소에는 없습니다 — 그대로 두면 임포트가 깨집니다.
 *
 * 그쪽 원본은 아이콘 라이브러리 다섯 벌(lucide·tabler·hugeicons·phosphor·
 * remixicon) 중 프로젝트가 고른 것을 그립니다. **우리는 lucide 하나만
 * 씁니다**(운영자 규칙) — 그래서 나머지 이름은 받기만 하고 버립니다.
 * 받는 것조차 안 하면 간트 파일을 손봐야 하고, 그러면 판올림할 때마다
 * 같은 손질을 되풀이합니다.
 *
 * ## 배럴로 가져오지 않습니다
 *
 * `import * as icons from "lucide-react"` 한 줄이면 이름으로 찾을 수 있지만,
 * 그러면 **아이콘 1,500개가 통째로 번들에 실립니다** — 트리 셰이킹이 죽습니다.
 * 간트가 실제로 부르는 것은 아홉 개뿐이라(측정) 손으로 잇습니다.
 *
 * 없는 이름이 오면 **아무것도 안 그립니다.** 깨진 자리에 네모를 그리면
 * 그게 디자인인 줄 압니다.
 */

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  MinusIcon,
  PlusIcon,
  RepeatIcon,
};

/**
 * 다른 라이브러리 이름들 — 받기만 하고 **아래로 넘기지 않습니다.**
 *
 * 그대로 넘기면 `<svg tabler="IconRepeat">` 처럼 **DOM 에 없는 속성**이
 * 붙어 브라우저가 콘솔에 경고를 찍습니다.
 */
const OTHER_LIBS = ["tabler", "hugeicons", "phosphor", "remixicon"];

export function IconPlaceholder({
  lucide,
  ...props
}: LucideProps & {
  lucide: string;
  tabler?: string;
  hugeicons?: string;
  phosphor?: string;
  remixicon?: string;
}) {
  const Icon = ICONS[lucide];
  if (!Icon) return null;

  /*
   * 이름을 지어 버리지 않고 **키로 걸러 냅니다.** `tabler: _tabler` 처럼
   * 받아 두면 「안 쓰는 변수」로 잡히고, 그걸 끄려고 규칙을 손대면 진짜
   * 안 쓰는 변수도 함께 안 보이게 됩니다.
   */
  const rest = Object.fromEntries(
    Object.entries(props).filter(([k]) => !OTHER_LIBS.includes(k))
  ) as LucideProps;

  return <Icon {...rest} />;
}
