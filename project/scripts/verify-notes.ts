/**
 * 개인 메모 검증 (`FR-NOTE-001`~`004`).
 *
 *   npm run verify:notes
 *
 * ## 이 검사가 있는 이유
 *
 * 이 기능의 요구사항은 한 줄로 줄이면 **「나만 본다」**입니다. 그런데 그건
 * 화면을 열어 봐서는 확인할 수 없습니다 — 내 메모만 보이는 화면은 **남의
 * 메모가 새는 코드에서도 똑같이 보입니다.** 내 계정으로만 보고 있으니까요.
 *
 * 그래서 **사람을 둘 만들고 서로의 것을 집어 봅니다.** 그게 유일한 확인
 * 방법입니다.
 *
 * ## 관리자도 못 봅니다
 *
 * 이 시스템의 다른 곳은 대개 `EDITOR`·`ADMIN` 에게 더 보여 줍니다
 * (`draftScope`). 여기는 아닙니다 — 운영자가 「나만 보는 노트」라고 정했고,
 * 예외가 하나 있으면 그건 「나만」이 아닙니다. **관리자로도 집어 봅니다.**
 */
import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/server/auth/password";
import * as memberService from "@/server/services/member.service";
import * as noteService from "@/server/services/note.service";
import type { Role } from "@/types";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label}${detail ? " — " + detail : ""}`
  );
  if (ok) pass++;
  else fail++;
}

const madeUsers: string[] = [];

async function mkUser(tag: string, role: Role = "MEMBER") {
  const u = await db.user.create({
    data: {
      username: `vnote_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: await hashPassword("Verify!12345"),
      name: `노트검증-${tag}`,
      status: "ACTIVE",
      role,
    },
    select: { id: true, username: true, role: true },
  });
  madeUsers.push(u.id);
  return u;
}

/** 던져야 하는 자리에서 던졌는가 */
async function throwsNotFound(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof AppError && e.code === "NOT_FOUND";
  }
}

async function main() {
  console.log("\n★ 나의 노트 — 만들고 읽고 고치고 지운다 (FR-NOTE-001·002·003)");

  const me = await mkUser("me");
  const other = await mkUser("other");
  const admin = await mkUser("admin", "ADMIN");

  const made = await noteService.create(me.id, {
    title: "좌표계 변환 메모",
    body: "EPSG:5186 ↔ WGS84 는 pyproj 로.",
  });
  check("만들어진다", Boolean(made.id));

  const read = await noteService.get(made.id, me.id);
  check("읽힌다", read.title === "좌표계 변환 메모", read.title);
  check("본문이 그대로다", read.body.includes("pyproj"));

  const list = await noteService.listFor(me.id);
  check("목록에 나온다", list.some((n) => n.id === made.id), `${list.length}건`);
  check(
    "목록에는 본문 «일부»만 싣는다",
    list[0]?.excerpt.length <= 120,
    "목록에 20,000자를 실어 보내지 않는다"
  );

  await noteService.update(made.id, me.id, { title: "고친 제목", body: "고침" });
  const after = await noteService.get(made.id, me.id);
  check("고쳐진다", after.title === "고친 제목", after.title);

  /*
   * ★ **여기가 이 기능의 요구사항입니다.**
   *
   * 남의 메모를 «못 본다»가 아니라 **없는 것처럼 보인다**여야 합니다.
   * 「권한이 없습니다」로 답하면 그 id 가 존재한다는 사실이 새어 나갑니다.
   */
  console.log("\n★ 나만 본다 — 남도, 관리자도 (FR-NOTE-001)");

  check(
    "남은 못 읽는다",
    await throwsNotFound(() => noteService.get(made.id, other.id))
  );
  check(
    "남은 못 고친다",
    await throwsNotFound(() =>
      noteService.update(made.id, other.id, { title: "가로채기", body: "" })
    )
  );
  check(
    "남은 못 버린다",
    await throwsNotFound(() => noteService.moveToTrash(made.id, other.id))
  );
  check(
    "남의 목록에 안 뜬다",
    (await noteService.listFor(other.id)).length === 0
  );

  /*
   * **관리자도 예외가 없습니다.** service 가 `Actor` 가 아니라 `ownerId` 만
   * 받으므로 역할로 분기할 자리 자체가 없습니다 — 그래도 «실제로» 그런지는
   * 불러 봐야 압니다.
   */
  check(
    "관리자도 못 읽는다",
    await throwsNotFound(() => noteService.get(made.id, admin.id)),
    "다른 곳과 달리 여기는 ADMIN 예외가 없다"
  );
  check(
    "관리자 목록에도 안 뜬다",
    (await noteService.listFor(admin.id)).length === 0
  );

  // 가로채기 시도 뒤에도 원본이 멀쩡한가 — 「막았다」와 「안 바뀌었다」는 다릅니다
  const stillMine = await noteService.get(made.id, me.id);
  check("가로채기 뒤에도 그대로다", stillMine.title === "고친 제목");

  /*
   * ★ **제목도 새면 안 됩니다.**
   *
   * 빵부스러기는 인가를 지나지 않는 자리입니다 — `/notes/{id}` 의 `id` 를
   * 사람이 읽는 이름으로 바꾸느라 제목을 찾습니다. 거기서 `ownerId` 를
   * 빼면 **본문은 못 봐도 제목은** 주소창 밑에 뜹니다.
   */
  check("내 빵부스러기에는 제목이 나온다", (await noteService.titleFor(made.id, me.id)) === "고친 제목");
  check(
    "남의 빵부스러기에는 안 나온다",
    (await noteService.titleFor(made.id, other.id)) === null,
    "본문을 막아도 제목이 새면 막은 것이 아니다"
  );
  check(
    "관리자 빵부스러기에도 안 나온다",
    (await noteService.titleFor(made.id, admin.id)) === null
  );

  /*
   * ★ **휴지통** (`FR-NOTE-003`·`005`).
   *
   * 처음에는 「지우면 끝」이었습니다. 그러다 정리 스크립트의 조건 없는
   * `deleteMany({})` 로 운영자가 쓴 메모가 사라졌고, **되돌릴 길이 하나도
   * 없었습니다** — 휴지통도 없고 백업은 표가 생기기 전 것뿐이었습니다.
   *
   * 그래서 이 검사는 「지워졌는가」가 아니라 **「되살릴 수 있는가」**를 봅니다.
   */
  console.log("\n★ 휴지통 — 지운 것을 되살릴 수 있다 (FR-NOTE-003·005)");
  await noteService.moveToTrash(made.id, me.id);
  check(
    "버리면 목록에서 사라진다",
    (await noteService.listFor(me.id)).every((n) => n.id !== made.id)
  );
  check(
    "버린 것은 열리지 않는다",
    await throwsNotFound(() => noteService.get(made.id, me.id)),
    "되살린 뒤에 엽니다"
  );
  check(
    "휴지통에는 있다",
    (await noteService.listTrash(me.id)).some((n) => n.id === made.id)
  );
  check("휴지통 수를 센다", (await noteService.countTrash(me.id)) === 1);
  check(
    "본 목록 수에는 안 들어간다",
    (await noteService.countFor(me.id)) === 0
  );

  // **행은 남아 있어야 합니다** — 이것이 휴지통의 전부입니다
  const trashed = await db.note.findUnique({ where: { id: made.id } });
  check("행은 남아 있다", trashed !== null && trashed.deletedAt !== null);

  check(
    "남은 남의 휴지통을 못 본다",
    (await noteService.listTrash(other.id)).length === 0
  );
  check(
    "남은 되살리지 못한다",
    await throwsNotFound(() => noteService.restore(made.id, other.id))
  );
  check(
    "관리자도 되살리지 못한다",
    await throwsNotFound(() => noteService.restore(made.id, admin.id))
  );

  await noteService.restore(made.id, me.id);
  check(
    "되살리면 돌아온다",
    (await noteService.get(made.id, me.id)).title === "고친 제목"
  );
  check("휴지통이 비었다", (await noteService.countTrash(me.id)) === 0);

  /*
   * **영구 삭제는 휴지통에서만** 합니다. 목록에서 바로 지우는 길을 두지
   * 않는 것이 휴지통의 요점입니다 — 두면 없는 것과 같습니다.
   */
  check(
    "살아 있는 메모는 영구 삭제되지 않는다",
    await throwsNotFound(() => noteService.purge(made.id, me.id)),
    "휴지통을 거쳐야 합니다"
  );

  await noteService.moveToTrash(made.id, me.id);
  await noteService.purge(made.id, me.id);
  check(
    "휴지통에서 영구 삭제하면 행이 사라진다",
    (await db.note.findUnique({ where: { id: made.id } })) === null
  );

  // 휴지통 비우기 — 내 것만
  const mineA = await noteService.create(me.id, { title: "비울 것 1", body: "" });
  const mineB = await noteService.create(me.id, { title: "비울 것 2", body: "" });
  const theirs = await noteService.create(other.id, { title: "남의 것", body: "" });
  await noteService.moveToTrash(mineA.id, me.id);
  await noteService.moveToTrash(mineB.id, me.id);
  await noteService.moveToTrash(theirs.id, other.id);
  const purged = await noteService.emptyTrash(me.id);
  check("휴지통 비우기가 «내 것만» 지운다", purged === 2, `${purged}건`);
  check(
    "남의 휴지통은 그대로다",
    (await noteService.countTrash(other.id)) === 1,
    "조건 없는 삭제가 이 기능이 생긴 이유입니다"
  );
  await noteService.emptyTrash(other.id);

  console.log("\n★ 탈퇴하면 함께 사라진다 (FR-NOTE-004)");
  const leaver = await mkUser("leaver");
  await noteService.create(leaver.id, { title: "탈퇴할 사람의 메모", body: "x" });
  const willTrash = await noteService.create(leaver.id, {
    title: "두 번째",
    body: "y",
  });
  /*
   * **휴지통에 있는 것도 함께 지워져야 합니다.** 「지운 것」이라 안 지우면
   * 탈퇴한 사람의 메모가 표에 남습니다 — 소프트 삭제를 넣으면서 생기는
   * 전형적인 구멍입니다.
   */
  await noteService.moveToTrash(willTrash.id, leaver.id);
  check("탈퇴 전 — 본 목록 1건", (await noteService.countFor(leaver.id)) === 1);
  check("탈퇴 전 — 휴지통 1건", (await noteService.countTrash(leaver.id)) === 1);

  await memberService.transition(
    { id: admin.id, role: "ADMIN", username: admin.username, via: "WEB" },
    leaver.id,
    { kind: "WITHDRAW", reason: "노트 삭제 검증" }
  );
  check(
    "탈퇴하면 0건",
    (await noteService.countFor(leaver.id)) === 0,
    "컬렉션과 달리 «전부» 지웁니다 — 이어받을 사람이 없습니다"
  );
  check(
    "휴지통에 있던 것도 지워진다",
    (await db.note.count({ where: { ownerId: leaver.id } })) === 0,
    "「지운 것」이라 안 지우면 표에 남습니다"
  );

  /*
   * **다른 사람 것은 안 건드립니다.** 탈퇴 삭제가 `ownerId` 조건을 빠뜨리면
   * 한 사람이 나갈 때 모두의 메모가 사라집니다.
   */
  const survivorNote = await noteService.create(me.id, {
    title: "남아 있어야 하는 메모",
    body: "",
  });
  const leaver2 = await mkUser("leaver2");
  await noteService.create(leaver2.id, { title: "또 탈퇴", body: "" });
  await memberService.transition(
    { id: admin.id, role: "ADMIN", username: admin.username, via: "WEB" },
    leaver2.id,
    { kind: "WITHDRAW", reason: "노트 삭제 검증 2" }
  );
  check(
    "남의 탈퇴가 내 메모를 안 지운다",
    (await noteService.get(survivorNote.id, me.id)).title ===
      "남아 있어야 하는 메모"
  );

  console.log("\n★ 카탈로그에 섞이지 않는다");
  /*
   * 개인 메모가 자료 검색에 걸리면 **팀 전체가 보게 됩니다.** 표가 아예
   * 다르므로 지금은 섞일 수 없지만, 「나중에 검색에도 넣자」가 되는 날
   * 이 검사가 그 뜻을 다시 말해 줍니다.
   */
  const resourceCount = await db.resource.count({
    where: { title: { contains: "남아 있어야 하는 메모" } },
  });
  check("메모가 자료 표에 생기지 않는다", resourceCount === 0);
}

main()
  .then(async () => {
    // 검증은 자기가 만든 것을 치웁니다 — 메모는 계정과 함께 사라집니다(FK CASCADE)
    await db.user.deleteMany({ where: { id: { in: madeUsers } } });
    console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
    await db.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error(e);
    await db.user.deleteMany({ where: { id: { in: madeUsers } } }).catch(() => {});
    await db.$disconnect();
    process.exit(1);
  });
