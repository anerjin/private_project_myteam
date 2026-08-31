import { db } from "@/lib/db";
import * as githubService from "@/server/services/github.service";
import * as resourceService from "@/server/services/resource.service";

async function main() {
  const u = await db.user.findFirstOrThrow({
    where: { username: "master" },
    select: { id: true, role: true, username: true, name: true },
  });
  const actor = { id: u.id, role: u.role, username: u.username };

  const r = await resourceService.getBySlug(
    "gdal-래스터-벡터-변환의-사실상-표준",
    u.id,
    u.role
  );
  console.log("자료:", r.title, r.detail.type);
  if (r.detail.type === "GITHUB_REPO") {
    console.log("  defaultBranch:", r.detail.defaultBranch);
    console.log("  stars:", r.detail.stars);
  }

  const view = await githubService.repoView(r.id, actor as never);
  console.log("파일:", view.files.length, "README:", view.readme?.length ?? 0);
  console.log("앞 3개:", JSON.stringify(view.files.slice(0, 3)));

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("터졌습니다:", e);
  await db.$disconnect();
  process.exit(1);
});
