/**
 * `neowave-work-collect` Skill 자신을 Neowave Work 에 등록한다 (`FR-CLI-009` · M3 DoD 「자기 참조」).
 *
 *   npm run seed:collect-skill
 *
 * ## 왜 스크립트인가
 *
 * `SKILL.md` 는 **저장소가 원본**입니다. 사람이 화면에서 붙여넣으면 파일을 고칠
 * 때마다 자료가 낡고, 어느 쪽이 최신인지 알 수 없게 됩니다. 이 스크립트를
 * 다시 돌리면 **본문이 파일과 같아집니다** — 원본은 한 곳입니다.
 *
 * ## 두 번 돌려도 두 개가 되지 않습니다
 *
 * 같은 `skillName` 의 자료가 있으면 **수정**합니다. 사내 자산이라 URL 이 없어
 * 중복 URL 규칙(`FR-RES-011`)이 잡아 주지 못합니다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseResourceInput } from "@/features/resources/form.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import * as resourceWrite from "@/server/services/resource.write";

const SKILL_NAME = "neowave-work-collect";
const SKILL_PATH = path.join(
  process.cwd(),
  "packages",
  "mcp-server",
  "skills",
  SKILL_NAME,
  "SKILL.md"
);

async function main() {
  const body = readFileSync(SKILL_PATH, "utf8");

  /*
   * **등록자는 실제 계정입니다.** 「시스템」 같은 가짜 작성자를 만들지 않습니다 —
   * 자료마다 「누구에게 물으면 되는가」가 있어야 하고, 가짜 계정은 그 답이
   * 될 수 없습니다.
   */
  const owner = await db.user.findFirst({
    // 🔄 `role: { in: ["ADMIN", "EDITOR"] }` 로 골랐습니다 (`DEC-077` 로 등급 없음)
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true },
  });
  if (!owner) {
    throw new Error(
      "ACTIVE 인 ADMIN·EDITOR 계정이 없습니다. 관리자 계정을 먼저 만들어 주세요."
    );
  }
  const actor: Actor = {
    id: owner.id,
    username: owner.username,
    via: "WEB",
  };

  const input = parseResourceInput({
    type: "SKILL",
    title: "Neowave Work 자료 수집 Skill (neowave-work-collect)",
    summary:
      "웹에서 찾은 AI·개발 자료를 Neowave Work 에 등록하는 절차와 품질 규칙을 담은 Claude Code Skill",
    body,
    category: "dev-tools",
    tags: "neowave-work, mcp, skill, 자료수집",
    skillName: SKILL_NAME,
    definition:
      "웹 검색 → 후보 선별 → 중복 확인 → 요약 → 분류 → 등록의 절차와, applicability 를 비워 두지 않는다·한 대화 10건 이하 같은 품질 규칙을 정의한다.",
    triggerCondition:
      "「○○ 관련 자료 찾아서 등록해줘」, 「이 저장소 Neowave Work 에 넣어줘」, 「applicability 비어 있는 자료 채워줘」 같은 요청을 받았을 때.",
    usageExample:
      "MCP 서버 보안 관련 자료 최근 6개월 것으로 찾아서 Neowave Work에 등록해줘",
    targetClients: "Claude Code",
    usageStatus: "ADOPTED",
    version: "0.1.0",
  });

  if (!input.ok) {
    console.error("입력이 스키마를 통과하지 못했습니다:", input.fieldErrors);
    process.exit(1);
  }

  const existing = await db.skill.findFirst({
    where: { skillName: SKILL_NAME, resource: { deletedAt: null } },
    select: { resourceId: true },
  });

  if (existing) {
    const r = await resourceWrite.update(
      actor,
      existing.resourceId,
      input.data
    );
    console.log(`갱신했습니다 — /resources/skill/${r.slug}`);
  } else {
    const r = await resourceWrite.create(actor, input.data);
    console.log(`등록했습니다 — /resources/skill/${r.slug}`);
  }
  console.log(`등록자: ${owner.name} (${owner.username})`);
}

main()
  .catch((e) => {
    console.error(e instanceof AppError ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
