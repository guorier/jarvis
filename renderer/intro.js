// 로딩 연출 — 참고 영상(JARVIS START UP) 0~7.5초를 장면별로 따름. 모듈은 화면 가운데.
//  1장면(0~9.4s, 그중 진행 막대 약 2초): 선 3줄 → "Initiating system 1...." + 커서 → 위·아래 선이 벌어져 창이 열림
//                 → 왼쪽 점검 목록(항목 .... OK) + 오른쪽 코드 줄이 올라감 → CHECKSUM: OK
//                 → 선이 다시 좁혀지며 진행 칸 홈이 생김 → 칸이 차오름 → "System 1 loaded..." 글리치 → 어두워짐
//  2장면(10.5~16s): 검은 화면에 링 조립 → 충격파 → J.A.R.V.I.S 글자 → 링 회전
//  3장면: HUD의 엠블럼이 조립되고 주위로 패널이 차례로 붙음
// 앱을 켤 때 한 번만 실행된다(드문 순간이라 연출 허용). 아무 키나 클릭으로 건너뛸 수 있다.
const Intro = {
  skipped: false,
  onBlack: null, // 검은 화면 순간에 한 번 부르는 함수 (app.js가 시작 데이터 수집을 넣음)
  fireBlack() {
    const f = this.onBlack;
    this.onBlack = null;
    if (f) f();
  },
  timer: null,
  wake: null,

  sleep(ms) {
    if (this.skipped) return Promise.resolve();
    return new Promise((r) => {
      this.wake = r;
      this.timer = setTimeout(r, ms);
    });
  },

  skip() {
    if (this.skipped) return;
    this.skipped = true;
    clearTimeout(this.timer);
    if (this.wake) this.wake();
  },

  // 엠블럼이 먼저 조립되고, 가운데부터 좌우가 짝을 이뤄 바깥으로 퍼지는 순서
  groups: [
    [".stage"],
    [".daystrip", ".topbar"],
    [".chrono", "#p-weather"],
    ["#p-system", "#p-personal"],
    ["#p-net", ".chat", "#p-proc"],
    [".round-dock"],
    ["#p-news", "#p-rates", "#p-log"]
  ],

  prepare() {
    for (const g of this.groups) for (const sel of g) $$(sel).forEach((el) => el.classList.add("rv"));
    $$(".round-dock .rbtn").forEach((b, i) => b.style.setProperty("--k", i));
    // 엠블럼에서 "선이 그려질" 요소 (회전하며 들어오는 링은 .asm 래퍼가 담당)
    $$("#core .em-rim, #core .em-rim-inner, #core .em-line, #core .em-inner").forEach((el) => {
      el.setAttribute("pathLength", "1");
      el.classList.add("em-draw");
    });
  },

  reveal(el) {
    if (el.classList.contains("rv-in")) return;
    el.classList.add("rv-in");
    el.querySelectorAll(".panel > header > span, :scope > header > span, .sub-head > span, .tabs button").forEach((s) => scrambleText(s, 480));
    if (el.querySelector && el.querySelector("#globe")) Globe.start();
    if (el.classList.contains("stage")) {
      const core = $("#core");
      core.classList.add("drawing");
      const title = core.querySelector(".em-title");
      if (title) setTimeout(() => scrambleText(title, 700), 950);
      // 마지막 링: 지연 5×110 + 180 + 1150ms ≈ 1.9초
      setTimeout(() => core.classList.remove("drawing"), 2000);
    }
    if (!this.skipped) Sound.beep(1800 + Math.random() * 600, 0.025, "square", 0.012);
  },

  // 글자를 한 자씩 친다. 아직 안 친 글자는 보이지 않게 자리만 차지해서,
  // 가운데 정렬된 제목이 타이핑 중에 좌우로 움직이지 않는다. 건너뛰면 바로 전체를 보여 준다.
  async type(el, text, ms) {
    for (let i = 1; i <= text.length; i++) {
      if (this.skipped) break;
      el.innerHTML = `${esc(text.slice(0, i))}<span class="ghost">${esc(text.slice(i))}</span>`;
      await this.sleep(ms);
    }
    el.textContent = text;
  },

  // 시작 시각(ms)에 맞춰 기다린다. 앞 단계가 늦어져도 영상 타이밍을 따라간다.
  // 로딩 전체 길이 ≈ 16초 = 첫 대기 0.35초 + 진행 막대 외 장면(기준 7.1초 × pace ≈ 13.65초) + 진행 막대(STEP × 칸 수 ≈ 2초)
  // pace: 진행 막대를 뺀 나머지 장면의 빠르기 (1 = 기준 타이밍)
  pace: 1.92,
  // (개발용 ?slow=N 이면 전체를 N배 더 느리게 — 캡처 확인용)
  slow: Number(new URLSearchParams(location.search).get("slow")) || 1,
  async at(t0, ms) {
    await this.sleep(Math.max(0, t0 + ms * this.pace * this.slow - performance.now()));
  },

  // 2장면 링을 그린다. 각도는 12시 = 0°, 시계 방향.
  buildRings() {
    const arc = (r, a0, a1) => {
      const pt = (a) => {
        const t = (a * Math.PI) / 180;
        return `${(200 + r * Math.sin(t)).toFixed(2)} ${(200 - r * Math.cos(t)).toFixed(2)}`;
      };
      return `M ${pt(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1)}`;
    };
    // [클래스, 반지름, 시작각, 끝각] — 각도가 없으면 원 전체
    const groups = [
      { from: -60, spd: "40s", parts: [["br-thin", 188, 45, 380], ["br-tick", 182, 22, 42], ["br-thick", 188, -6, 10], ["br-thick", 188, 300, 312], ["br-thick", 188, 75, 112], ["br-thick", 188, 162, 186], ["br-thick", 188, 208, 222]] },
      { from: 120, spd: "26s", dir: "reverse", parts: [["br-dots", 170, 200, 300], ["br-dots", 176, 120, 200]] },
      { from: -150, spd: "18s", parts: [["br-thin", 141, 250, 440], ["br-thick", 141, -8, 8], ["br-thick", 141, 85, 105], ["br-thin", 141, 125, 220]] },
      { from: 200, spd: "14s", dir: "reverse", parts: [["br-cells", 122, -40, 95]] },
      { from: -90, spd: "22s", parts: [["br-dots lg", 158, 70, 140]] },
      { from: 160, spd: "16s", dir: "reverse", parts: [["br-ticks", 124, 150, 235], ["br-fine", 104]] },
      { from: -40, spd: "60s", parts: [["br-core", 94], ["br-thick", 100, 265, 275], ["br-thick", 100, 85, 95]] }
    ];
    const svg = $("#boot-rings-svg");
    let html = "";
    groups.forEach((g, i) => {
      const parts = g.parts
        .map(([cls, r, a0, a1]) => (a0 == null ? `<circle class="${cls}" cx="200" cy="200" r="${r}" />` : `<path class="${cls}" d="${arc(r, a0, a1)}" />`))
        .join("");
      html += `<g class="br" style="--i:${i};--from:${g.from}deg"><g class="br-spin" style="--spd:${g.spd};--dir:${g.dir || "normal"}">${parts}</g></g>`;
    });
    svg.innerHTML = html;
    // 충격파·제목은 GPU로 그려지는 HTML 요소로 (SVG 필터보다 훨씬 가볍다)
    if (!$("#boot-rings .br-wave")) svg.insertAdjacentHTML("afterend", `<div class="br-wave"></div><div class="br-title">J.A.R.V.I.S</div>`);
  },

  // 영상 0~7.5초를 장면별로 따라간다 (괄호 안 = 영상 시각)
  async bootLog() {
    const stage = $("#boot-stage");
    const head = $("#boot-text");
    const dots = $("#boot-dots");
    const logEl = $("#boot-log");
    const rings = $("#boot-rings");
    const CELLS = 19;
    $("#boot-cells").innerHTML = "<i></i>".repeat(CELLS);
    const cells = $$("#boot-cells i");
    this.buildRings();

    // 열린 창 왼쪽: 점검 목록 "항목 ........ OK"가 아래에서 쌓이며 올라간다
    const lines = [
      ["\\\\JARVIS-NET  127.0.0.1", ""],
      ["CORE SYSTEMS", "OK"],
      ["USER PROFILE", "OK"],
      ["CPU / MEMORY TELEMETRY", "OK"],
      ["GPU / NPU ACCELERATOR", "OK"],
      ["DISK · NETWORK MONITOR", "OK"],
      ["GEOLOCATION · WEATHER", "OK"],
      ["NEWS · EXCHANGE FEED", "OK"],
      ["LAUNCHERS · ROUTINES", "OK"],
      ["SCHEDULE · REMINDERS", "OK"],
      ["AI ASSISTANT LINK", "READY"],
      ["EXTEND SYSTEM MEMORY", "OK"]
    ];
    const addLine = ([label, st]) => {
      const lead = st ? " " + ".".repeat(Math.max(3, 30 - label.length)) + " " : "";
      const cls = st === "OK" || st === "READY" ? "ok" : "";
      logEl.insertAdjacentHTML("beforeend", `<div class="row">${esc(label)}${lead}<b class="${cls}">${esc(st)}</b></div>`);
      while (logEl.children.length > 12) logEl.firstElementChild.remove();
    };
    // 열린 창 오른쪽: 프로그램이 로드되는 것처럼 코드 줄이 빠르게 올라간다
    const codeEl = $("#boot-code");
    const ops = ["LOAD", "INIT", "MOUNT", "LINK", "SYNC", "MAP", "EXEC", "VERIFY"];
    const mods = ["core/kernel.sys", "hud/render.dll", "telemetry/cpu.mod", "telemetry/gpu.mod", "npu/accel.drv", "net/socket.io", "geo/locate.svc", "feed/weather.svc", "feed/news.rss", "fx/rates.svc", "ai/assistant.lnk", "store/userdata.db", "ui/emblem.svg", "ui/globe.mesh", "audio/fx.bank", "sched/reminder.svc"];
    const hex = (n) => Math.floor(Math.random() * 16 ** n).toString(16).toUpperCase().padStart(n, "0");
    const addCode = () => {
      const op = ops[Math.floor(Math.random() * ops.length)];
      const mod = mods[Math.floor(Math.random() * mods.length)];
      const kb = String(Math.floor(Math.random() * 900) + 12).padStart(4, " ");
      const bytes = Array.from({ length: 8 }, () => hex(2)).join(" ");
      codeEl.insertAdjacentHTML("beforeend", `<div class="row">0x${hex(8)}  ${op.padEnd(6)} ${mod.padEnd(20)} ${bytes}  ${kb}KB  CRC ${hex(4)}  ${hex(6)}</div>`);
      while (codeEl.children.length > 16) codeEl.firstElementChild.remove();
    };
    const streamCode = async (until) => {
      while (!this.skipped && performance.now() < until) {
        addCode();
        await this.sleep(42 * this.pace * this.slow);
      }
    };

    // CSS 애니메이션 길이도 같은 빠르기로 늘린다
    $("#boot").style.setProperty("--pace", String(this.pace * this.slow));
    // 첫 화면이 실제로 그려진 뒤에 시계를 시작한다 (앱이 막 뜰 때 바쁜 순간에 장면이 밀리지 않게)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // 효과음 장치(AudioContext)를 처음 만들 때 0.2초쯤 화면이 멈칫한다.
    // 첫 효과음 전에 미리 만들어 두고, 창이 막 뜬 직후의 흔들림과 함께 가운데 선만 보이는 동안 지나가게 한다.
    try {
      if (Sound.enabled && !Sound.ctx) Sound.ctx = new AudioContext();
    } catch {}
    await this.sleep(350 * this.slow);

    const t0 = performance.now();
    this.t0 = t0;
    Sound.boot();
    // 순서: 가운데 선 → 위·아래 선이 한 번에 켜지고(깜빡임 없음) 곧바로 벌어져 창이 열림
    //       → (다 열린 뒤) 제목 + 점검 목록 + 코드
    await this.at(t0, 100);
    stage.classList.add("lines");
    await this.at(t0, 330);
    stage.classList.add("open");
    // 창이 다 열리면(330 + 460 기준) 제목이 나타나 타이핑되고, 창 안에 목록·코드가 흐르기 시작
    await this.at(t0, 820);
    stage.classList.add("text", "feed");
    const typing = (async () => {
      await this.type(head, "Initiating system 1", 14 * this.pace);
      for (let d = 1; d <= 4; d++) {
        dots.textContent = ".".repeat(d);
        await this.sleep(45 * this.pace);
      }
    })();
    const code = streamCode(t0 + 2750 * this.pace * this.slow);
    for (let i = 0; i < lines.length; i++) {
      await this.at(t0, 920 + i * 125);
      addLine(lines[i]);
      if (!this.skipped) Sound.beep(2200 + Math.random() * 600, 0.015, "square", 0.008);
    }
    await typing;    // (2.5초) 목록이 다 끝나면 CHECKSUM: OK
    await this.at(t0, 2500);
    addLine(["", ""]);
    logEl.insertAdjacentHTML("beforeend", `<div class="big">CHECKSUM: <b class="ok">OK</b></div>`);
    await code;
    // (2.8초) 위·아래 선이 다시 좁혀지고, 아래 선이 왼쪽 끝까지 내려가 진행 칸 홈이 됨
    await this.at(t0, 2800);
    stage.classList.remove("open", "feed"); // 목록·코드는 선이 좁혀지기 시작할 때 먼저 사라진다
    stage.classList.add("channel");
    // (기준 3.2초~) 칸이 왼쪽부터 차오름(약 2초). 맨 앞 칸은 회색(켜지는 중)
    // 칸마다 시계 기준 시각에 맞춰 켜서, 시작할 때 PC가 바빠도 늘어지지 않는다
    const FILL = 3200;
    const STEP = 105; // 칸 하나당 실제 ms — 19칸 × 105ms ≈ 2초
    const FULL = FILL + (CELLS * STEP) / this.pace; // 칸이 다 찬 시각(pace 기준 단위) — 막대 길이는 pace와 무관하게 약 2초
    await this.at(t0, FILL);
    logEl.innerHTML = "";
    codeEl.innerHTML = "";
    for (let i = 0; i < CELLS; i++) {
      await this.at(t0, FILL + (i * STEP) / this.pace);
      if (i > 0) cells[i - 1].classList.replace("lead", "on");
      cells[i].classList.add("lead");
      if (!this.skipped) Sound.beep(1300 + i * 35, 0.018, "square", 0.009);
    }
    await this.at(t0, FULL);
    cells.forEach((c) => {
      c.classList.remove("lead");
      c.classList.add("on");
    });
    // 다 차고 0.15초 뒤 "System 1 loaded..." 글리치, 칸이 회색으로 식음
    await this.at(t0, FULL + 150);
    stage.classList.add("loaded");
    head.textContent = "System 1 loaded";
    dots.textContent = "...";
    // 이어서 전체가 어두워지고 → 검은 화면
    await this.at(t0, FULL + 350);
    stage.classList.add("dim");
    await this.at(t0, FULL + 550);
    stage.classList.add("gone");
    this.fireBlack(); // 화면이 검을 때 시작 데이터 수집 — 멈칫해도 보이지 않는다

    // 검은 화면에 링이 바깥부터 하나씩 돌며 들어오고, 들어온 링은 계속 돈다
    await this.at(t0, FULL + 1100);
    rings.classList.add("on");
    // 충격파
    await this.at(t0, FULL + 2100);
    rings.classList.add("wave");
    if (!this.skipped) Sound.beep(180, 0.25, "sine", 0.05);
    // J.A.R.V.I.S 글자가 크게 흐릿한 상태에서 줄어들며 또렷해짐
    await this.at(t0, FULL + 2850);
    rings.classList.add("title");
    if (!this.skipped) Sound.done();
    await this.at(t0, FULL + 3900);
  },

  async run() {
    this.prepare();
    const onSkip = () => this.skip();
    window.addEventListener("keydown", onSkip, { once: true });
    window.addEventListener("mousedown", onSkip, { once: true });

    const bootStart = performance.now();
    // 개발용 ?fps=1: 로딩 동안 프레임 간격을 기록해 끊김(긴 프레임)을 콘솔에 남긴다
    const fps = new URLSearchParams(location.search).has("fps") ? { gaps: [], last: 0, on: true, marks: [] } : null;
    if (fps) {
      const tick = (t) => {
        if (fps.last) fps.gaps.push([t - bootStart, t - fps.last]);
        fps.last = t;
        if (fps.on) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    if (!REDUCED) await this.bootLog();
    this.fireBlack(); // 로딩을 건너뛰었거나 줄인 모션이면 여기서
    if (fps) {
      fps.on = false;
      const long = fps.gaps.filter(([, g]) => g > 40);
      const res = performance.getEntriesByType("resource").filter((r) => /fonts\.(googleapis|gstatic)/.test(r.name)).map((r) => `${r.name.includes("gstatic") ? "글꼴파일" : "글꼴CSS"} ${(r.startTime / 1000).toFixed(2)}~${(r.responseEnd / 1000).toFixed(2)}s`);
      const nav = performance.getEntriesByType("navigation")[0];
      console.log(`[fps] 페이지 DOM완료 ${(nav.domContentLoadedEventEnd / 1000).toFixed(2)}s, 부팅시작 ${(bootStart / 1000).toFixed(2)}s, ${res.join(" / ")}`);
      console.log(`[fps] 시계 시작 ${((this.t0 - bootStart) / 1000).toFixed(2)}s, 프레임 ${fps.gaps.length}개, 평균 ${(fps.gaps.reduce((s, [, g]) => s + g, 0) / fps.gaps.length).toFixed(1)}ms, 40ms 넘는 프레임 ${long.length}개: ${long.map(([at, g]) => `${(at / 1000).toFixed(2)}s=${g.toFixed(0)}ms`).join(", ")}`);
    }
    console.log(`[intro] 로딩 ${((performance.now() - bootStart) / 1000).toFixed(2)}초${this.skipped ? " (건너뜀)" : ""}`);
    $("#boot").classList.add("done");
    setTimeout(() => $("#boot") && $("#boot").remove(), 700);

    for (const g of this.groups) {
      for (const sel of g) $$(sel).forEach((el) => this.reveal(el));
      // 엠블럼이 어느 정도 조립된 뒤에 주변 패널이 붙기 시작한다
      await this.sleep(g.includes(".stage") ? 1150 : 110);
    }
    // 건너뛴 경우 남은 것까지 한 번에
    for (const g of this.groups) for (const sel of g) $$(sel).forEach((el) => this.reveal(el));
    Globe.start();
    window.removeEventListener("keydown", onSkip);
    window.removeEventListener("mousedown", onSkip);
    setTimeout(() => $("#app").classList.add("assembled"), 900);
  }
};
