import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * **베어 온 코드입니다 — 우리가 쓴 것이 아닙니다** (`DEC-070`).
     *
     * ReUI 간트(MIT)를 레지스트리에서 그대로 받아 둔 9개 파일, 9,911줄입니다.
     * React Compiler 규칙에 걸립니다 — 렌더 중 `Date.now()`, 렌더 뒤 변수
     * 재할당, 수동 메모이제이션. **진짜 지적이지만 우리가 고칠 것이 아닙니다:**
     * 고쳐 놓으면 판올림해 다시 받는 날 그 손질이 통째로 사라지고, 그때
     * 「왜 또 깨졌지」로 시작합니다.
     *
     * 대신 **경계를 지킵니다** — 이 폴더 밖에서 이 코드를 부르는 우리 쪽
     * 어댑터(`features/projects/components/*`)는 검사를 그대로 받습니다.
     * 규칙을 끄는 것이 아니라 **남의 코드를 우리 코드로 세지 않는 것**입니다.
     *
     * `typecheck` 는 **제외하지 않습니다.** 타입은 우리 코드와 맞물리는
     * 경계이고, 거기서 깨지면 그건 우리 문제입니다.
     */
    "src/components/reui/gantt/**",
  ]),

  /**
   * **타입을 봐야만 잡히는 규칙 둘.**
   *
   * ## 왜 켰는가 — 안 기다린 promise 가 보안 가드를 «없앴습니다»
   *
   * `FETCH_URL_META` 처리기가 SSRF 가드를 이렇게 불렀습니다:
   *
   * ```ts
   * assertPublicUrl(resource.url);   // ← async 인데 await 이 없습니다
   * ```
   *
   * 그러면 세 가지가 한꺼번에 일어납니다:
   *
   * 1. **가드가 아무것도 안 막습니다** — 거부가 결정되기 전에 다음 줄이 돌아
   *    사내 주소로 브라우저를 엽니다
   * 2. 거부는 **처리되지 않은 rejection** 이 되어 **프로세스를 죽입니다**
   * 3. 작업의 `try/catch` 도 못 잡습니다 — 그 promise 를 아무도 안 기다립니다
   *
   * 눈으로는 멀쩡해 보입니다. 함수 이름이 `assert…` 라 동기처럼 읽히고,
   * 타입을 안 보는 린트는 «호출했다»까지만 압니다. **타입을 봐야 잡힙니다.**
   *
   * ## 값이 싼가
   *
   * 켜 보니 저장소 전체에서 위반이 **2건**이었습니다(둘 다 화면의
   * `.then` 에 `.catch` 가 없던 자리). 타입 정보를 읽느라 lint 가 느려지지만,
   * 이 한 종류의 결함이 조용히 **보안 검사를 무력화**한다는 것을 보고 켭니다.
   */
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      // `await` 을 붙였는데 promise 가 아닌 것 — 반대 방향의 같은 착각입니다
      "@typescript-eslint/await-thenable": "error",
    },
  },
]);

export default eslintConfig;
