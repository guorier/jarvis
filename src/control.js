// 제어와 자동화: 앱/파일 런처, 루틴 실행, Home Assistant 스마트홈 제어
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
