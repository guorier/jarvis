// 시스템 정보 수집 전용 프로세스 (Electron utilityProcess)
// [리뷰-M1 해결] systeminformation 조회는 Windows에서 PowerShell·WMI를 불러 수백 ms가 걸린다.
// 메인 프로세스에서 돌리면 그동안 창 그리기가 멈추므로, 이 별도 프로세스에서 돌리고 결과만 메시지로 돌려준다.
//
// 주고받는 모양
//   받음: { id, fn }          fn = "getFast" | "getSlow"
//   보냄: { id, ok: true, data } 또는 { id, ok: false, error }
// GPU·NPU 사용률(accel)은 메인 프로세스의 수집기가 갖고 있어 여기서는 비어 있고, 메인이 합쳐서 화면에 보낸다.
const system = require("./system");

const ALLOWED = new Set(["getFast", "getSlow"]);

process.parentPort.on("message", async (e) => {
  const { id, fn } = e.data || {};
  if (!ALLOWED.has(fn)) {
    process.parentPort.postMessage({ id, ok: false, error: `알 수 없는 요청: ${fn}` });
    return;
  }
  try {
    const data = await system[fn]();
    process.parentPort.postMessage({ id, ok: true, data });
  } catch (err) {
    process.parentPort.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
  }
});
