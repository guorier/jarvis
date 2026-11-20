// 제어와 자동화: 앱/파일 런처, 루틴 실행, Home Assistant 스마트홈 제어
// ============================================================================
// [코드 리뷰] src/control.js
// 좋은 점
//  - AI도 "등록된" 런처·루틴·기기만 실행할 수 있다(임의 명령 실행 불가).
//  - spawn에 shell:false를 써서 이름에 특수문자가 있어도 명령이 섞여 실행되지 않는다.
//  - Home Assistant는 등록된 entity_id + 정해진 동작(turn_on/off/toggle)만 허용한다. 요청에 8초 제한.
// 개선 포인트
//  - [리뷰-C1] 루틴의 "url" 단계는 주소 형식을 확인하지 않고 shell.openExternal에 넘긴다.
//              (open:url IPC는 http/https만 허용하는데 여기만 빠져 있다) → 같은 검사를 넣을 것.
//  - [리뷰] 루틴 단계 실패는 "실패: ..." 문자열로만 남아 호출한 쪽이 문자열 앞부분으로 판단한다(widgets.js).
//           { ok, text } 형태로 돌려주면 더 견고하다.
// ============================================================================
const { shell, Notification } = require("electron");

// 등록된 런처 항목만 실행한다. (AI가 임의 명령을 실행하지 못하게)
async function launch(launcher) {
  const target = launcher.target.trim();
  if (/^https?:\/\//i.test(target)) {
    await shell.openExternal(target);
    return `${launcher.name} 열기 완료`;
  }
  // 파일, 폴더, 실행 파일 경로 또는 PATH에 있는 프로그램 이름
  const err = await shell.openPath(target);
  if (err) {
    // openPath가 PATH의 프로그램 이름(notepad.exe 등)을 못 찾는 경우 대비
    const { spawn } = require("child_process");
    await new Promise((resolve, reject) => {
      const child = spawn(target, [], { detached: true, stdio: "ignore", shell: false });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }
  return `${launcher.name} 실행 완료`;
}

async function runRoutine(routine, store, log) {
  const results = [];
  for (const step of routine.steps) {
    try {
      if (step.type === "launch") {
        const l = store.get("launchers").find((x) => x.id === step.launcherId);
        if (!l) throw new Error(`런처 항목 없음: ${step.launcherId}`);
        results.push(await launch(l));
      } else if (step.type === "url") {
        // [리뷰-C1] http/https 확인이 없다. 루틴 JSON에 file:// 이나 다른 프로그램 연결 주소가 들어가면 그대로 열린다.
        //           if (!/^https?:\/\//i.test(step.url)) throw new Error("http/https 주소만 열 수 있습니다.");
        await shell.openExternal(step.url);
        results.push(`${step.url} 열기`);
      } else if (step.type === "notify") {
        new Notification({ title: "J.A.R.V.I.S.", body: step.text }).show();
        results.push(`알림: ${step.text}`);
      } else if (step.type === "ha") {
        results.push(await haCall(store.get("settings"), step.entity_id, step.action));
      } else if (step.type === "wait") {
        await new Promise((r) => setTimeout(r, Math.min(step.ms || 1000, 30000)));
        results.push(`${step.ms}ms 대기`);
      }
    } catch (e) {
      results.push(`실패: ${e.message}`);
    }
    log && log(results[results.length - 1]);
  }
  return results;
}

// ---- Home Assistant ----
function haReady(settings) {
  return Boolean(settings.haUrl && settings.haToken);
}

async function haFetch(settings, pathname, init = {}) {
  if (!haReady(settings)) throw new Error("Home Assistant 주소와 토큰을 설정에서 입력하세요.");
  const url = settings.haUrl.replace(/\/+$/, "") + pathname;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${settings.haToken}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`Home Assistant 응답 ${res.status}`);
  return res.json();
}

async function haStates(settings) {
  const entities = settings.haEntities || [];
  if (!haReady(settings) || !entities.length) return { configured: haReady(settings), devices: [] };
  const devices = await Promise.all(
    entities.map(async (e) => {
      try {
        const s = await haFetch(settings, `/api/states/${encodeURIComponent(e.entity_id)}`);
        return { ...e, state: s.state, attrs: s.attributes };
      } catch (err) {
        return { ...e, state: "unavailable", error: err.message };
      }
    })
  );
  return { configured: true, devices };
}

async function haCall(settings, entityId, action) {
  if (!["turn_on", "turn_off", "toggle"].includes(action)) throw new Error(`지원하지 않는 동작: ${action}`);
  const allowed = (settings.haEntities || []).some((e) => e.entity_id === entityId);
  if (!allowed) throw new Error(`등록되지 않은 기기: ${entityId}`);
  const domain = entityId.split(".")[0];
  await haFetch(settings, `/api/services/${domain}/${action}`, {
    method: "POST",
    body: JSON.stringify({ entity_id: entityId })
  });
  return `${entityId} → ${action}`;
}

module.exports = { launch, runRoutine, haStates, haCall };
