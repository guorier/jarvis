// 위젯: 시스템, 네트워크, 프로세스, 스마트홈, 날씨, 일정, 할 일, 메모, 뉴스, 환율, 런처 독
const State = { data: null };

async function reloadData() {
  State.data = await jarvis.store.all();
  return State.data;
}

async function saveKey(key, value) {
  await jarvis.store.set(key, value);
  State.data[key] = value;
}

// ---------- 시스템 ----------
const netHistory = { down: [], up: [] };
function drawNetChart() {
  const cv = $("#net-chart");
  const w = (cv.width = cv.clientWidth * devicePixelRatio);
  const h = (cv.height = 34 * devicePixelRatio);
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(1024 * 50, ...netHistory.down, ...netHistory.up);
  const draw = (arr, color, fill) => {
    if (arr.length < 2) return;
    const step = w / 59;
    ctx.beginPath();
    arr.forEach((v, i) => {
      const x = w - (arr.length - 1 - i) * step;
      const y = h - (v / max) * (h - 4) - 2;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * devicePixelRatio;
    ctx.stroke();
    ctx.lineTo(w, h);
    ctx.lineTo(w - (arr.length - 1) * step, h);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  draw(netHistory.down, "#49b8ff", "rgba(73,184,255,0.14)");
  draw(netHistory.up, "#ffb21e", "rgba(255,178,30,0.08)");
}

// SYSTEM 4칸 파형 그래프 (app.js 시작 시 initMonitors()로 만든다)
const Graphs = {};
function initMonitors() {
  Graphs.cpu = new LineGraph($("#g-cpu"), { lines: 2, colors: ["#49b8ff", "#a6dcff"] });
  Graphs.mem = new LineGraph($("#g-mem"), { colors: ["#6fe0f5"] });
  Graphs.gpu = new LineGraph($("#g-gpu"), { colors: ["#9bb6ff"] });
  Graphs.npu = new LineGraph($("#g-npu"), { colors: ["#5ff0c0"] });
}
function monValue(key, val) {
  const el = $(`#${key}-val`);
  const mon = $(`[data-mon="${key}"]`);
  if (val == null) {
    el._val = null;
    el.textContent = "N/A";
  } else tweenNumber(el, Math.round(val));
  mon.classList.toggle("na", val == null);
  mon.classList.toggle("warn", val != null && val >= 70 && val < 90);
  mon.classList.toggle("hot", val != null && val >= 90);
}
const sysHeader = { temp: "", bat: "" };
function renderSysHeader() {
  $("#sys-temp").textContent = [sysHeader.temp, sysHeader.bat].filter(Boolean).join(" · ") || "--";
}

let lastGpu = null;
let fastBusy = false;
let slowBusy = false;
async function updateFast() {
  if (fastBusy) return; // 이전 조회가 끝나기 전에는 겹쳐 부르지 않는다
  fastBusy = true;
  try {
    const s = await jarvis.sys.fast();
    // eDEX 스타일 4칸: CPU · MEMORY · GPU · NPU (모두 같은 구성: 이름·%·파형·통계 2개)
    sysHeader.temp = s.tempC != null ? `${s.tempC}°C` : "온도 N/A";
    renderSysHeader();
    // CPU — 코어 앞·뒤 절반 두 줄
    monValue("cpu", s.cpu);
    Graphs.cpu.push(s.coreGroups || (s.cpu != null ? [s.cpu, s.cpu] : null));
    $("#cpu-cores").textContent = s.coreCount ? `${s.coreCount}C` : "";
    $("#cpu-cores").title = s.coreGroups ? `코어 #1-${Math.ceil(s.coreCount / 2)}: ${s.coreGroups[0]}% · #${Math.ceil(s.coreCount / 2) + 1}-${s.coreCount}: ${s.coreGroups[1]}%` : "";
    $("#st-spd").textContent = s.ghz != null ? `${s.ghz}GHz` : "--";
    $("#st-spd").title = s.ghzMax != null ? `최대 ${s.ghzMax}GHz` : "";
    // MEMORY
    monValue("mem", s.ram);
    Graphs.mem.push(s.ram != null ? [s.ram] : null);
    $("#sys-ram").textContent = s.ramUsedGB != null ? `${s.ramUsedGB}/${Math.round(s.ramTotalGB)}G` : "--";
    $("#sys-ram").title = s.ramAvailGB != null ? `사용 가능 ${s.ramAvailGB}GB` : "";
    $("#st-swap").textContent = s.swapPct != null ? `${s.swapPct}%` : "--";
    // GPU · NPU — Windows 성능 카운터 (수집 전이거나 장치가 없으면 N/A)
    const gpu = s.accel && s.accel.gpu;
    const npu = s.accel && s.accel.npu;
    monValue("gpu", gpu ? gpu.util : null);
    Graphs.gpu.push(gpu ? [gpu.util] : null);
    $("#st-gvideo").textContent = gpu ? `${Math.round(gpu.utilVideo)}%` : "--";
    $("#st-vram").textContent = gpu ? `${gpu.dedGB.toFixed(1)}G` : "--";
    $("#st-vram").title = gpu ? `전용 ${gpu.dedGB.toFixed(2)}GB · 공유 ${gpu.sharedGB.toFixed(2)}GB` : "";
    monValue("npu", npu ? npu.util : null);
    Graphs.npu.push(npu ? [npu.util] : null);
    $("#st-nmem").textContent = npu ? `${(npu.dedGB + npu.sharedGB).toFixed(1)}G` : "--";
    $("#st-nstate").textContent = npu ? (npu.util >= 1 ? "ACTIVE" : "IDLE") : "N/A";
    $('[data-mon="npu"]').classList.toggle("active", !!(npu && npu.util >= 1));
    $("#net-down").textContent = fmtBytesPerSec(s.netDown);
    $("#net-up").textContent = fmtBytesPerSec(s.netUp);
    netHistory.down.push(s.netDown || 0);
    netHistory.up.push(s.netUp || 0);
    if (netHistory.down.length > 60) netHistory.down.shift(), netHistory.up.shift();
    drawNetChart();
  } catch (e) {
    logLine(`시스템 정보 오류: ${e.message}`, "error");
  } finally {
    fastBusy = false;
  }
}

async function updateSlow() {
  if (slowBusy) return;
  slowBusy = true;
  try {
    const s = await jarvis.sys.slow();
    lastGpu = s.gpu;
    sysHeader.bat = s.battery ? `배터리 ${s.battery.percent}%${s.battery.charging ? "⚡" : ""}` : "";
    renderSysHeader();
    $('[data-mon="gpu"]').title = s.gpu ? s.gpu.model : "";
    $("#disks").innerHTML = s.disks
      .map(
        (d) => `<div class="disk"><div class="row"><span>${esc(d.mount)}</span><b>${d.usedGB} / ${d.sizeGB} GB</b></div>
        <div class="bar ${d.usePct >= 90 ? "warn" : ""}"><i style="width:${d.usePct}%"></i></div></div>`
      )
      .join("");
    $("#proc-count").textContent = s.processCount ? `${s.processCount}개` : "--";
    $("#st-tasks").textContent = s.processCount || "--";
    $("#proc-list").innerHTML = s.processes
      .map((p) => `<tr><td title="${esc(p.name)}">${esc(p.name)}</td><td>${p.cpu}%</td><td>${p.memMB}M</td></tr>`)
      .join("");
  } catch (e) {
    logLine(`시스템 정보 오류: ${e.message}`, "error");
  } finally {
    slowBusy = false;
  }
}

// ---------- 스마트홈 ----------
async function updateHome() {
  const box = $("#home-devices");
  try {
    const r = await jarvis.ha.states();
    if (!r.configured) {
      box.innerHTML = `<div class="empty">설정(⚙)에서 Home Assistant 주소와 토큰을 입력하면 기기를 제어할 수 있습니다.</div>`;
      return;
    }
    if (!r.devices.length) {
      box.innerHTML = `<div class="empty">등록된 기기가 없습니다. 설정에서 entity_id를 추가하세요.</div>`;
      return;
    }
    box.innerHTML = r.devices
      .map(
        (d) => `<button class="device ${d.state === "on" ? "on" : ""}" data-id="${esc(d.entity_id)}" title="${esc(d.entity_id)}">
        <b>${esc(d.name || d.entity_id)}</b><small>${esc(d.state === "on" ? "켜짐" : d.state === "off" ? "꺼짐" : d.state)}</small></button>`
      )
      .join("");
  } catch (e) {
    box.innerHTML = `<div class="empty">연결 실패: ${esc(e.message)}</div>`;
  }
}

$("#home-devices").addEventListener("click", async (e) => {
  const btn = e.target.closest(".device");
  if (!btn) return;
  Sound.click();
  try {
    await jarvis.ha.call(btn.dataset.id, "toggle");
    setTimeout(updateHome, 600);
  } catch (err) {
    pushNotice(err.message, "error");
  }
});
$("#home-refresh").addEventListener("click", updateHome);

// ---------- 날씨 ----------
async function updateWeather() {
  try {
    const w = await jarvis.feed.weather();
    $("#w-city").textContent = w.city;
    $("#w-icon").textContent = w.current.icon;
    $("#w-temp").textContent = `${w.current.temp}°`;
    // 기온 링: -20° ~ 40° 범위를 0~100%로
    const frac = Math.max(0, Math.min(1, (w.current.temp + 20) / 60));
    $("#temp-arc").style.strokeDashoffset = String(301.6 * (1 - frac));
    $("#w-desc").textContent = `${w.current.desc} · 체감 ${w.current.feels}°`;
    $("#w-meta").innerHTML = `습도 ${w.current.humidity}%<br>바람 ${w.current.wind} km/h`;
    $("#w-hourly").innerHTML = w.hourly
      .map((h) => `<div>${h.time.slice(0, 2)}시<b>${h.icon}</b><b>${h.temp}°</b>${h.rain ? `${h.rain}%` : ""}</div>`)
      .join("");
    $("#w-daily").innerHTML = w.daily
      .slice(0, 4)
      .map((d, i) => {
        const dt = new Date(d.date + "T00:00");
        const label = i === 0 ? "오늘" : `${DOW[dt.getDay()]}요일`;
        return `<div><span>${label}</span><span>${d.icon}</span><small>${d.rain ? `☂ ${d.rain}%` : ""}</small><b>${d.min}° / ${d.max}°</b></div>`;
      })
      .join("");
    State.weather = w;
    if (w.lat != null) {
      Globe.setHome(w.lat, w.lon, w.city);
      $("#globe-label").textContent = w.city;
      $("#globe-label").title = `${w.lat.toFixed(2)}°, ${w.lon.toFixed(2)}°`;
    }
  } catch (e) {
    $("#w-desc").textContent = `날씨를 가져올 수 없습니다`;
    logLine(`날씨 오류: ${e.message}`, "error");
  }
}

// ---------- 일정 (달력) ----------
// 공간을 아끼려고 한 달 대신 2주(이번 주 + 다음 주)만 보여 준다. 화살표는 한 주씩 이동.
const weekStart = (d) => {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
};
const cal = { start: weekStart(new Date()), selected: todayStr() };

function renderCalendar() {
  const events = State.data.events;
  const has = new Set(events.map((e) => e.date));
  const today = todayStr();
  const end = new Date(cal.start);
  end.setDate(end.getDate() + 13);
  const label = `${cal.start.getMonth() + 1}.${cal.start.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
  let html = `<div class="cal-head"><button data-nav="-1" title="이전 주">◀</button><span>${label}</span><button data-nav="1" title="다음 주">▶</button></div>`;
  html += DOW.map((d) => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < 14; i++) {
    const d = new Date(cal.start);
    d.setDate(cal.start.getDate() + i);
    const ds = todayStr(d);
    const cls = ["day", ds < today && "other", ds === today && "today", ds === cal.selected && "sel", has.has(ds) && "has"]
      .filter(Boolean)
      .join(" ");
    html += `<div class="${cls}" data-date="${ds}">${d.getDate()}</div>`;
  }
  $("#calendar").innerHTML = html;
}

function renderEvents() {
  renderCalendar();
  const today = todayStr();
  const list = [...State.data.events]
    .filter((e) => e.date >= today || e.date === cal.selected)
    .sort((a, b) => (a.date + (a.time || "00:00")).localeCompare(b.date + (b.time || "00:00")));
  $("#event-list").innerHTML = list.length
    ? list
        .map((e) => {
          const label = e.date === today ? "오늘" : e.date.slice(5).replace("-", "/");
          return `<li data-id="${e.id}" class="${e.date === cal.selected ? "sel" : ""}"><span class="date-tag">${label} ${e.time || ""}</span><span class="grow">${esc(e.title)}</span><button class="x" title="삭제">✕</button></li>`;
        })
        .join("")
    : `<li><span class="grow" style="color:var(--dim)">예정된 일정이 없습니다.</span></li>`;
}

$("#calendar").addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    cal.start.setDate(cal.start.getDate() + 7 * Number(nav.dataset.nav));
    return renderCalendar();
  }
  const day = e.target.closest(".day");
  if (day) {
    cal.selected = day.dataset.date;
    $("#event-form").date.value = cal.selected;
    renderEvents();
  }
});

$("#event-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const ev = { id: await jarvis.newId(), title: f.title.value.trim(), date: f.date.value, time: f.time.value };
  if (!ev.title || !ev.date) return;
  await saveKey("events", [...State.data.events, ev]);
  f.title.value = "";
  f.time.value = "";
  Sound.click();
  logLine(`일정 추가: ${ev.date} ${ev.title}`);
  renderEvents();
});

$("#event-list").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("x")) return;
  const id = e.target.closest("li").dataset.id;
  await saveKey("events", State.data.events.filter((x) => x.id !== id));
  renderEvents();
});

// ---------- 할 일 ----------
function renderTodos() {
  const now = nowStamp();
  const todos = [...State.data.todos].sort((a, b) => a.done - b.done || (a.due || "9").localeCompare(b.due || "9"));
  $("#todo-list").innerHTML = todos.length
    ? todos
        .map(
          (t) => `<li data-id="${t.id}" class="${t.done ? "done" : ""} ${!t.done && t.due && t.due <= now ? "overdue" : ""}">
        <input type="checkbox" ${t.done ? "checked" : ""} /><span class="grow">${esc(t.text)}</span>
        ${t.due ? `<small>⏰ ${esc(t.due.slice(5))}</small>` : ""}<button class="x" title="삭제">✕</button></li>`
        )
        .join("")
    : `<li><span class="grow" style="color:var(--dim)">할 일이 없습니다.</span></li>`;
}

$("#todo-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const text = f.text.value.trim();
  if (!text) return;
  const due = f.due.value ? f.due.value.replace("T", " ") : "";
  await saveKey("todos", [...State.data.todos, { id: await jarvis.newId(), text, done: false, due }]);
  f.text.value = "";
  f.due.value = "";
  Sound.click();
  renderTodos();
});

$("#todo-list").addEventListener("click", async (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.classList.contains("x")) {
    await saveKey("todos", State.data.todos.filter((x) => x.id !== id));
  } else if (e.target.type === "checkbox") {
    await saveKey("todos", State.data.todos.map((x) => (x.id === id ? { ...x, done: e.target.checked } : x)));
    if (e.target.checked) Sound.done();
  } else return;
  renderTodos();
});

// ---------- 메모 ----------
function renderMemos() {
  const memos = State.data.memos;
  $("#memo-list").innerHTML = memos.length
    ? memos
        .map((m) => {
          const d = new Date(m.createdAt);
          return `<li data-id="${m.id}"><span class="grow memo-text">${esc(m.text)}</span><small>${pad(d.getMonth() + 1)}/${pad(d.getDate())}</small><button class="x" title="삭제">✕</button></li>`;
        })
        .join("")
    : `<li><span class="grow" style="color:var(--dim)">메모가 없습니다.</span></li>`;
}

async function addMemo(text) {
  await saveKey("memos", [{ id: await jarvis.newId(), text, createdAt: new Date().toISOString() }, ...State.data.memos]);
  renderMemos();
}

$("#memo-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = e.target.text.value.trim();
  if (!text) return;
  await addMemo(text);
  e.target.text.value = "";
  Sound.click();
});
$("#memo-form textarea").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.ctrlKey) $("#memo-form").requestSubmit();
});
$("#memo-list").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("x")) return;
  const id = e.target.closest("li").dataset.id;
  await saveKey("memos", State.data.memos.filter((x) => x.id !== id));
  renderMemos();
});

// 탭
function showTab(name) {
  $$("#p-personal .tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  $$("#p-personal .tab").forEach((t) => t.classList.toggle("hidden", t.dataset.tab !== name));
}
$("#p-personal .tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) showTab(b.dataset.tab);
});

// ---------- 뉴스 ----------
async function updateNews() {
  const kw = State.data.settings.newsKeyword;
  $("#news-kw").textContent = kw ? `“${kw}”` : "헤드라인";
  try {
    const items = await jarvis.feed.news();
    State.news = items;
    $("#news-list").innerHTML = items
      .map((n) => {
        // 제목 끝의 " - 언론사"는 출처 칸에 따로 표시한다.
        const title = n.source && n.title.endsWith(` - ${n.source}`) ? n.title.slice(0, -(n.source.length + 3)) : n.title;
        const d = n.date ? new Date(n.date) : null;
        const t = d && !isNaN(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
        return `<li data-link="${esc(n.link)}" title="${esc(n.title)}"><small>${t}</small><span>${esc(title)}</span><small>${esc(n.source)}</small></li>`;
      })
      .join("");
  } catch (e) {
    $("#news-list").innerHTML = `<li><span>뉴스를 가져올 수 없습니다: ${esc(e.message)}</span></li>`;
  }
}
$("#news-list").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-link]");
  if (li) jarvis.openUrl(li.dataset.link).catch((err) => pushNotice(err.message, "error"));
});
$("#news-refresh").addEventListener("click", updateNews);

// ---------- 환율 ----------
async function updateRates() {
  try {
    const r = await jarvis.feed.rates();
    $("#rates").innerHTML =
      r.rates.map((x) => `<div class="rate"><span>${x.unit ? x.unit + " " : ""}${x.code}</span><b>₩ ${x.krw.toLocaleString("ko-KR")}</b></div>`).join("") +
      `<div class="upd">기준: ${esc(new Date(r.updated).toLocaleString("ko-KR"))}</div>`;
  } catch (e) {
    $("#rates").innerHTML = `<div class="empty">환율을 가져올 수 없습니다.</div>`;
  }
}

// ---------- 런처 · 루틴 독 ----------
// 원자로 양옆 목록: 원에 가까운 가운데 항목은 선이 짧고, 위·아래로 갈수록 길어져 원을 따라 휜다.
function wireWidth(i, n) {
  if (n <= 1) return 20;
  const t = (i / (n - 1)) * 2 - 1; // -1 ~ 1
  return Math.round(16 + 46 * t * t);
}
function renderDock() {
  const ls = State.data.launchers.slice(0, 8);
  $("#dock-launchers").innerHTML = ls.length
    ? ls
        .map((l, i) => `<li><button data-id="${esc(l.id)}" title="${esc(l.target)}">${esc(l.name)}</button><span class="wire" style="--w:${wireWidth(i, ls.length)}px"></span></li>`)
        .join("")
    : `<li class="empty">설정에서 런처를 추가하세요</li>`;
  const rs = State.data.routines.slice(0, 8);
  $("#dock-routines").innerHTML = rs.length
    ? rs
        .map((r, i) => `<li><button class="routine" data-id="${esc(r.id)}">▶ ${esc(r.name)}</button><span class="wire" style="--w:${wireWidth(i, rs.length)}px"></span></li>`)
        .join("")
    : `<li class="empty">설정에서 루틴을 추가하세요</li>`;
}

async function launchById(id) {
  Sound.click();
  try {
    await jarvis.launch(id);
  } catch (e) {
    pushNotice(`실행 실패: ${e.message}`, "error");
    logLine(`실행 실패: ${e.message}`, "error");
  }
}

async function runRoutineById(id) {
  Sound.send();
  try {
    const res = await jarvis.runRoutine(id);
    const r = State.data.routines.find((x) => x.id === id);
    const failed = res.filter((x) => x.startsWith("실패")).length;
    pushNotice(`루틴 “${r ? r.name : id}” 완료${failed ? ` (실패 ${failed}건)` : ""}`, failed ? "error" : "info");
  } catch (e) {
    pushNotice(`루틴 실패: ${e.message}`, "error");
  }
}

$("#dock-launchers").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (b) launchById(b.dataset.id);
});
$("#dock-routines").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (b) runRoutineById(b.dataset.id);
});
