// 앱 데이터(설정, 할 일, 일정, 메모, 런처, 루틴)를 userData 폴더의 JSON 파일에 저장한다.
// ============================================================================
// [코드 리뷰] src/store.js — JSON 파일 저장소 (%APPDATA%\jarvis-hud\jarvis-data.json)
// 좋은 점
//  - 임시 파일에 쓴 뒤 이름을 바꿔(rename) 저장 도중 꺼져도 파일이 반쯤 깨지지 않는다.
//  - 새 설정 항목이 생겨도 DEFAULTS.settings와 합쳐 읽어서 예전 파일과 호환된다.
//  - 모르는 키는 저장을 거부한다.
// 개선 포인트
//  - [리뷰-S1 해결] 파일이 깨져 읽기에 실패하면 jarvis-data.broken-<시각>.json으로 복사해 둔 뒤 초기화한다.
//                  (main.js가 시작할 때 이 사실을 시스템 로그에 알린다)
//  - [리뷰-S2] API 키·토큰이 평문으로 저장된다 → Electron safeStorage(Windows DPAPI)로 암호화 권장.
//  - [리뷰-S3] set()마다 파일 전체를 동기로 다시 쓴다. 지금 데이터 크기에선 문제없지만 커지면 묶어서 쓰기(debounce).
// ============================================================================
const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  settings: {
    userName: "주인님",
    city: "Seoul",
    newsKeyword: "",
    provider: "gemini", // "gemini"(무료 등급) 또는 "claude"(유료)
    geminiKey: "",
    geminiModel: "gemini-3.8-flash",
    naverClientId: "",
    naverClientSecret: "",
    apiKey: "",
    model: "claude-opus-5-5",
    effort: "low",
    tts: false,
    sound: true,
    haUrl: "",
    haToken: "",
    haEntities: [] // [{ entity_id, name }]
  },
  todos: [], // { id, text, done, due }
  events: [], // { id, title, date, time }
  memos: [], // { id, text, createdAt }
  launchers: [
    { id: "notepad", name: "메모장", target: "notepad.exe" },
    { id: "calc", name: "계산기", target: "calc.exe" },
    { id: "explorer", name: "탐색기", target: "explorer.exe" },
    { id: "google", name: "구글", target: "https://www.google.com" }
  ],
  routines: [
    {
      id: "work",
      name: "작업 모드",
      steps: [
        { type: "launch", launcherId: "explorer" },
        { type: "url", url: "https://www.google.com" },
        { type: "notify", text: "작업 모드를 시작합니다." }
      ]
    }
  ]
};

class Store {
  constructor(dir) {
    this.file = path.join(dir, "jarvis-data.json");
    this.data = structuredClone(DEFAULTS);
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      this.data = { ...this.data, ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
    } catch (err) {
      // [리뷰-S1 해결] 파일이 "없어서" 실패했는지 "깨져서" 실패했는지 구분한다.
      // 깨진 파일은 기본값으로 덮어쓰기 전에 jarvis-data.broken-<시각>.json으로 옮겨 두어, 손으로 되살릴 수 있게 한다.
      if (fs.existsSync(this.file)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        this.brokenFile = path.join(dir, `jarvis-data.broken-${stamp}.json`);
        try {
          fs.copyFileSync(this.file, this.brokenFile);
        } catch {
          this.brokenFile = null;
        }
        this.loadError = err.message;
      }
      this.save();
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    if (!(key in DEFAULTS)) throw new Error(`알 수 없는 저장 키: ${key}`);
    this.data[key] = value;
    this.save();
    return value;
  }

  all() {
    return this.data;
  }

  // [리뷰-S2] settings.apiKey / geminiKey / naverClientSecret / haToken이 그대로 파일에 들어간다.
  // [리뷰-S3] 메인 프로세스에서 동기 쓰기 — 저장 중에는 다른 처리가 잠깐 멈춘다(지금은 수 ms 수준).
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
}

// [리뷰] 시각 + 난수 5자리. 개인용 데이터 양에선 겹칠 일이 사실상 없다. (crypto.randomUUID()로 바꿔도 됨)
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

module.exports = { Store, newId };
