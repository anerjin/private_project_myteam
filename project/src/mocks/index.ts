/**
 * 주의: 목(mock) 데이터 — UI 확인용입니다.
 * 백엔드가 붙으면 이 폴더를 통째로 지우고 server/services 호출로 교체합니다.
 */
import type {
  ApiKey,
  AppNotification,
  AuditLog,
  Author,
  Collection,
  Job,
  Member,
  Resource,
} from "@/types";

export const currentUser: Author & { role: "ADMIN" } = {
  id: "u1",
  username: "jaehyun",
  name: "김재현",
  department: "개발팀",
  role: "ADMIN",
};

const A = {
  jaehyun: { id: "u1", username: "jaehyun", name: "김재현", department: "개발팀" },
  minsu: { id: "u2", username: "minsu", name: "박민수", department: "개발팀" },
  seoyeon: { id: "u3", username: "seoyeon", name: "이서연", department: "공간정보팀" },
  hyunwoo: { id: "u4", username: "hyunwoo", name: "정현우", department: "개발팀" },
} satisfies Record<string, Author>;

export const resources: Resource[] = [
  {
    id: "r1",
    type: "MCP_SERVER",
    slug: "filesystem-mcp",
    title: "Filesystem MCP Server",
    summary: "로컬 파일시스템을 읽고 쓰는 공식 MCP 서버. 사내 표준으로 채택.",
    url: "https://github.com/modelcontextprotocol/servers",
    status: "PUBLISHED",
    sourceChannel: "WEB",
    category: "ai-tools",
    tags: ["mcp", "filesystem", "표준"],
    author: A.jaehyun,
    viewCount: 142,
    bookmarkCount: 8,
    bookmarked: true,
    createdAt: "2026-08-12T09:00:00Z",
    updatedAt: "2026-08-20T11:30:00Z",
    body: "사내 모든 개발자가 기본으로 설치하는 MCP 서버입니다.\n\n접근 가능한 디렉터리를 인자로 제한할 수 있어, 프로젝트 폴더만 열어두고 쓰는 것을 권장합니다.",
    detail: {
      type: "MCP_SERVER",
      packageName: "@modelcontextprotocol/server-filesystem",
      transport: "STDIO",
      installCommand: "npx -y @modelcontextprotocol/server-filesystem",
      configJson: `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "E:/github"]
    }
  }
}`,
      envVars: [],
      providedTools: [
        { name: "read_file", description: "파일 내용을 읽는다" },
        { name: "write_file", description: "파일에 내용을 쓴다" },
        { name: "list_directory", description: "디렉터리 목록을 조회한다" },
      ],
      clientSupport: ["Claude Code", "Claude Desktop", "Cursor"],
      usageStatus: "ADOPTED",
    },
  },
  {
    id: "r2",
    type: "AI_MATERIAL",
    slug: "rag-eval-frameworks",
    title: "RAG 평가 프레임워크 비교 — RAGAS · TruLens · DeepEval",
    summary: "세 도구의 지표 구성과 도입 비용을 비교한 아티클.",
    url: "https://example.com/rag-eval-comparison",
    status: "PUBLISHED",
    sourceChannel: "MCP",
    category: "ai-model",
    tags: ["rag", "evaluation", "llm"],
    author: A.minsu,
    viewCount: 86,
    bookmarkCount: 5,
    createdAt: "2026-08-25T04:10:00Z",
    updatedAt: "2026-08-25T04:10:00Z",
    detail: {
      type: "AI_MATERIAL",
      materialKind: "ARTICLE",
      sourceName: "Example Engineering Blog",
      authors: ["Jane Doe"],
      publishedAt: "2026-08-10",
      language: "EN",
      readingTime: 12,
      keyPoints:
        "- RAGAS는 정답 데이터 없이도 faithfulness·answer relevancy를 측정\n- TruLens는 실행 추적과 함께 지표를 남겨 디버깅에 강함\n- DeepEval은 pytest 통합이 자연스러워 CI에 붙이기 쉬움",
      applicability:
        "드론 촬영 메타데이터 검색 품질 측정에 RAGAS의 context precision 지표를 먼저 적용해 볼 만함. CI 연동은 DeepEval 검토.",
    },
  },
  {
    id: "r3",
    type: "GITHUB_REPO",
    slug: "mcp-servers",
    title: "modelcontextprotocol/servers",
    summary: "MCP 공식 레퍼런스 서버 모음. 새 서버를 만들 때 구현 참고용.",
    url: "https://github.com/modelcontextprotocol/servers",
    status: "PUBLISHED",
    sourceChannel: "MCP",
    category: "ai-tools",
    tags: ["mcp", "reference", "typescript"],
    author: A.jaehyun,
    viewCount: 213,
    bookmarkCount: 12,
    bookmarked: true,
    createdAt: "2026-08-18T02:00:00Z",
    updatedAt: "2026-08-27T08:00:00Z",
    detail: {
      type: "GITHUB_REPO",
      owner: "modelcontextprotocol",
      repo: "servers",
      stars: 28400,
      forks: 3120,
      primaryLanguage: "TypeScript",
      license: "MIT",
      topics: ["mcp", "llm", "ai-agents"],
      pushedAt: "2026-08-26",
      latestRelease: "v0.9.2",
      archiveStatus: "DONE",
      archiveSizeBytes: 35_861_299,
      archivedSha: "a3f91c7",
      isGone: false,
    },
  },
  {
    id: "r4",
    type: "SKILL",
    slug: "queenbee-collect",
    title: "queenbee-collect — 자료 수집 Skill",
    summary: "웹 검색부터 QueenBee 등록까지의 절차와 품질 기준을 담은 Skill.",
    status: "PUBLISHED",
    sourceChannel: "WEB",
    category: "ai-tools",
    tags: ["skill", "수집", "표준"],
    author: A.jaehyun,
    viewCount: 64,
    bookmarkCount: 6,
    createdAt: "2026-08-22T06:00:00Z",
    updatedAt: "2026-08-26T01:20:00Z",
    detail: {
      type: "SKILL",
      skillName: "queenbee-collect",
      definition: `---
name: queenbee-collect
description: 주제를 받아 자료를 찾고 QueenBee에 등록한다
---

## 절차

1. 웹에서 후보를 찾는다 (공식 문서·논문 원문 우선)
2. \`queenbee_check_duplicate\` 로 중복을 확인한다
3. 요약과 **사내 적용 아이디어**를 작성한다
4. \`queenbee_create_resource\` 로 등록한다

## 품질 규칙

- 2차 요약 기사만으로 등록하지 않는다
- \`applicability\` 를 비워두지 않는다
- 한 대화에서 10건을 넘기지 않는다`,
      triggerCondition:
        "사용자가 특정 주제의 자료를 찾아 QueenBee에 등록해 달라고 요청할 때",
      usageExample: '"MCP 서버 보안 관련 자료 최근 6개월 것으로 찾아서 등록해줘"',
      targetClients: ["Claude Code"],
      usageStatus: "ADOPTED",
      version: "1.0.0",
    },
  },
  {
    id: "r5",
    type: "DEV_NOTE",
    slug: "windows-docker-volume-issue",
    title: "Windows Docker Desktop 볼륨 성능 문제",
    summary:
      "프로젝트 폴더에 바인드 마운트하면 Postgres가 눈에 띄게 느려지는 문제와 해결.",
    status: "PUBLISHED",
    sourceChannel: "WEB",
    category: "dev",
    tags: ["docker", "windows", "postgres"],
    author: A.hyunwoo,
    viewCount: 47,
    bookmarkCount: 3,
    createdAt: "2026-08-24T07:30:00Z",
    updatedAt: "2026-08-24T07:30:00Z",
    body: `## 증상

WSL2 백엔드에서 **프로젝트 폴더를 바인드 마운트**했더니 Prisma 마이그레이션이 10배 느려졌다.

| 구성 | 마이그레이션 소요 |
| --- | --- |
| 바인드 마운트 | 42초 |
| named volume | 4초 |

## 원인

윈도우 파일시스템과 WSL2 사이의 9p 프로토콜 오버헤드. 파일 하나당 왕복이 생긴다.

## 해결

named volume 또는 WSL2 파일시스템 내부 경로를 쓴다.

\`\`\`yaml
services:
  postgres:
    volumes:
      - queenbee-pg:/var/lib/postgresql/data   # 바인드 마운트 대신
volumes:
  queenbee-pg:
\`\`\`

### 확인 방법

\`docker system df -v\` 로 볼륨이 실제로 잡혔는지 본다.

> 프로젝트 폴더에 데이터를 두지 않는 규칙은 [DEV-01](https://example.com/dev-01) 에도 적어 두었다.`,
    detail: {
      type: "DEV_NOTE",
      noteKind: "TROUBLESHOOT",
      relatedProject: "QueenBee",
      occurredAt: "2026-08-24",
    },
  },
  {
    id: "r6",
    type: "AI_MATERIAL",
    slug: "sam2-segmentation",
    title: "SAM 2 — 이미지·영상 통합 세그멘테이션 모델",
    summary: "Meta의 세그멘테이션 모델. 영상 프레임 간 객체 추적을 지원.",
    url: "https://arxiv.org/abs/2408.00714",
    status: "PUBLISHED",
    sourceChannel: "MCP",
    category: "geospatial",
    tags: ["vision", "segmentation", "드론"],
    author: A.seoyeon,
    viewCount: 178,
    bookmarkCount: 14,
    bookmarked: true,
    createdAt: "2026-08-19T05:00:00Z",
    updatedAt: "2026-08-19T05:00:00Z",
    detail: {
      type: "AI_MATERIAL",
      materialKind: "PAPER",
      sourceName: "arXiv",
      authors: ["Nikhila Ravi", "et al."],
      publishedAt: "2026-08-01",
      language: "EN",
      readingTime: 35,
      keyPoints:
        "- 이미지·영상을 하나의 모델로 처리\n- 메모리 어텐션으로 프레임 간 객체를 추적\n- 프롬프트(점·박스·마스크) 기반 인터랙션",
      applicability:
        "드론 촬영 영상에서 건물·도로 마스크를 자동 추출해 도면화 전처리에 활용 가능. 촬영 고도별 정확도 검증 필요.",
    },
  },
  {
    id: "r7",
    type: "GITHUB_REPO",
    slug: "open-drone-map",
    title: "OpenDroneMap/ODM",
    summary: "드론 사진에서 포인트클라우드·정사영상·DSM을 생성하는 오픈소스 툴킷.",
    url: "https://github.com/OpenDroneMap/ODM",
    status: "PUBLISHED",
    sourceChannel: "WEB",
    category: "geospatial",
    tags: ["photogrammetry", "드론", "pointcloud"],
    author: A.seoyeon,
    viewCount: 305,
    bookmarkCount: 19,
    createdAt: "2026-07-30T01:00:00Z",
    updatedAt: "2026-08-26T09:00:00Z",
    detail: {
      type: "GITHUB_REPO",
      owner: "OpenDroneMap",
      repo: "ODM",
      stars: 5100,
      forks: 1180,
      primaryLanguage: "Python",
      license: "AGPL-3.0",
      topics: ["photogrammetry", "drone", "gis"],
      pushedAt: "2026-08-21",
      latestRelease: "v3.5.4",
      archiveStatus: "DONE",
      archiveSizeBytes: 134_951_731,
      archivedSha: "9c41ba0",
      isGone: false,
    },
  },
  {
    id: "r8",
    type: "MCP_SERVER",
    slug: "postgres-mcp",
    title: "PostgreSQL MCP Server",
    summary: "읽기 전용으로 DB 스키마와 데이터를 조회하는 MCP 서버. 검토 중.",
    url: "https://github.com/modelcontextprotocol/servers",
    status: "PUBLISHED",
    sourceChannel: "WEB",
    category: "ai-tools",
    tags: ["mcp", "postgres", "database"],
    author: A.minsu,
    viewCount: 58,
    bookmarkCount: 4,
    createdAt: "2026-08-21T03:00:00Z",
    updatedAt: "2026-08-21T03:00:00Z",
    detail: {
      type: "MCP_SERVER",
      packageName: "@modelcontextprotocol/server-postgres",
      transport: "STDIO",
      installCommand: "npx -y @modelcontextprotocol/server-postgres",
      configJson: `{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": { "DATABASE_URL": "postgresql://..." }
    }
  }
}`,
      envVars: [
        {
          key: "DATABASE_URL",
          description: "접속 문자열. 읽기 전용 계정을 쓸 것",
          required: true,
          example: "postgresql://<user>:<pw>@<host>:5432/<db>",
        },
      ],
      providedTools: [
        { name: "query", description: "읽기 전용 SQL 실행" },
        { name: "list_schemas", description: "스키마 목록 조회" },
      ],
      clientSupport: ["Claude Code", "Cursor"],
      usageStatus: "REVIEWING",
    },
  },
  {
    id: "r9",
    type: "AI_MATERIAL",
    slug: "agent-context-engineering",
    title: "에이전트 컨텍스트 엔지니어링 실전 가이드",
    summary: "긴 대화에서 컨텍스트를 압축·선별하는 패턴 정리.",
    url: "https://example.com/context-engineering",
    status: "PUBLISHED",
    sourceChannel: "MCP",
    category: "ai-tools",
    tags: ["agent", "context", "prompt"],
    author: A.jaehyun,
    viewCount: 121,
    bookmarkCount: 9,
    createdAt: "2026-08-16T08:00:00Z",
    updatedAt: "2026-08-23T02:00:00Z",
    detail: {
      type: "AI_MATERIAL",
      materialKind: "ARTICLE",
      sourceName: "Anthropic Engineering",
      publishedAt: "2026-07-28",
      language: "EN",
      readingTime: 18,
      keyPoints:
        "- 도구 결과는 요약해서 넣고 원본은 파일로 남긴다\n- 서브에이전트로 탐색 결과만 회수한다\n- 상태를 외부 파일에 기록해 컨텍스트를 비운다",
      applicability:
        "QueenBee CLI 수집 Skill에서 웹 본문 전체 대신 요약만 컨텍스트에 남기는 규칙으로 반영.",
    },
  },
  {
    id: "r10",
    type: "DEV_NOTE",
    slug: "queenbee-naming-convention",
    title: "QueenBee 코드 네이밍 규약",
    summary: "폴더·파일·액션·서비스 네이밍 규칙 요약.",
    status: "PUBLISHED",
    sourceChannel: "WEB",
    category: "internal",
    tags: ["규약", "온보딩"],
    author: A.jaehyun,
    viewCount: 39,
    bookmarkCount: 7,
    createdAt: "2026-08-26T00:30:00Z",
    updatedAt: "2026-08-26T00:30:00Z",
    body: "폴더는 kebab-case, 컴포넌트 파일도 kebab-case, 컴포넌트 이름은 PascalCase.\n\nServer Action은 `동사+명사+Action`, service는 `*.service.ts`.",
    detail: {
      type: "DEV_NOTE",
      noteKind: "CONVENTION",
      relatedProject: "QueenBee",
    },
  },
  {
    id: "r11",
    type: "GITHUB_REPO",
    slug: "pdal",
    title: "PDAL/PDAL",
    summary: "포인트클라우드 처리 파이프라인 라이브러리. 좌표 변환·필터링에 사용.",
    url: "https://github.com/PDAL/PDAL",
    status: "PUBLISHED",
    sourceChannel: "WEB",
    category: "geospatial",
    tags: ["pointcloud", "gis", "c++"],
    author: A.seoyeon,
    viewCount: 92,
    bookmarkCount: 5,
    createdAt: "2026-08-14T04:00:00Z",
    updatedAt: "2026-08-14T04:00:00Z",
    detail: {
      type: "GITHUB_REPO",
      owner: "PDAL",
      repo: "PDAL",
      stars: 1210,
      forks: 540,
      primaryLanguage: "C++",
      license: "BSD-3-Clause",
      topics: ["pointcloud", "lidar", "gis"],
      pushedAt: "2026-08-11",
      archiveStatus: "NONE",
      isGone: false,
    },
  },
  {
    id: "r12",
    type: "SKILL",
    slug: "code-review",
    title: "code-review — 변경분 리뷰 Skill",
    summary: "현재 diff를 정확성·단순화 관점에서 리뷰하는 사내 Skill.",
    status: "PUBLISHED",
    sourceChannel: "WEB",
    category: "dev",
    tags: ["skill", "리뷰", "품질"],
    author: A.hyunwoo,
    viewCount: 71,
    bookmarkCount: 8,
    createdAt: "2026-08-11T02:00:00Z",
    updatedAt: "2026-08-25T05:00:00Z",
    detail: {
      type: "SKILL",
      skillName: "code-review",
      definition: `---
name: code-review
description: 변경분을 정확성·중복·단순화 관점에서 점검한다
---

## 점검 순서

1. \`git diff\` 로 변경 범위를 파악한다
2. 정확성 → 재사용 → 단순화 순으로 본다
3. 확신이 서는 것만 보고한다

## 하지 않는 것

- 취향에 가까운 스타일 지적
- 변경과 무관한 파일 리뷰`,
      triggerCondition: "PR 올리기 전 변경분 점검을 요청할 때",
      usageExample: '"지금 변경분 리뷰해줘"',
      targetClients: ["Claude Code"],
      usageStatus: "ADOPTED",
      version: "2.1.0",
    },
  },
  {
    id: "r13",
    type: "AI_MATERIAL",
    slug: "nerf-vs-gaussian-splatting",
    title: "NeRF vs 3D Gaussian Splatting 실무 비교",
    summary: "재구성 품질과 학습 시간을 드론 촬영 데이터 기준으로 비교한 영상.",
    url: "https://www.youtube.com/watch?v=example",
    status: "PUBLISHED",
    sourceChannel: "MCP",
    category: "geospatial",
    tags: ["3d", "reconstruction", "드론"],
    author: A.seoyeon,
    viewCount: 156,
    bookmarkCount: 11,
    createdAt: "2026-08-23T09:00:00Z",
    updatedAt: "2026-08-23T09:00:00Z",
    detail: {
      type: "AI_MATERIAL",
      materialKind: "VIDEO",
      sourceName: "YouTube · 3D Vision Weekly",
      publishedAt: "2026-08-05",
      language: "EN",
      readingTime: 24,
      keyPoints:
        "- Gaussian Splatting이 학습은 10배 빠르고 렌더링은 실시간\n- NeRF가 반사·투명 표면에서 여전히 우위\n- 드론 데이터는 카메라 포즈 정확도가 결과를 좌우",
      applicability:
        "건물 외관 3D 재구성 파이프라인에 Gaussian Splatting 우선 검토. ODM 결과의 카메라 포즈를 그대로 쓸 수 있는지 확인 필요.",
    },
  },
  {
    id: "r15",
    type: "PROMPT",
    slug: "release-note-writer",
    title: "릴리스 노트 초안 작성 프롬프트",
    summary: "커밋 목록을 붙여넣으면 사용자용 릴리스 노트 초안을 만들어 준다.",
    status: "PUBLISHED",
    sourceChannel: "WEB",
    category: "ai-tools",
    tags: ["prompt", "릴리스", "문서화"],
    author: A.hyunwoo,
    viewCount: 33,
    bookmarkCount: 5,
    createdAt: "2026-08-27T04:00:00Z",
    updatedAt: "2026-08-27T04:00:00Z",
    detail: {
      type: "PROMPT",
      useCase: "릴리스 노트 초안 작성",
      targetModel: "Claude",
      usageStatus: "ADOPTED",
      promptText: `아래 커밋 목록을 읽고 [대상 독자] 가 이해할 수 있는 릴리스 노트를 써줘.

규칙
- 내부 구현 용어를 쓰지 말고 사용자가 체감하는 변화로 바꿔 쓴다
- «새 기능 / 개선 / 버그 수정» 세 묶음으로 나눈다
- 각 항목은 한 줄. 왜 좋아졌는지가 드러나게 쓴다
- 사용자가 해야 할 조치가 있으면 맨 위에 «주의» 로 따로 뺀다

버전: [버전]
커밋 목록:
[커밋]`,
      variables: [
        { name: "대상 독자", description: "개발팀 / 사내 전체 / 고객사 등" },
        { name: "버전", description: "릴리스 버전 태그" },
        { name: "커밋", description: "git log --oneline 결과" },
      ],
    },
  },
  {
    id: "r14",
    type: "DEV_NOTE",
    slug: "onboarding-checklist",
    title: "신규 입사자 개발 환경 체크리스트",
    summary: "노트북 수령부터 첫 PR까지 필요한 설정 목록.",
    status: "PUBLISHED",
    sourceChannel: "WEB",
    category: "internal",
    tags: ["온보딩", "환경설정"],
    author: A.minsu,
    viewCount: 28,
    bookmarkCount: 4,
    createdAt: "2026-08-27T01:00:00Z",
    updatedAt: "2026-08-27T01:00:00Z",
    body: "1. Node.js LTS · Git · Docker Desktop 설치\n2. 사내 Git 저장소 접근 권한 요청\n3. Claude Code 설치 후 QueenBee MCP 설정\n4. QueenBee 가입 → 관리자 승인 요청",
    detail: {
      type: "DEV_NOTE",
      noteKind: "TIP",
      relatedProject: "온보딩",
    },
  },
];

export const members: Member[] = [
  {
    id: "u1",
    username: "jaehyun",
    name: "김재현",
    department: "개발팀",
    role: "ADMIN",
    status: "ACTIVE",
    resourceCount: 5,
    apiKeyCount: 2,
    createdAt: "2026-08-01T00:00:00Z",
    lastLoginAt: "2026-08-28T01:20:00Z",
  },
  {
    id: "u2",
    username: "minsu",
    name: "박민수",
    department: "개발팀",
    role: "EDITOR",
    status: "ACTIVE",
    resourceCount: 3,
    apiKeyCount: 1,
    createdAt: "2026-08-03T00:00:00Z",
    lastLoginAt: "2026-08-27T08:40:00Z",
  },
  {
    id: "u3",
    username: "seoyeon",
    name: "이서연",
    department: "공간정보팀",
    role: "MEMBER",
    status: "ACTIVE",
    resourceCount: 4,
    apiKeyCount: 1,
    createdAt: "2026-08-05T00:00:00Z",
    lastLoginAt: "2026-08-27T23:10:00Z",
  },
  {
    id: "u4",
    username: "hyunwoo",
    name: "정현우",
    department: "개발팀",
    role: "MEMBER",
    status: "ACTIVE",
    resourceCount: 2,
    apiKeyCount: 0,
    createdAt: "2026-08-08T00:00:00Z",
    lastLoginAt: "2026-08-26T05:00:00Z",
  },
  {
    id: "u5",
    username: "jiwoo",
    name: "한지우",
    department: "공간정보팀",
    role: "MEMBER",
    status: "PENDING",
    signupReason: "드론 영상 처리 자료를 팀과 공유하고 싶습니다.",
    resourceCount: 0,
    apiKeyCount: 0,
    createdAt: "2026-08-27T06:00:00Z",
  },
  {
    id: "u6",
    username: "taeyang",
    name: "오태양",
    department: "개발팀",
    role: "MEMBER",
    status: "PENDING",
    signupReason: "신규 입사자입니다. 온보딩 자료 열람이 필요합니다.",
    resourceCount: 0,
    apiKeyCount: 0,
    createdAt: "2026-08-28T00:15:00Z",
  },
  {
    id: "u7",
    username: "narae",
    name: "윤나래",
    department: "기획팀",
    role: "MEMBER",
    status: "PENDING",
    signupReason: "AI 도구 검토 자료를 참고하고 싶습니다.",
    resourceCount: 0,
    apiKeyCount: 0,
    createdAt: "2026-08-28T02:40:00Z",
  },
  {
    id: "u9",
    username: "dahye",
    name: "최**",
    department: "개발팀",
    role: "MEMBER",
    status: "WITHDRAWN",
    statusReason: "본인 탈퇴",
    resourceCount: 2,
    apiKeyCount: 0,
    createdAt: "2026-07-10T00:00:00Z",
    lastLoginAt: "2026-08-14T03:00:00Z",
  },
  {
    id: "u8",
    username: "sungho",
    name: "임성호",
    department: "개발팀",
    role: "MEMBER",
    status: "SUSPENDED",
    statusReason: "장기 미사용 계정 정리",
    resourceCount: 1,
    apiKeyCount: 0,
    createdAt: "2026-07-20T00:00:00Z",
    lastLoginAt: "2026-07-25T02:00:00Z",
  },
];

export const jobs: Job[] = [
  {
    id: "j1",
    type: "ARCHIVE_GITHUB",
    status: "RUNNING",
    targetTitle: "OpenDroneMap/ODM",
    attempts: 1,
    requestedBy: "seoyeon",
    createdAt: "2026-08-28T02:55:00Z",
  },
  {
    id: "j2",
    type: "FETCH_GITHUB_META",
    status: "QUEUED",
    targetTitle: "PDAL/PDAL",
    attempts: 0,
    requestedBy: "system",
    createdAt: "2026-08-28T02:58:00Z",
  },
  {
    id: "j3",
    type: "FETCH_URL_META",
    status: "DONE",
    targetTitle: "RAG 평가 프레임워크 비교",
    attempts: 1,
    durationMs: 1840,
    requestedBy: "minsu",
    createdAt: "2026-08-28T01:10:00Z",
  },
  {
    id: "j4",
    type: "ARCHIVE_GITHUB",
    status: "FAILED",
    targetTitle: "huge-model-weights/repo",
    attempts: 3,
    durationMs: 92000,
    requestedBy: "jaehyun",
    errorMessage: "아카이브 크기가 상한(500MB)을 초과했습니다.",
    createdAt: "2026-08-27T22:30:00Z",
  },
  {
    id: "j5",
    type: "CHECK_LINK",
    status: "FAILED",
    targetTitle: "삭제된 참고 아티클",
    attempts: 3,
    durationMs: 5200,
    requestedBy: "system",
    errorMessage: "404 Not Found — 원본이 사라졌습니다.",
    createdAt: "2026-08-27T19:00:00Z",
  },
  {
    id: "j6",
    type: "REFRESH_GITHUB_META",
    status: "DONE",
    targetTitle: "저장소 12건 일괄 갱신",
    attempts: 1,
    durationMs: 24300,
    requestedBy: "system",
    createdAt: "2026-08-26T19:00:00Z",
  },
];

export const auditLogs: AuditLog[] = [
  {
    id: "a1",
    actorUsername: "jaehyun",
    via: "WEB",
    action: "USER_APPROVE",
    targetType: "user",
    summary: "seoyeon 승인 (역할 MEMBER)",
    ip: "192.168.0.14",
    createdAt: "2026-08-28T02:40:00Z",
    diff: {
      status: { before: "PENDING", after: "ACTIVE" },
      role: { before: "MEMBER", after: "MEMBER" },
      statusChangedBy: { before: null, after: "jaehyun" },
    },
  },
  {
    id: "a2",
    actorUsername: "minsu",
    via: "MCP",
    action: "RESOURCE_CREATE",
    targetType: "resource",
    summary: "AI 자료 «RAG 평가 프레임워크 비교» 등록",
    ip: "192.168.0.22",
    createdAt: "2026-08-28T01:10:00Z",
  },
  {
    id: "a3",
    actorUsername: "seoyeon",
    via: "MCP",
    action: "RESOURCE_CREATE",
    targetType: "resource",
    summary: "AI 자료 «NeRF vs 3D Gaussian Splatting» 등록",
    ip: "192.168.0.31",
    createdAt: "2026-08-27T23:20:00Z",
  },
  {
    id: "a4",
    actorUsername: "jaehyun",
    via: "WEB",
    action: "APIKEY_CREATE",
    targetType: "api_key",
    summary: "API 키 «노트북 Claude Code» 발급",
    ip: "192.168.0.14",
    createdAt: "2026-08-27T10:05:00Z",
  },
  {
    id: "a5",
    actorUsername: "jaehyun",
    via: "WEB",
    action: "USER_SUSPEND",
    targetType: "user",
    summary: "sungho 정지 (사유: 장기 미사용 계정 정리)",
    ip: "192.168.0.14",
    createdAt: "2026-08-27T09:30:00Z",
    diff: {
      status: { before: "ACTIVE", after: "SUSPENDED" },
      statusReason: { before: null, after: "장기 미사용 계정 정리" },
      sessions: { before: "2", after: "0" },
    },
  },
  {
    id: "a6",
    actorUsername: "hyunwoo",
    via: "WEB",
    action: "RESOURCE_UPDATE",
    targetType: "resource",
    summary: "개발 노트 «Windows Docker 볼륨 문제» 수정",
    ip: "192.168.0.45",
    createdAt: "2026-08-26T07:40:00Z",
  },
];

export const collections: Collection[] = [
  {
    id: "c1",
    name: "신규 입사자 온보딩",
    slug: "onboarding",
    description: "입사 첫 주에 훑어야 할 자료 묶음",
    visibility: "TEAM",
    owner: A.jaehyun,
    itemCount: 8,
    updatedAt: "2026-08-27T02:00:00Z",
  },
  {
    id: "c2",
    name: "MCP 도입 검토",
    slug: "mcp-review",
    description: "사내 표준으로 채택할 MCP 서버 후보",
    visibility: "TEAM",
    owner: A.minsu,
    itemCount: 5,
    updatedAt: "2026-08-25T06:00:00Z",
  },
  {
    id: "c3",
    name: "드론 3D 재구성",
    slug: "drone-3d",
    description: "포토그래메트리·Gaussian Splatting 자료",
    visibility: "TEAM",
    owner: A.seoyeon,
    itemCount: 6,
    updatedAt: "2026-08-24T01:00:00Z",
  },
  {
    id: "c4",
    name: "나중에 읽기",
    slug: "read-later",
    visibility: "PRIVATE",
    owner: A.jaehyun,
    itemCount: 3,
    updatedAt: "2026-08-28T00:10:00Z",
  },
];

export const apiKeys: ApiKey[] = [
  {
    id: "k1",
    name: "노트북 Claude Code",
    keyPrefix: "qb_live_a1b2c3d4",
    scopes: ["resources:read", "resources:write", "archive:run"],
    lastUsedAt: "2026-08-28T01:10:00Z",
    expiresAt: "2027-08-27T00:00:00Z",
    createdAt: "2026-08-27T10:05:00Z",
  },
  {
    id: "k2",
    name: "데스크톱 (읽기 전용)",
    keyPrefix: "qb_live_9f8e7d6c",
    scopes: ["resources:read"],
    expiresAt: "2027-08-01T00:00:00Z",
    createdAt: "2026-08-01T04:00:00Z",
  },
];

export const notifications: AppNotification[] = [
  {
    id: "n1",
    type: "SIGNUP_REQUEST",
    title: "가입 신청 3건이 대기 중입니다",
    body: "윤나래 · 오태양 · 한지우",
    read: false,
    createdAt: "2026-08-28T02:40:00Z",
  },
  {
    id: "n2",
    type: "JOB_FAILED",
    title: "아카이브 작업이 실패했습니다",
    body: "huge-model-weights/repo — 크기 상한 초과",
    read: false,
    createdAt: "2026-08-27T22:30:00Z",
  },
  {
    id: "n3",
    type: "JOB_DONE",
    title: "아카이브가 완료되었습니다",
    body: "modelcontextprotocol/servers (34.2 MB)",
    read: true,
    createdAt: "2026-08-27T08:00:00Z",
  },
];

/** 최근 30일 등록 추이 — 경로별 (DEV-03 · 3.7절) */
export const registrationTrend = [
  { date: "08-15", web: 1, mcp: 0 },
  { date: "08-16", web: 0, mcp: 1 },
  { date: "08-17", web: 2, mcp: 0 },
  { date: "08-18", web: 1, mcp: 1 },
  { date: "08-19", web: 0, mcp: 2 },
  { date: "08-20", web: 1, mcp: 0 },
  { date: "08-21", web: 2, mcp: 1 },
  { date: "08-22", web: 1, mcp: 0 },
  { date: "08-23", web: 0, mcp: 3 },
  { date: "08-24", web: 2, mcp: 1 },
  { date: "08-25", web: 1, mcp: 2 },
  { date: "08-26", web: 3, mcp: 1 },
  { date: "08-27", web: 2, mcp: 4 },
  { date: "08-28", web: 1, mcp: 2 },
];

export const stats = {
  totalResources: resources.length,
  weeklyNew: 9,
  myBookmarks: resources.filter((r) => r.bookmarked).length,
  myResources: resources.filter((r) => r.author.id === currentUser.id).length,
  totalMembers: members.length,
  pendingMembers: members.filter((m) => m.status === "PENDING").length,
  failedJobs: jobs.filter((j) => j.status === "FAILED").length,
  archiveUsedGb: 12.4,
  archiveLimitGb: 100,
  diskFreeGb: 151,
};
