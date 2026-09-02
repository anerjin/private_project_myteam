import { PawPrint } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AVATARS } from "@/features/avatars/catalog";
import { AvatarPlayground } from "@/features/avatars/components/avatar-playground";
import { requireActiveUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "아바타" };

/**
 * SCR-135 아바타 — 만들어 둔 캐릭터를 모아 두는 자리.
 *
 * ## 카드 하나가 곧 놀이터입니다
 *
 * 화면 위에 큰 놀이터를 따로 두면 **같은 강아지가 두 번** 나오고, 아바타가
 * 늘었을 때 「누가 놀이터에 있는가」를 또 골라야 합니다. 카드 안의 그림 자리를
 * 그대로 물리 상자로 만들면 아바타가 몇이 되든 규칙이 같습니다.
 *
 * ## 원판에 담지 않습니다
 *
 * `components/ui/avatar` 를 쓰지 않습니다. 그 컴포넌트는 그림을 **동그랗게
 * 자르고 테두리 링을 두르는** 것이 일인데, 여기 그림은 배경이 없는
 * **캐릭터 모양 자체**입니다. 원판에 넣으면 귀가 잘리고, 링까지 두르면
 * «액자 안의 액자»가 됩니다.
 *
 * 목록은 `features/avatars/catalog.ts` 가 정본입니다. DB 를 두지 않은 이유가
 * 그 파일 머리에 적혀 있습니다.
 */
export default async function AvatarsPage() {
  // 인가는 레이아웃이 아니라 page 가 한다 (`DEC-035`)
  await requireActiveUser();

  return (
    <>
      <PageHeader
        description="ip-as-logo 스킬로 만든 캐릭터입니다. 잡아서 던지면 물리대로 떨어집니다."
        count={AVATARS.length}
      />

      {AVATARS.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title="아직 만든 아바타가 없습니다"
          description="public/avatars 에 그림을 두고 features/avatars/catalog.ts 에 한 줄 추가하면 여기에 나옵니다."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AVATARS.map((avatar) => (
            <Card key={avatar.id}>
              <CardContent className="space-y-4">
                <AvatarPlayground src={avatar.src} name={avatar.name} />

                <div className="space-y-1 text-center">
                  <p className="font-medium">{avatar.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {avatar.description}
                  </p>
                </div>

                {/*
                  쓴 색을 그대로 보여 줍니다. 다음 아바타를 만들 때
                  「이 조합은 이미 썼다」를 눈으로 확인하는 자리입니다.
                */}
                <div className="flex items-center justify-center gap-1.5">
                  {avatar.colors.map((color) => (
                    <span
                      key={color}
                      className="size-4 rounded-full"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  <span className="text-muted-foreground ml-1 text-xs tabular-nums">
                    {avatar.createdAt}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
