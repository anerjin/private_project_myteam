import "server-only";

/**
 * 작업 처리기 등록 (`DEC-053`).
 *
 * **이 파일을 import 하는 것이 「워커를 켜는 것」입니다.** 별도 프로세스가
 * 없으므로(`DEC-053`) 작업을 만드는 쪽이 여기를 함께 불러야 처리기가
 * 등록됩니다 — 안 그러면 `runNow` 가 「처리기가 등록되지 않은 작업입니다」로
 * 실패합니다. **조용히 안 도는 것보다 낫습니다.**
 *
 * 각 모듈이 import 시점에 자기 자신을 `register()` 합니다.
 */
import "@/server/jobs/github-meta";
import "@/server/jobs/archive";
import "@/server/jobs/scheduled";
