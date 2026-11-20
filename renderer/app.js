// 앱 시작: 부팅 시퀀스, 시계, 주기적 갱신, 커맨드 팔레트, 설정
// ============================================================================
// [코드 리뷰] renderer/app.js — 화면의 시작점과 전역 조작(시계, 팔레트, 설정, 주기 갱신)
// 시작 순서(맨 아래 start): 데이터 읽기 → 화면 그리기 → 지구본·그래프 준비 → 로딩 연출
//   → (로딩의 검은 화면 순간) 시스템·날씨·뉴스·환율 첫 조회 → 로딩 끝 → 인사 메시지 → 주기 갱신 시작
// 좋은 점
//  - 첫 시스템 조회를 로딩의 검은 화면 순간으로 미뤄, 메인 프로세스가 바쁜 순간이 화면에 보이지 않는다.
//  - 커맨드 팔레트는 일치 항목이 없으면 "AI에게 묻기"로 이어져 막다른 길이 없다.
//  - 설정 저장 시 런처·루틴 형식을 먼저 검사하고, 실패하면 저장하지 않고 이유를 보여 준다.
// 개선 포인트
//  - [리뷰] 설정 저장이 settings → launchers → routines 세 번에 나눠 저장된다. 중간에 실패하면 일부만 바뀐다.
//  - [리뷰] 주기 갱신(setInterval)이 창이 최소화돼도 계속 돈다. document.hidden일 때 건너뛰면 CPU를 아낀다.
//  - [리뷰] 스마트홈 패널을 없앴지만 설정 화면의 Home Assistant 칸은 남아 있다(AI 기기 제어용). 의도라면 OK.
// ============================================================================
// ---------- 시계 · 인사 ----------
function greetingFor(h) {
  if (h < 5) return "늦은 밤입니다";
  if (h < 12) return "좋은 아침입니다";
  if (h < 18) return "좋은 오후입니다";
  return "좋은 저녁입니다";
}
const RING_C = 301.6; // 2π × 48
let lastDayKey = "";
function tickClock() {
  const d = new Date();
  $("#clock").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  $("#clock-s").textContent = pad(d.getSeconds());
  $("#sec-arc").style.strokeDashoffset = String(RING_C * (1 - d.getSeconds() / 60));
  const name = State.data ? State.data.settings.userName : "";
  $("#greeting").textContent = `${greetingFor(d.getHours())}, ${name}.`;
  const dayKey = todayStr(d);
  if (dayKey !== lastDayKey) {
    lastDayKey = dayKey;
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    $("#date-month").textContent = `${d.getMonth() + 1}월`;
    $("#date-day").textContent = pad(d.getDate());
    $("#date-dow").textContent = `${DOW[d.getDay()]}요일`;
    $("#month-arc").style.strokeDashoffset = String(RING_C * (1 - d.getDate() / daysInMonth));
    renderDayStrip();
  }
}

// 상단 날짜 띠: 이번 달 1일~말일, 오늘 강조, 일정 있는 날 표시
function renderDayStrip() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const has = new Set((State.data ? State.data.events : []).map((e) => e.date));
  let html = "";
  for (let i = 1; i <= days; i++) {
    const dt = new Date(y, m, i);
    const ds = todayStr(dt);
    const cls = [i === d.getDate() && "today", i < d.getDate() && "past", (dt.getDay() === 0 || dt.getDay() === 6) && "we", has.has(ds) && "has"]
      .filter(Boolean)
      .join(" ");
    html += `<li class="${cls}" style="--k:${i}" title="${ds} ${DOW[dt.getDay()]}요일">${pad(i)}</li>`;
  }
  $("#daystrip").innerHTML = html;
  $("#ds-month").textContent = `${y}. ${pad(m + 1)}`;
}

// ---------- 부팅 시퀀스 ----------
// 로딩 연출은 intro.js의 Intro.run()이 담당한다.
function bootSequence() {
  return Intro.run();
}

// ---------- 전체 렌더 ----------
function applySettings() {
  const s = State.data.settings;
  Sound.enabled = s.sound;
  TTS.enabled = s.tts;
  $("#tts-toggle").classList.toggle("on", s.tts);
  $("#tts-toggle span").textContent = s.tts ? "음성 켬" : "음성";
}

// 원형 독 버튼
$(".round-dock").addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  Sound.click();
  const run = {
    briefing: () => Chat.ask("오늘 날씨, 일정, 할 일을 묶어서 짧게 브리핑해줘"),
    sysreport: () => Chat.ask("지금 PC 상태를 점검하고 이상이 있으면 알려줘"),
    news: updateNews,
    weather: updateWeather,
    reset: () => handleSlash("/초기화")
  }[b.dataset.action];
  if (run) Promise.resolve(run()).catch((err) => pushNotice(err.message, "error"));
});

function renderAll() {
  applySettings();
  renderEvents();
  renderTodos();
  renderMemos();
  renderDock();
  tickClock();
}

// ---------- 커맨드 팔레트 ----------
const Palette = {
  items: [],
  index: 0,
  build() {
    const cmds = [
      { icon: "📝", label: "메모 작성", hint: "/메모", run: () => prefill("/메모 ") },
      { icon: "✅", label: "할 일 추가", hint: "/할일", run: () => prefill("/할일 ") },
      { icon: "📅", label: "일정 추가", hint: "/일정", run: () => prefill(`/일정 ${todayStr()} `) },
      { icon: "🔍", label: "웹 검색 후 요약", hint: "/검색", run: () => prefill("/검색 ") },
      { icon: "🖥", label: "시스템 상태 분석", hint: "AI", run: () => Chat.ask("지금 PC 상태를 점검하고 이상이 있으면 알려줘") },
      { icon: "☀", label: "오늘 브리핑", hint: "AI", run: () => Chat.ask("오늘 날씨, 일정, 할 일을 묶어서 짧게 브리핑해줘") },
      { icon: "⛅", label: "날씨 새로고침", hint: "/날씨", run: updateWeather },
      { icon: "📰", label: "뉴스 새로고침", hint: "/뉴스", run: updateNews },
      { icon: "⟲", label: "대화 초기화", hint: "/초기화", run: () => handleSlash("/초기화") },
      { icon: "⚙", label: "설정 열기", hint: "", run: openSettings },
      ...State.data.launchers.map((l) => ({ icon: "🚀", label: `실행: ${l.name}`, hint: l.target, run: () => launchById(l.id) })),
      ...State.data.routines.map((r) => ({ icon: "▶", label: `루틴: ${r.name}`, hint: `${r.steps.length}단계`, run: () => runRoutineById(r.id) }))
    ];
    return cmds;
  },
  open() {
    this.all = this.build();
    $("#palette").classList.remove("hidden");
    $("#palette-input").value = "";
    this.filter("");
    $("#palette-input").focus();
    Sound.click();
  },
  close() {
    $("#palette").classList.add("hidden");
  },
  filter(q) {
    const n = q.trim().toLowerCase();
    this.items = this.all.filter((c) => !n || c.label.toLowerCase().includes(n) || (c.hint || "").toLowerCase().includes(n));
    // 일치하는 명령이 없으면 AI에게 바로 묻기
    if (n && !this.items.length) this.items = [{ icon: "💬", label: `AI에게 묻기: ${q}`, hint: "Enter", run: () => Chat.ask(q) }];
    this.index = 0;
    this.render();
  },
  render() {
    $("#palette-list").innerHTML = this.items
      .map((c, i) => `<li class="${i === this.index ? "on" : ""}" data-i="${i}"><i>${c.icon}</i><span>${esc(c.label)}</span><small>${esc(c.hint || "")}</small></li>`)
      .join("");
    const on = $("#palette-list li.on");
    if (on) on.scrollIntoView({ block: "nearest" });
  },
  choose(i) {
    const c = this.items[i];
    this.close();
    if (c) Promise.resolve(c.run()).catch((e) => pushNotice(e.message, "error"));
  }
};

function prefill(text) {
  const input = $("#chat-input");
  input.value = text;
  input.focus();
}

$("#palette-input").addEventListener("input", (e) => Palette.filter(e.target.value));
$("#palette-input").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") (Palette.index = Math.min(Palette.items.length - 1, Palette.index + 1)), Palette.render(), e.preventDefault();
  else if (e.key === "ArrowUp") (Palette.index = Math.max(0, Palette.index - 1)), Palette.render(), e.preventDefault();
  else if (e.key === "Enter") Palette.choose(Palette.index);
  else if (e.key === "Escape") Palette.close();
});
$("#palette-list").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-i]");
  if (li) Palette.choose(Number(li.dataset.i));
});
$("#palette").addEventListener("mousedown", (e) => {
  if (e.target.id === "palette") Palette.close();
});
$("#open-palette").addEventListener("click", () => Palette.open());

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("#palette").classList.contains("hidden") ? Palette.open() : Palette.close();
  } else if (e.key === "Escape") {
    Palette.close();
    closeSettings();
  } else if (e.key === "/" && document.activeElement === document.body) {
    e.preventDefault();
    prefill("/");
  }
});

// ---------- 설정 ----------
function openSettings() {
  const f = $("#settings-form");
  const s = State.data.settings;
  for (const k of ["userName", "city", "newsKeyword", "provider", "geminiKey", "geminiModel", "naverClientId", "naverClientSecret", "apiKey", "model", "effort", "haUrl", "haToken"]) f[k].value = s[k] || "";
  if (!f.provider.value) f.provider.value = "gemini";
  f.sound.checked = s.sound;
  f.tts.checked = s.tts;
  f.launchers.value = State.data.launchers.map((l) => `${l.name} | ${l.target}`).join("\n");
  f.routines.value = JSON.stringify(State.data.routines, null, 2);
  f.haEntities.value = (s.haEntities || []).map((e) => `${e.entity_id} | ${e.name}`).join("\n");
  $("#settings-msg").textContent = "";
  $("#settings").classList.remove("hidden");
}
function closeSettings() {
  $("#settings").classList.add("hidden");
}
$("#open-settings").addEventListener("click", openSettings);
$("#settings-close").addEventListener("click", closeSettings);

function parsePairs(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("|");
      if (i < 0) throw new Error(`"이름 | 값" 형식이 아닙니다: ${l}`);
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    });
}

$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const msg = $("#settings-msg");
  try {
    const launchers = parsePairs(f.launchers.value).map(([name, target]) => {
      const old = State.data.launchers.find((l) => l.name === name);
      return { id: old ? old.id : name, name, target };
    });
    let routines;
    try {
      routines = JSON.parse(f.routines.value || "[]");
    } catch {
      throw new Error("루틴 JSON 형식이 올바르지 않습니다.");
    }
    if (!Array.isArray(routines) || routines.some((r) => !r.id || !r.name || !Array.isArray(r.steps))) {
      throw new Error("루틴은 [{ id, name, steps: [...] }] 형식이어야 합니다.");
    }
    const haEntities = parsePairs(f.haEntities.value).map(([entity_id, name]) => ({ entity_id, name }));
    const settings = {
      userName: f.userName.value.trim() || "주인님",
      city: f.city.value.trim() || "Seoul",
      newsKeyword: f.newsKeyword.value.trim(),
      provider: f.provider.value,
      geminiKey: f.geminiKey.value.trim(),
      geminiModel: f.geminiModel.value.trim() || "gemini-3.8-flash",
      naverClientId: f.naverClientId.value.trim(),
      naverClientSecret: f.naverClientSecret.value.trim(),
      apiKey: f.apiKey.value.trim(),
      model: f.model.value.trim() || "claude-opus-5-5",
      effort: f.effort.value,
      sound: f.sound.checked,
      tts: f.tts.checked,
      haUrl: f.haUrl.value.trim(),
      haToken: f.haToken.value.trim(),
      haEntities
    };
    const cityChanged = settings.city !== State.data.settings.city;
    const kwChanged = settings.newsKeyword !== State.data.settings.newsKeyword;
    // [리뷰] 세 번에 나눠 저장 — 두 번째에서 실패하면 설정만 바뀐 상태가 된다. 한 번에 저장하는 IPC가 있으면 좋다.
    await jarvis.store.set("settings", settings);
    await jarvis.store.set("launchers", launchers);
    await jarvis.store.set("routines", routines);
    await reloadData();
    renderAll();
    if (cityChanged) updateWeather();
    if (kwChanged) updateNews();
    msg.className = "";
    msg.textContent = "저장했습니다.";
    logLine("설정 저장");
    setTimeout(closeSettings, 500);
  } catch (err) {
    msg.className = "err";
    msg.textContent = err.message;
  }
});

$("#tts-toggle").addEventListener("click", async () => {
  const tts = !State.data.settings.tts;
  await jarvis.store.set("settings", { tts });
  State.data.settings.tts = tts;
  applySettings();
  if (!tts) TTS.stop();
});

// ---------- 메인 프로세스 이벤트 ----------
jarvis.onLog((l) => logLine(l.text, l.level, l.at));
jarvis.onNotice((n) => {
  pushNotice(n.text, n.kind);
  Sound.done();
});
jarvis.onDataChanged(async (key) => {
  await reloadData();
  if (key === "todos") renderTodos(), showTab("todos");
  if (key === "events") renderEvents(), renderDayStrip(), showTab("events");
  if (key === "memos") renderMemos(), showTab("memos");
});

// ---------- 시작 ----------
(async function start() {
  await reloadData();
  $("#event-form").date.value = todayStr();
  renderAll();
  Globe.init($("#globe"));
  initMonitors();
  // 시스템 정보 수집(CPU·프로세스 등)은 메인 프로세스를 잠깐 바쁘게 해 화면이 멈칫한다.
  // 그래서 로딩 장면 사이 검은 화면일 때 처음 불러온다 (로딩을 건너뛰면 바로).
  Intro.onBlack = () => {
    updateFast();
    updateSlow();
    updateWeather();
    updateNews();
    updateRates();
  };
  const boot = bootSequence();
  logLine("J.A.R.V.I.S. 시작");
  await boot;
  Chat.add("ai", miniMarkdown(`${greetingFor(new Date().getHours())}, ${State.data.settings.userName}. 무엇을 도와드릴까요?\n\`/도움말\`로 명령 목록을, **Ctrl+K**로 커맨드 팔레트를 열 수 있습니다.`));
  pushNotice("시스템이 온라인 상태입니다.", "info");
  $("#chat-input").focus();

  // [리뷰] 창이 최소화돼도 아래 주기 조회는 계속된다(특히 2초마다 시스템 조회 → 메인 프로세스 부담).
  //        각 함수 앞에서 if (document.hidden) return; 하면 숨겨진 동안 쉬게 할 수 있다.
  setInterval(tickClock, 1000);
  setInterval(updateFast, 2000);
  setInterval(updateSlow, 10000);
  setInterval(updateWeather, 30 * 60 * 1000);
  setInterval(updateNews, 15 * 60 * 1000);
  setInterval(updateRates, 60 * 60 * 1000);
  setInterval(renderTodos, 60 * 1000); // 기한 지난 항목 표시 갱신
})();
