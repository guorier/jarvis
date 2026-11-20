// ============================================================================
// [코드 리뷰] main.js — Electron 메인 프로세스 (앱의 "뒤편")
// 역할: 창 만들기, 화면 ↔ 기능을 잇는 IPC 통로 등록, 리마인더 알림, GPU·NPU 수집기 시작
// 흐름: app.whenReady → Store(데이터) → Assistant(AI) → registerIpc → accel.start → createWindow
//
// 좋은 점
//  - contextIsolation + sandbox + nodeIntegration:false 로 화면 코드가 Node 기능에 직접 닿지 못한다.
//  - IPC는 handle()로 감싸 { ok, data | error } 한 가지 모양으로만 돌려줘 화면 쪽 오류 처리가 단순하다.
//  - API 키·토큰은 화면으로 보낼 때 마스킹하고, 마스킹된 값이 돌아오면 기존 값을 유지한다.
//  - 외부 링크는 창 안에서 열지 않고 http/https만 기본 브라우저로 넘긴다.
//
// 개선 포인트 (아래 [리뷰-M*] 주석 참고)
//  - [리뷰-M1] 시스템 정보 수집(systeminformation)이 메인 프로세스에서 돌아, 그동안 창 그리기가 잠깐 멈춘다.
//  - [리뷰-M2] store:set은 키 이름만 확인하고 값의 모양은 검사하지 않는다.
//  - [리뷰-M3] 개발용 환경변수(JARVIS_*) 분기가 설치본에도 그대로 들어 있다.
// ============================================================================
const { app, BrowserWindow, ipcMain, shell, Notification } = require("electron");
const path = require("path");
const { Store, newId } = require("./src/store");
const system = require("./src/system");
const feeds = require("./src/feeds");
const control = require("./src/control");
const { Assistant } = require("./src/ai");

// 개발 실행과 설치본이 같은 데이터 폴더(%APPDATA%\jarvis-hud)를 쓰도록 고정한다.
app.setPath("userData", path.join(app.getPath("appData"), "jarvis-hud"));

let win;
let store;
let assistant;

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};
const log = (text, level = "info") => send("log", { text, level, at: Date.now() });

function createWindow() {
  // [리뷰-M3] 아래 JARVIS_* 개발용 분기는 설치본에서도 환경변수만 있으면 동작한다.
  //           해는 없지만 `if (!app.isPackaged)`로 감싸 두면 배포본이 더 깔끔하다.
  // 개발용: JARVIS_SIZE="1366x768" 이면 그 크기(내용 영역)로 창을 만든다
  const devSize = process.env.JARVIS_SIZE ? process.env.JARVIS_SIZE.split("x").map(Number) : null;
  win = new BrowserWindow({
    width: devSize ? devSize[0] : 1600,
    height: devSize ? devSize[1] : 950,
    useContentSize: !!devSize,
    minWidth: devSize ? 800 : 1100,
    minHeight: devSize ? 600 : 700,
    backgroundColor: "#03080f",
    title: "J.A.R.V.I.S.",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (!process.env.JARVIS_SNAPSHOT && !devSize) win.maximize();
  // 개발용: JARVIS_INTRO_SLOW=4 이면 로딩 연출 장면 간격을 4배로 늘려 캡처로 확인하기 쉽게 한다
  // JARVIS_FPS=1 이면 로딩 중 프레임 간격(끊김)을 재서 콘솔에 남긴다
  const query = {};
  if (process.env.JARVIS_INTRO_SLOW) query.slow = process.env.JARVIS_INTRO_SLOW;
  if (process.env.JARVIS_FPS) query.fps = "1";
  win.loadFile(path.join(__dirname, "renderer", "index.html"), Object.keys(query).length ? { query } : undefined);
  // 개발용: JARVIS_ZOOM=0.55 처럼 화면을 축소해 넓은 모니터(예: 2560px 폭)를 흉내 낸다
  // [리뷰] Electron은 확대 비율을 페이지 주소(file://)별로 기억한다. 테스트 뒤에는 JARVIS_ZOOM=1로 한 번 실행해 되돌릴 것.
  if (process.env.JARVIS_ZOOM) win.webContents.on("did-finish-load", () => win.webContents.setZoomFactor(Number(process.env.JARVIS_ZOOM)));

  // 개발용: JARVIS_DEBUG=1이면 화면 콘솔을 터미널에 출력, JARVIS_SNAPSHOT=경로면 8초 뒤 화면을 캡처한다.
  if (process.env.JARVIS_DEBUG) {
    win.webContents.on("console-message", (e) => console.log(`[renderer:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`));
  }
  if (process.env.JARVIS_SNAPSHOT) {
    // JARVIS_SNAPSHOT_TIMES="600,1500,3000" 이면 그 시점마다 <경로>-<ms>.png 로 여러 장 찍는다
    const times = (process.env.JARVIS_SNAPSHOT_TIMES || "8000").split(",").map(Number);
    const base = process.env.JARVIS_SNAPSHOT.replace(/\.png$/i, "");
    // dom-ready 기준: did-finish-load는 웹 글꼴을 기다려 늦게 오므로 로딩 연출 시각과 어긋난다
    win.webContents.once("dom-ready", async () => {
      const vp = await win.webContents.executeJavaScript("JSON.stringify({w:innerWidth,h:innerHeight,dpr:devicePixelRatio})");
      console.log("viewport", vp, "maximized", win.isMaximized());
      for (const t of times) {
        setTimeout(async () => {
          const img = await win.webContents.capturePage();
          const out = times.length > 1 ? `${base}-${t}.png` : process.env.JARVIS_SNAPSHOT;
          require("fs").writeFileSync(out, img.toPNG());
          console.log("snapshot saved", out);
        }, t);
      }
    });
  }
  // 화면 안의 링크는 외부 브라우저로 연다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
}

// 리마인더: 30초마다(아래 setInterval) 기한이 된 할 일을 알린다.
// [리뷰] 이미 알린 목록(notified)은 메모리에만 있어서, 앱을 다시 켜면 기한이 지난 미완료 할 일을 한 번 더 알린다.
//        "놓친 알림 다시 보기"로는 괜찮은 동작이지만, 원치 않으면 알린 id를 저장소에 남겨야 한다.
const notified = new Set();
function checkReminders() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  for (const t of store.get("todos")) {
    if (!t.done && t.due && t.due <= stamp && !notified.has(t.id)) {
      notified.add(t.id);
      new Notification({ title: "J.A.R.V.I.S. 리마인더", body: t.text }).show();
      send("notice", { kind: "reminder", text: t.text, at: Date.now() });
      log(`리마인더: ${t.text}`, "warn");
    }
  }
}

function registerIpc() {
  const handle = (channel, fn) =>
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return { ok: true, data: await fn(...args) };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    });

  // 저장소
  handle("store:all", () => {
    const { settings, ...rest } = store.all();
    // 비밀값은 화면에 그대로 보내지 않는다.
    const mask = (v) => (v ? "••••" + v.slice(-4) : "");
    return {
      ...rest,
      settings: {
        ...settings,
        apiKey: mask(settings.apiKey),
        geminiKey: mask(settings.geminiKey),
        naverClientSecret: mask(settings.naverClientSecret),
        haToken: settings.haToken ? "••••" : ""
      }
    };
  });
  // [리뷰-M2] 키 이름은 Store.set이 확인하지만 값의 모양(배열인지, 필드가 맞는지)은 검사하지 않는다.
  //           화면 코드만 부르는 통로(CSP로 외부 스크립트 차단)라 지금은 괜찮지만, 잘못된 값이 저장되면
  //           다음 실행에서 화면이 깨질 수 있다 → 키별 간단한 형식 검사를 두면 안전하다.
  handle("store:set", (key, value) => {
    if (key === "settings") {
      const cur = store.get("settings");
      // 마스킹된 값이 그대로 돌아오면 기존 비밀값을 유지한다.
      if (typeof value.apiKey === "string" && value.apiKey.startsWith("••••")) value.apiKey = cur.apiKey;
      if (typeof value.geminiKey === "string" && value.geminiKey.startsWith("••••")) value.geminiKey = cur.geminiKey;
      if (typeof value.naverClientSecret === "string" && value.naverClientSecret.startsWith("••••")) value.naverClientSecret = cur.naverClientSecret;
      if (typeof value.haToken === "string" && value.haToken.startsWith("••••")) value.haToken = cur.haToken;
      value = { ...cur, ...value };
    }
    store.set(key, value);
    return true;
  });
  handle("id:new", () => newId());

  // 시스템
  // [리뷰-M1] systeminformation 조회는 메인 프로세스에서 돌아 그동안 창 그리기(합성)가 0.1~0.5초 멈춘다.
  //           로딩 중에는 검은 화면 순간으로 첫 호출을 미뤄 숨겼지만(intro.js fireBlack), 2초·10초 주기 호출 때
  //           짧은 끊김은 남아 있다 → Electron utilityProcess(별도 프로세스)로 옮기는 것을 권장.
  handle("sys:fast", () => system.getFast());
  handle("sys:slow", () => system.getSlow());

  // 피드
  handle("feed:weather", () => feeds.getWeather(store.get("settings").city));
  handle("feed:news", () => feeds.getNews(store.get("settings").newsKeyword));
  handle("feed:rates", () => feeds.getRates());

  // 제어
  handle("launch", async (id) => {
    const l = store.get("launchers").find((x) => x.id === id);
    if (!l) throw new Error("런처 항목을 찾을 수 없습니다.");
    const r = await control.launch(l);
    log(r);
    return r;
  });
  handle("routine:run", async (id) => {
    const r = store.get("routines").find((x) => x.id === id);
    if (!r) throw new Error("루틴을 찾을 수 없습니다.");
    log(`루틴 시작: ${r.name}`);
    const res = await control.runRoutine(r, store, (t) => log(`  ${t}`));
    log(`루틴 완료: ${r.name}`);
    return res;
  });
  handle("ha:states", () => control.haStates(store.get("settings")));
  handle("ha:call", async (entityId, action) => {
    const r = await control.haCall(store.get("settings"), entityId, action);
    log(`스마트홈: ${r}`);
    return r;
  });
  handle("open:url", (url) => {
    if (!/^https?:\/\//.test(url)) throw new Error("http/https 주소만 열 수 있습니다.");
    return shell.openExternal(url);
  });

  // AI 비서
  handle("ai:chat", async (requestId, text) => {
    await assistant.chat(text, (ev) => send("ai:event", { requestId, ...ev }));
    return true;
  });
  handle("ai:reset", () => {
    assistant.reset();
    return true;
  });
}

app.whenReady().then(() => {
  store = new Store(app.getPath("userData"));
  assistant = new Assistant({
    store,
    onDataChanged: (key) => send("data:changed", key),
    onLog: (t) => log(`  ${t}`)
  });
  registerIpc();
  require("./src/accel").start(); // GPU·NPU 사용률 수집 시작
  createWindow();
  setInterval(checkReminders, 30 * 1000);
  setTimeout(checkReminders, 5000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => require("./src/accel").stop());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
