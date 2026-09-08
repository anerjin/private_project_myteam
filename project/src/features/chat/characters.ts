/**
 * 네오 캐릭터 목록 — **코드가 정본입니다** (`features/avatars/catalog` 과 같은 이유).
 *
 * 음성 모드에서 화면에 서 있는 네오의 «몸»입니다. 그림 파일이 아니라 **도형과
 * 색의 명세**이고, `neo-character` 가 이 값으로 three.js 장면을 짓습니다.
 *
 * ## 동물의 숲 풍
 *
 * 운영자 주문(2026-09-04): 「동물의 숲 아바타처럼」. 그 그림체의 규칙은 몇 개
 * 안 됩니다 — **머리가 몸만큼 크고**, 눈이 크고 반짝이가 있고, 볼이 발그레하고,
 * 귀가 둥글고, 팔다리는 짧은 공. 모서리가 없습니다. 색은 파스텔 둘셋.
 * ### 프로펠러 모자는 왜 남아 있나
 *
 * 원래는 **이름의 유래**였습니다 — 처음 이름 「디오」가 `DOI`(드론 공간정보)
 * 였고, 드론에서 프로펠러가 나왔습니다. 이름이 「네오」(`Neowave`)로 바뀌면서
 * **그 근거는 사라졌습니다.**
 *
 * 그래도 **모자는 그대로 둡니다.** 근거가 유래에서 **생김새**로 옮겨간
 * 것입니다 — 이 얼굴을 알아보게 하는 것이 프로펠러라, 떼면 「같은 도우미의
 * 새 이름」이 아니라 **다른 캐릭터**가 됩니다. 운영자가 캐릭터를 바꾸라고 한
 * 적도 없습니다. 프로펠러가 「생각 중」을 표시하는 **움직이는 부품**이라는
 * 것도 이유입니다(`neo-character` 의 `build`).
 *
 * 그러니 앞으로 이 모자의 뜻을 묻는 사람에게 **드론 이야기를 하지 마십시오.**
 * 지금 프로펠러는 「생각하고 있습니다」라는 표시입니다.
 *
 * ## 아바타 놀이터와는 다른 계열입니다
 *
 * `DEC-066` 은 아바타를 「캔버스에 그리지 않는다」로 정했습니다 — SVG «안»의
 * 움직임이 래스터로 굽는 순간 죽기 때문입니다. 네오는 처음부터 3D 라 그
 * 이유가 해당되지 않습니다. 둘은 **섞지 않습니다**: 강아지는 `<img>` + matter-js,
 * 네오는 WebGL.
 *
 * ## 하나 더 넣으려면
 *
 * 아래 배열에 한 줄 더합니다. 색만 다르면 그걸로 끝이고, 모양이 다르면
 * `neo-character` 의 `build` 에 분기를 더합니다. 설정 창은 배열을 그대로 고르게
 * 합니다.
 */

export interface NeoCharacter {
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

export const CHARACTERS: NeoCharacter[] = [
  {
    id: "rotor",
    name: "네오",
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

export function findCharacter(id: string | null | undefined): NeoCharacter {
  return CHARACTERS.find((c) => c.id === id) ?? DEFAULT_CHARACTER;
}
