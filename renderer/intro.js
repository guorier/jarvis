// 로딩 연출: 부팅 로그 → WELCOME BACK 상자 → 패널 테두리가 그려지며 HUD 조립
// 앱을 켤 때 한 번만 실행된다(드문 순간이라 연출 허용). 아무 키나 클릭으로 건너뛸 수 있다.
const Intro = {
  skipped: false,
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

  // 가운데부터, 좌우가 짝을 이뤄 바깥으로 퍼지는 순서
  groups: [
    [".daystrip"],
    [".stage", ".topbar"],
    [".chrono", "#p-weather"],
    ["#p-system", "#p-personal"],
    ["#p-net", ".chat", "#p-proc"],
    ["#p-notice", ".round-dock"],
    ["#p-home"],
    ["#p-news", "#p-rates", "#p-log"]
  ],

  prepare() {
    for (const g of this.groups) for (const sel of g) $$(sel).forEach((el) => el.classList.add("rv"));
    $$(".round-dock .rbtn").forEach((b, i) => b.style.setProperty("--k", i));
    // 엠블럼에서 "선이 그려질" 요소 표시
    $$("#core .em-rim, #core .em-inner, #core .em-band, #core .em-band-edge, #core .em-line, #core .em-yellow, #core .em-rim-inner").forEach((el) => {
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
      if (title) setTimeout(() => scrambleText(title, 700), 350);
      setTimeout(() => core.classList.remove("drawing"), 1600);
    }
    if (!this.skipped) Sound.beep(1800 + Math.random() * 600, 0.025, "square", 0.012);
  },

  async bootLog() {
    const lines = [
      ["J.A.R.V.I.S. KERNEL v0.1", ""],
      ["INITIALIZING CORE SYSTEMS", "OK"],
      ["LOADING USER PROFILE", "OK"],
      ["CPU / MEMORY TELEMETRY", "OK"],
      ["GEOLOCATION & WEATHER FEED", "OK"],
      ["NEWS · EXCHANGE FEED", "OK"],
      ["SMART HOME BRIDGE", "STANDBY"],
      ["AI ASSISTANT LINK", "READY"],
      ["RENDERING HUD", "..."]
    ];
    const logEl = $("#boot-log");
    const bar = $("#boot-progress");
    Sound.boot();
    for (let i = 0; i < lines.length; i++) {
      const [label, st] = lines[i];
      const dots = st ? " " + ".".repeat(Math.max(2, 30 - label.length)) + " " : "";
      const cls = st === "OK" || st === "READY" ? "ok" : st === "STANDBY" ? "warn" : "";
      logEl.insertAdjacentHTML("beforeend", `<div>&gt; ${esc(label)}${dots}<b class="${cls}">${esc(st)}</b></div>`);
      bar.style.width = `${((i + 1) / lines.length) * 100}%`;
      await this.sleep(90);
    }
    await this.sleep(180);
  },

  async welcome() {
    const box = $("#welcome");
    const name = (State.data && State.data.settings.userName) || "";
    $("#wl-name").textContent = name;
    $(".boot-inner").classList.add("out");
    box.hidden = false;
    box.classList.add("in");
    scrambleText($("#wl-title"), 520);
    await this.sleep(260);
    scrambleText($("#wl-name"), 420);
    await this.sleep(900);
    box.classList.add("out");
    await this.sleep(280);
  },

  async run() {
    this.prepare();
    const onSkip = () => this.skip();
    window.addEventListener("keydown", onSkip, { once: true });
    window.addEventListener("mousedown", onSkip, { once: true });

    if (!REDUCED) {
      await this.bootLog();
      await this.welcome();
    }
    $("#boot").classList.add("done");
    setTimeout(() => $("#boot") && $("#boot").remove(), 700);

    for (const g of this.groups) {
      for (const sel of g) $$(sel).forEach((el) => this.reveal(el));
      await this.sleep(110);
    }
    // 건너뛴 경우 남은 것까지 한 번에
    for (const g of this.groups) for (const sel of g) $$(sel).forEach((el) => this.reveal(el));
    Globe.start();
    window.removeEventListener("keydown", onSkip);
    window.removeEventListener("mousedown", onSkip);
    setTimeout(() => $("#app").classList.add("assembled"), 900);
  }
};
