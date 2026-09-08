# Neowave Work

네오웨이브가 AI 자료 · GitHub 오픈소스 · MCP 서버 · Skill · 개발 참고 자료를
한곳에 모아 검색·재사용·보관하는 **사내 전용 정보 시스템**.

> **문서가 먼저입니다.** 코드를 쓰기 전에 [`_docs/README.md`](_docs/README.md) 를 읽으세요.
> 현재 단계와 다음 할 일이 거기 있습니다.

## 빠른 시작

```powershell
# 1) 컨테이너 (postgres · redis)
docker compose -f docker/docker-compose.dev.yml up -d

# 2) 환경 변수
Copy-Item .env.example project\.env      # 값을 채운 뒤 진행

# 3) 파일 저장 경로 (저장소 밖 — DEC-016)
New-Item -ItemType Directory -Force E:\neowave-work-data\files\tmp
New-Item -ItemType Directory -Force E:\neowave-work-data\files\attachments
New-Item -ItemType Directory -Force E:\neowave-work-data\files\archives

# 4) 앱 + DB 스키마
cd project
npm install
npx prisma migrate dev     # 스키마 적용
npx prisma db seed         # 분류·설정 시드 (여러 번 돌려도 안전)
npm run dev                # http://localhost:3100
```

> 서버를 **계속 띄워 두려면** `npm run dev` 대신 `npm run serve` 입니다 —
> VS Code 를 꺼도 삽니다 ([`OPS-01 · 1장`](_docs/04.운영/01_운영_안내.md)).

`http://localhost:3100/api/health` 가 `db`·`redis`·`storage`·`disk` 모두 `ok` 면 준비 끝입니다.

## 자주 쓰는 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 (**포트 3100 고정** — `DEC-028`). 터미널을 닫으면 함께 죽습니다 |
| `npm run serve` | **편집기를 꺼도 사는 서버** — 작업 스케줄러에 맡깁니다 (`OPS-01 · 1장`) |
| `npm run serve:status` / `serve:logs` / `serve:stop` | 살아 있는가 · 로그 · 내리기 |
| `npm run serve:install` | 이 PC 에 로그인하면 자동으로 뜨게 |
| `npm run verify` | typecheck · lint · **check:deps** · build. **페이즈 완료 기준** |
| `npm run check:deps` | 의존 방향 검사 (`DEV-06 · 6.9절`). 위반 0건이어야 한다 |
| `npm run check:guards` | **page 인가 가드 누락 검사** (`DEC-035`). 레이아웃이 아니라 page 가 막는다 |
| `npm run db:up` / `db:down` | 컨테이너 기동 / 정지 |
| `npm run format` | Prettier |
| `node _docs/_viewer/build.mjs` | 문서 뷰어 갱신 |

## 저장소 구조

```
doi_dev_team/
├─ _docs/       문서 — 요구사항 · 설계 · 의사결정 · 작업 기록
├─ project/     애플리케이션 (Next.js 16 + shadcn/ui)
├─ docker/      컨테이너 구성 (1단계는 postgres · redis 둘뿐)
└─ .env.example

E:\neowave-work-data\   DB · 파일 데이터 — 저장소 밖. 커밋하지 않는다
```

## 알아둘 것

- **포트는 3100 · 5433 · 6380** 입니다. 이 PC의 다른 프로젝트가 3000·5432·6379를 씁니다
  (`DEC-028`·`DEC-033`). **Docker 엔진이 꺼져 있으면 포트가 «비어 있음»으로 보이니**
  확인은 엔진을 켠 뒤 `docker ps` 로 하세요.
- **Prisma 는 7.10.0 고정**입니다 (`DEC-034`). `prisma@latest` 는 릴리스 후보를 물어옵니다.
  접속 URL은 스키마가 아니라 `prisma.config.ts`(CLI)와 driver adapter(런타임)에 있습니다.
- **Auth.js 를 쓰지 않습니다.** 세션은 자체 구현입니다 (`DEC-030`).
- **`proxy.ts` 는 낙관적 검사만** 합니다. 인가는 Server Action 진입부에서 합니다 (`DEC-031`).
- 아이콘은 **lucide-react 만** 씁니다. 이모지는 쓰지 않습니다 (`DEV-04 · 4.5절`).
