// AI 비서 자동 점검: 앱에 저장된 설정(API 키 포함)으로 몇 가지 대화를 보내고 도구 사용을 확인한다.
// 실행: node_modules\electron\dist\electron.exe scripts\ai-selftest.js
// 주의: 실제 Claude API를 호출하므로 사용량 요금이 발생한다. 앱/루틴 실행은 하지 않는다.
const { app } = require("electron");
const path = require("path");

app.setPath("userData", path.join(app.getPath("appData"), "jarvis-hud"));

const CASES = [
  { label: "기본 대화", text: "안녕? 한 문장으로 자기소개해줘.", expectTools: [] },
  { label: "할 일 추가(도구)", text: "'자비스 시험 항목'이라는 할 일을 추가해줘. 리마인더는 필요 없어.", expectTools: ["add_todo"] },
  { label: "시스템 상태(도구)", text: "지금 CPU와 RAM 사용률 알려줘.", expectTools: ["get_system_status"] },
  { label: "날씨(도구)", text: "오늘 날씨 어때?", expectTools: ["get_weather"] },
  { label: "런처 목록(도구)", text: "실행할 수 있게 등록된 앱이 뭐가 있지?", expectTools: ["list_launchers_and_routines"] },
  { label: "웹 검색(서버 도구)", text: "웹 검색으로 오늘 IT 분야 주요 뉴스 하나만 찾아서 한 줄로 알려줘.", expectTools: ["web_search"] },
  { label: "웹 검색-맛집(네이버)", text: "강남역 근처 파스타 맛집 3곳만 이름이랑 주소로 알려줘.", expectTools: ["web_search"] }
];

app.whenReady().then(async () => {
  const { Store } = require("../src/store");
  const { Assistant } = require("../src/ai");
  const store = new Store(app.getPath("userData"));
  const s = store.get("settings");
  const hasKey = s.provider === "gemini" ? !!s.geminiKey : !!(s.apiKey || process.env.ANTHROPIC_API_KEY);
  console.log(`AI 엔진: ${s.provider} / 모델: ${s.provider === "gemini" ? s.geminiModel : s.model}`);
  if (!hasKey) {
    console.log("NO_KEY: 앱 설정에 API 키가 저장되어 있지 않습니다.");
    app.exit(2);
    return;
  }
  const assistant = new Assistant({ store, onDataChanged: (k) => console.log(`   [데이터 변경] ${k}`), onLog: () => {} });
  let pass = 0;

  // JARVIS_CASE=웹 처럼 주면 이름에 그 글자가 들어간 시험만 돌린다
  const only = process.env.JARVIS_CASE;
  const cases = CASES.filter((x) => !only || x.label.includes(only));
  for (const c of cases) {
    const tools = [];
    let text = "";
    const t0 = Date.now();
    process.stdout.write(`\n▶ ${c.label}: ${c.text}\n`);
    try {
      await assistant.chat(c.text, (ev) => {
        if (ev.type === "delta") text += ev.text;
        if (ev.type === "tool") tools.push(ev.name);
      });
      const missing = c.expectTools.filter((t) => !tools.includes(t));
      // 도구를 불렀더라도 "할 수 없다"는 답이면 실패로 본다
      const refused = /수행할 수 없|할 수 없습니다|사용량 초과|오류가 발생/.test(text);
      const ok = missing.length === 0 && text.trim().length > 0 && !refused;
      if (ok) pass++;
      console.log(`   도구: ${tools.join(", ") || "(없음)"}  |  ${((Date.now() - t0) / 1000).toFixed(1)}초`);
      console.log(`   응답: ${text.trim().replace(/\s+/g, " ").slice(0, 220)}`);
      console.log(`   결과: ${ok ? "PASS" : `FAIL (빠진 도구: ${missing.join(", ") || "-"}, 응답 ${text.trim() ? "있음" : "없음"})`}`);
    } catch (e) {
      console.log(`   결과: ERROR ${e.message}`);
    }
  }

  // 시험으로 만든 할 일 정리
  const todos = store.get("todos");
  const kept = todos.filter((t) => !t.text.includes("자비스 시험 항목"));
  if (kept.length !== todos.length) {
    store.set("todos", kept);
    console.log(`\n(시험용 할 일 ${todos.length - kept.length}건 삭제)`);
  }
  console.log(`\n총 ${cases.length}건 중 ${pass}건 통과`);
  app.exit(pass === cases.length ? 0 : 1);
});
