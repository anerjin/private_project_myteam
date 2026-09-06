/**
 * 디오 캐릭터 목록 — **코드가 정본입니다** (`features/avatars/catalog` 과 같은 이유).
 *
 * 음성 모드에서 화면에 서 있는 디오의 «몸»입니다. 그림 파일이 아니라 **도형과
 * 색의 명세**이고, `dio-character` 가 이 값으로 three.js 장면을 짓습니다.
 *
 * ## 동물의 숲 풍
 *
 * 운영자 주문(2026-09-04): 「동물의 숲 아바타처럼」. 그 그림체의 규칙은 몇 개
 * 안 됩니다 — **머리가 몸만큼 크고**, 눈이 크고 반짝이가 있고, 볼이 발그레하고,
 * 귀가 둥글고, 팔다리는 짧은 공. 모서리가 없습니다. 색은 파스텔 둘셋.
 * 이름의 유래(DOI = 드론 공간정보)는 **프로펠러 모자**로 남깁니다.
 *
 * ## 아바타 놀이터와는 다른 계열입니다
 *
 * `DEC-066` 은 아바타를 「캔버스에 그리지 않는다」로 정했습니다 — SVG «안»의
 * 움직임이 래스터로 굽는 순간 죽기 때문입니다. 디오는 처음부터 3D 라 그
 * 이유가 해당되지 않습니다. 둘은 **섞지 않습니다**: 강아지는 `<img>` + matter-js,
 * 디오는 WebGL.
 *
 * ## 하나 더 넣으려면
 *
 * 아래 배열에 한 줄 더합니다. 색만 다르면 그걸로 끝이고, 모양이 다르면
 * `dio-character` 의 `build` 에 분기를 더합니다. 설정 창은 배열을 그대로 고르게
 * 합니다.
 */

export interface DioCharacter {
  id: string;
  /** 화면에 보이는 이름 */
  name: string;
  /** 무엇인가 — 한 줄 */
  description: string;
  /** 털·살. 밝은 화면과 어두운 화면 «둘 다» 위에 놓입니다 */
  fur: string;
  /** 프로펠러 (몸을 그리던 때는 옷이었습니다) */
  shirt: string;
  /** 볼 · 귓속 */
  cheek: string;
  /** 모자 */
  cap: string;
  /** 눈동자 · 코 · 입 · 발 */
  dark: string;
  createdAt: string;
}

export const CHARACTERS: DioCharacter[] = [
  {
    id: "rotor",
    name: "디오",
    description:
      "하늘색 털에 프로펠러 모자를 쓴 둥근 얼굴. 들을 때 귀를 쫑긋하고, 생각할 때 프로펠러가 빨라집니다. 끌면 돌아보고 커서를 따라 봅니다.",
    fur: "#9CC4FF",
    shirt: "#FFD86B",
    cheek: "#FFA3B5",
    cap: "#4F7DE0",
    dark: "#3A2E2E",
    createdAt: "2026-09-04",
  },
];

export const DEFAULT_CHARACTER = CHARACTERS[0]!;

export function findCharacter(id: string | null | undefined): DioCharacter {
  return CHARACTERS.find((c) => c.id === id) ?? DEFAULT_CHARACTER;
}
