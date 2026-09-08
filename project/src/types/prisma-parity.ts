import type { $Enums } from "@prisma/client";

import type {
  JobStatus,
  JobType,
  RelationType,
  ResourceStatus,
  ResourceType,
  SourceChannel,
  UsageStatus,
  UserStatus,
} from "@/types";

/**
 * `@/types` 의 열거 타입이 **Prisma 스키마와 같은가.**
 *
 * ## 왜 손으로 적어 두는가
 *
 * `@/types` 는 화면·서버가 함께 읽는 DTO 계층입니다. 여기서 `@prisma/client` 를
 * 값으로 끌어오면 **클라이언트 번들에 Prisma 런타임이 들어옵니다.** 그래서
 * 유니온을 손으로 적었는데 — 손으로 적은 것은 **갈라집니다.**
 *
 * ## 그래서 «타입으로» 대조합니다
 *
 * 이 파일은 `import type` 만 씁니다. **런타임에 아무것도 남지 않고**
 * `npm run typecheck` 이(이미 `verify` 에 있습니다) 어긋남을 잡습니다 —
 * 검사 스크립트를 하나도 늘리지 않습니다.
 *
 * 스키마에 값을 더하거나 이름을 바꾸면 **여기서 컴파일이 실패**하고,
 * 그때 `@/types` 를 고치면 됩니다. 조용히 갈라지지 않습니다.
 *
 * > `JobType` 과 `RelationType` 을 `P6` 에서 새로 적으면서 이 구멍이
 * > **세 번째**가 됐습니다(`ResourceType`·`UserStatus`… 은 처음부터 있었습니다).
 * > 규칙을 「기억하기」로 두지 않고 기계에 넘깁니다.
 */

/** 양방향 포함 관계 — 한쪽만 보면 «빠진 값»을 못 잡습니다 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

type _UserStatus = Same<UserStatus, $Enums.UserStatus>;
type _ResourceType = Same<ResourceType, $Enums.ResourceType>;
type _ResourceStatus = Same<ResourceStatus, $Enums.ResourceStatus>;
type _SourceChannel = Same<SourceChannel, $Enums.SourceChannel>;
type _UsageStatus = Same<UsageStatus, $Enums.UsageStatus>;
type _RelationType = Same<RelationType, $Enums.RelationType>;
type _JobType = Same<JobType, $Enums.JobType>;
type _JobStatus = Same<JobStatus, $Enums.JobStatus>;

/**
 * `type` 선언만으로는 «쓰이지 않은 타입»이라 검사가 안 도는 컴파일러 설정이
 * 있을 수 있습니다. **실제로 쓰는 값**을 하나 두어 확실히 계산되게 합니다 —
 * 어긋나면 `never` 라 `true` 를 대입할 수 없어 여기서 실패합니다.
 */
export const ENUMS_MATCH: [
  _UserStatus,
  _ResourceType,
  _ResourceStatus,
  _SourceChannel,
  _UsageStatus,
  _RelationType,
  _JobType,
  _JobStatus,
] = [true, true, true, true, true, true, true, true];
