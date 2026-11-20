// AI 채팅 + 슬래시 명령
// ============================================================================
// [코드 리뷰] renderer/chat.js
// 흐름: 입력 → "/"로 시작하면 handleSlash(앱 안에서 바로 처리), 아니면 Chat.ask → 메인의 ai:chat
//       → 스트리밍 이벤트(delta/tool/status)가 requestId로 짝지어 들어와 말풍선을 갱신
// 좋은 점
//  - requestId로 이벤트를 걸러, 늦게 도착한 이전 요청의 조각이 새 답변에 섞이지 않는다.
//  - 사용자 입력은 esc()로, AI 답변은 miniMarkdown(이스케이프 후 변환)으로 넣는다.
// 개선 포인트
//  - [리뷰] render()가 조각이 올 때마다 답변 전체를 다시 마크다운으로 만든다. 짧은 답에선 문제없지만
//           긴 답변에선 점점 느려진다(조각 수 × 길이) → requestAnimationFrame으로 한 프레임에 한 번만 그리기.
//  - [리뷰] setCore의 #core-state 요소는 지금 화면에 없다(예전 디자인 흔적). 해는 없지만 지워도 된다.
//  - [리뷰] findNamed(여기)와 ai.js의 findByName이 이름 찾는 규칙이 달라, 같은 이름이 슬래시 명령과 AI에서
//           다른 항목을 고를 수 있다 → 한 곳으로 합칠 것.
// ============================================================================
const TOOL_LABELS = {
  get_system_status: "시스템 확인",
  list_launchers_and_routines: "런처 목록",
  launch_app: "앱 실행",
  run_routine: "루틴 실행",
  add_todo: "할 일 추가",
  list_todos: "할 일 확인",
  complete_todo: "할 일 완료",
  add_event: "일정 추가",
  list_events: "일정 확인",
  add_memo: "메모 저장",
  list_memos: "메모 확인",
  get_weather: "날씨 확인",
  list_devices: "기기 확인",
  control_device: "기기 제어",
  web_search: "웹 검색"
};

const Chat = {
  current: null, // { id, el, text, chips }
  busy: false,

  setCore(state) {
    const core = $("#core");
    core.classList.remove("idle", "thinking", "speaking", "error");
    core.classList.add(state);
    const stateEl = $("#core-state");
    if (stateEl) stateEl.textContent = { idle: "ONLINE", thinking: "PROCESSING", speaking: "SPEAKING", error: "ERROR" }[state] || "ONLINE";
  },

  setStatus(text, busy) {
    $("#ai-status").textContent = text;
    $(".status-line").classList.toggle("busy", !!busy);
  },

  add(role, html, extraClass = "") {
    const el = document.createElement("div");
    el.className = `msg ${role} ${extraClass}`;
    el.innerHTML = html;
    $("#chat-log").appendChild(el);
    this.scroll();
    return el;
  },

  scroll() {
    const log = $("#chat-log");
    log.scrollTop = log.scrollHeight;
  },

  render() {
    const c = this.current;
    if (!c) return;
    const chips = c.chips.map((t) => `<span class="tool-chip">⚙ ${esc(t)}</span>`).join("");
    c.el.innerHTML = (chips ? `<div>${chips}</div>` : "") + miniMarkdown(c.text.trim()) + (this.busy ? '<span class="cursor"></span>' : "");
    this.scroll();
  },

  async ask(text, display = text) {
    if (this.busy) return;
    this.busy = true;
    $("#chat-form .send").disabled = true;
    this.add("user", esc(display));
    Sound.send();
    TTS.stop();
    // [리뷰] id 하나를 받으려고 메인 프로세스를 한 번 왕복한다. 화면에서 crypto.randomUUID()로 만들어도 충분하다.
    const id = await jarvis.newId();
    this.current = { id, el: this.add("ai", '<span class="cursor"></span>'), text: "", chips: [] };
    this.setCore("thinking");
    this.setStatus("생각하는 중…", true);
    logLine(`AI 요청: ${display.slice(0, 60)}`);
    try {
      await jarvis.ai.chat(id, text);
      this.busy = false;
      if (!this.current.text.trim()) this.current.text = "완료했습니다.";
      this.render();
      Sound.done();
      this.setCore("idle");
      this.setStatus("대기 중");
      const spoken = this.current.text;
      TTS.speak(spoken, () => this.setCore("speaking"), () => this.setCore("idle"));
    } catch (e) {
      this.busy = false;
      this.current.el.classList.add("error");
      this.current.text += (this.current.text ? "\n\n" : "") + `⚠ ${e.message}`;
      this.render();
      Sound.error();
      this.setCore("error");
      setTimeout(() => this.setCore("idle"), 1500);
      this.setStatus("오류");
      logLine(`AI 오류: ${e.message}`, "error");
    } finally {
      this.busy = false;
      $("#chat-form .send").disabled = false;
      this.current = null;
    }
  },

  onEvent(ev) {
    const c = this.current;
    if (!c || ev.requestId !== c.id) return;
    if (ev.type === "delta") {
      c.text += ev.text;
      this.setStatus("응답 중…", true);
    } else if (ev.type === "tool") {
      const label = TOOL_LABELS[ev.name] || ev.name;
      c.chips.push(label);
      this.setStatus(`${label} 중…`, true);
      logLine(`도구 사용: ${ev.name}${ev.detail ? " " + JSON.stringify(ev.detail).slice(0, 80) : ""}`);
    } else if (ev.type === "status") {
      this.setStatus(ev.text, true);
    }
    this.render();
  }
};

jarvis.ai.onEvent((ev) => Chat.onEvent(ev));

// ---------- 슬래시 명령 ----------
const HELP = `**사용 가능한 명령**
- \`/메모 내용\` 메모 저장
- \`/할일 내용\` 할 일 추가
- \`/일정 2026-11-20 14:00 회의\` 일정 추가 (시각 생략 가능)
- \`/실행 이름\` 런처 실행
- \`/루틴 이름\` 루틴 실행
- \`/검색 질문\` 웹 검색 후 요약
- \`/날씨\`, \`/뉴스\` 정보 새로고침
- \`/초기화\` 대화 초기화
그 외 문장은 AI 비서에게 그대로 전달됩니다.`;

function findNamed(list, name) {
  const n = name.trim().toLowerCase();
  return list.find((x) => x.name.toLowerCase() === n || x.id.toLowerCase() === n) || list.find((x) => x.name.toLowerCase().includes(n));
}

async function handleSlash(input) {
  const [cmd, ...rest] = input.slice(1).split(" ");
  const arg = rest.join(" ").trim();
  const sys = (t) => Chat.add("sys", esc(t));
  switch (cmd) {
    case "도움말":
    case "help":
    case "?":
      Chat.add("ai", miniMarkdown(HELP));
      return;
    case "메모":
      if (!arg) return sys("메모 내용을 입력하세요.");
      await addMemo(arg);
      showTab("memos");
      return sys(`메모를 저장했습니다.`);
    case "할일": {
      if (!arg) return sys("할 일 내용을 입력하세요.");
      await saveKey("todos", [...State.data.todos, { id: await jarvis.newId(), text: arg, done: false, due: "" }]);
      renderTodos();
      showTab("todos");
      return sys(`할 일 추가: ${arg}`);
    }
    case "일정": {
      const m = arg.match(/^(\d{4}-\d{2}-\d{2})\s+(?:(\d{1,2}:\d{2})\s+)?(.+)$/);
      if (!m) return sys("형식: /일정 YYYY-MM-DD [HH:MM] 제목");
      const time = m[2] ? m[2].padStart(5, "0") : "";
      await saveKey("events", [...State.data.events, { id: await jarvis.newId(), title: m[3], date: m[1], time }]);
      renderEvents();
      showTab("events");
      return sys(`일정 추가: ${m[1]} ${time} ${m[3]}`);
    }
    case "실행": {
      const l = findNamed(State.data.launchers, arg);
      if (!l) return sys(`등록된 런처가 없습니다: ${arg}`);
      await launchById(l.id);
      return sys(`${l.name} 실행`);
    }
    case "루틴": {
      const r = findNamed(State.data.routines, arg);
      if (!r) return sys(`등록된 루틴이 없습니다: ${arg}`);
      sys(`루틴 “${r.name}” 실행`);
      return runRoutineById(r.id);
    }
    case "검색":
      if (!arg) return sys("검색할 내용을 입력하세요.");
      return Chat.ask(`웹에서 검색해서 핵심만 요약해줘: ${arg}`, `🔍 ${arg}`);
    case "날씨":
      await updateWeather();
      return sys("날씨를 새로고침했습니다.");
    case "뉴스":
      await updateNews();
      return sys("뉴스를 새로고침했습니다.");
    case "초기화":
      await jarvis.ai.reset();
      $("#chat-log").innerHTML = "";
      return sys("대화를 초기화했습니다.");
    default:
      return sys(`알 수 없는 명령: /${cmd}  ( /도움말 로 목록 확인 )`);
  }
}

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text || Chat.busy) return;
  input.value = "";
  if (text.startsWith("/")) {
    try {
      await handleSlash(text);
    } catch (err) {
      Chat.add("sys", esc(`오류: ${err.message}`));
    }
  } else {
    Chat.ask(text);
  }
});

$("#chat-reset").addEventListener("click", async () => {
  await jarvis.ai.reset();
  $("#chat-log").innerHTML = "";
  Chat.add("sys", "대화를 초기화했습니다.");
});
