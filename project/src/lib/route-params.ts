/**
 * 동적 세그먼트 값을 **본래 문자열로** 되돌린다.
 *
 * ## 왜 필요한가 — 한국어 slug 가 전부 404 였습니다
 *
 * `P4` 가 slug 에 **한글을 남기기로** 정했습니다(라틴만 남기면 「검증용 AI 자료」
 * 가 `-ai-` 가 되고, 팀이 한국어로 제목을 씁니다). 그런데 상세 화면을 열면
 * `notFound()` 였습니다 — `params.slug` 가 **퍼센트 인코딩된 채로** 들어와
 * `findBySlug("%ED%99%94...")` 가 아무것도 못 찾았습니다.
 *
 * ASCII slug 는 인코딩해도 자기 자신이라 **아무 문제가 없었고**, 그래서
 * 이 구멍이 `P4`·`P5` 를 지나 `P6` 까지 살아 있었습니다 — 검증이 전부
 * service 를 직접 불렀기 때문입니다. **화면으로 확인해야 잡히는 부류**입니다.
 *
 * ## 이미 디코딩된 값도 안전합니다
 *
 * 두 번 디코딩하면 `%25` 같은 값이 망가지지만, slug 는 `toSlug` 가 만들고
 * `%` 를 넣지 않습니다. 그리고 **못 읽는 문자열은 그대로 돌려줍니다** —
 * 여기서 던지면 잘못된 주소 하나가 500 이 됩니다.
 */
export function decodeSegment(value: string): string {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
