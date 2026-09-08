# @neowave-work/mcp

Claude Code에서 Neowave Work에 자료를 등록하는 **stdio MCP 서버**입니다.
(`FR-CLI-001`, [DEV-08 자료 수집 파이프라인](../../../_docs/02.개발설계/08_자료수집_파이프라인.md))

이 패키지는 **개발자 PC에서 돕니다.** Neowave Work 서버에 배포되는 것이 아니라
Claude Code가 자식 프로세스로 실행하는 클라이언트입니다.

## 1. API 키 발급

Neowave Work 웹에서 **마이페이지 > 보안 > API 키 > 키 발급**.

- 키 평문은 **발급 직후 한 번만** 보입니다. 화면을 벗어나면 다시 볼 수 없습니다.
- 발급 화면이 Claude Code 설정 스니펫을 **키가 채워진 채로** 보여줍니다 — 그걸 복사하면 2번은 건너뜁니다.
- `archive:run` 은 `EDITOR` 이상만 선택할 수 있습니다.

## 2. Claude Code 설정

```json
{
  "mcpServers": {
    "neowave-work": {
      "command": "npx",
      "args": ["-y", "@neowave-work/mcp"],
      "env": {
        "NEOWAVE_WORK_URL": "http://localhost:3100",
        "NEOWAVE_WORK_API_KEY": "nw_live_..."
      }
    }
  }
}
```

npm 레지스트리에 올리지 않은 동안에는 저장소 경로로 직접 실행합니다.

```json
{
  "command": "node",
  "args": ["E:/github/doi_dev_team/project/packages/mcp-server/dist/index.js"]
}
```

> `NEOWAVE_WORK_URL` 은 실행 환경에 따라 다릅니다. 1단계(개발 PC)는 `http://localhost:3100`,
> 사내 서버 주소는 이관 시점에 정합니다 (`DEC-028`).

## 3. 수집 Skill 설치

`skills/neowave-work-collect/` 를 `~/.claude/skills/` 로 복사합니다.

도구만 있으면 에이전트는 «무엇을 채울 수 있는지»는 알지만 «어떻게 채워야 좋은지»는 모릅니다.
수집 절차와 품질 규칙이 그 Skill에 있습니다 (`FR-CLI-009`).

## 4. 확인

Claude Code에서:

```
Neowave Work에 카테고리 뭐뭐 있는지 알려줘
```

도구가 안 보이면 MCP 서버 로그(stderr)를 봅니다 — 설정이 틀렸으면 기동할 때 이유를 말하고 죽습니다.

## 도구

| 도구 | 용도 | 필요 스코프 |
| --- | --- | --- |
| `nwwork_list_content_types` | 콘텐츠 타입 목록과 타입별 필드 스키마 | `resources:read` |
| `nwwork_search` | 기존 자료 검색 | `resources:read` |
| `nwwork_get_resource` | 자료 상세 | `resources:read` |
| `nwwork_check_duplicate` | URL 정규화 후 중복 확인 | `resources:read` |
| `nwwork_create_resource` | 자료 등록 | `resources:write` |
| `nwwork_update_resource` | 자료 보강 | `resources:write` |
| `nwwork_list_taxonomy` | 카테고리 트리·인기 태그 | `resources:read` |
| `nwwork_archive_github` | GitHub 소스 아카이브 요청 | `archive:run` |

## 개발

```bash
npm run --workspace @neowave-work/mcp build     # dist/ 생성
npm run verify:p7-mcp                       # stdio 로 띄워 도구를 실제로 부른다
```

### 이 패키지의 규칙

| 규칙 | 이유 |
| --- | --- |
| 비즈니스 로직을 두지 않는다 | 검증·중복·권한은 서버가 판단한다. 두 곳에 규칙이 생기면 어긋난다 |
| 앱 코드를 import 하지 않는다 | 독립 패키지다. Prisma·DB에 접근하지 않는다 |
| 타입 목록을 하드코딩하지 않는다 | `nwwork_list_content_types` 로 서버에서 받아온다 |
| 자동 재시도 금지 | 등록은 부작용이 있다. 조용한 재시도는 중복을 만든다 |
| stdout에 사람 문구를 쓰지 않는다 | 프로토콜 전용이다. 한 줄만 섞여도 대화가 깨진다 |
