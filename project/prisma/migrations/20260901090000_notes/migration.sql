-- 개인 메모 (`FR-NOTE-001`~`004`)
--
-- ## 왜 `resources` 가 아닌가
--
-- 자료는 **팀 카탈로그**입니다. 초안(`DRAFT`)조차 `EDITOR` 이상이 전부 봅니다
-- (`file.service.draftScope`) — 「나만 보는」을 그 위에 얹으면 노출 규칙이 둘이
-- 되고, 언젠가 한쪽만 고칩니다. 그 순간 남의 메모가 목록에 뜹니다.
--
-- ## 이 표에 «없는» 것들이 설계입니다
--
-- | 없는 것 | 왜 |
-- | --- | --- |
-- | `deleted_at` | 휴지통을 두지 않습니다. 지우면 그 순간 사라집니다 |
-- | 감사 로그 연결 | 개인 메모는 팀에 영향을 주지 않습니다 |
-- | 분류·태그·검색 | 카탈로그에 올리지 않습니다 |
-- | `visibility` | **언제나 비공개**입니다. 고를 수 있게 두면 실수로 공개됩니다 |
--
-- 인덱스도 하나뿐입니다 — 질의가 「내 것을 최근 수정순」 하나뿐이기 때문입니다.
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notes_owner_id_updated_at_idx" ON "notes"("owner_id", "updated_at" DESC);

ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
