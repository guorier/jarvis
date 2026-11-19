// 앱 데이터(설정, 할 일, 일정, 메모, 런처, 루틴)를 userData 폴더의 JSON 파일에 저장한다.
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
    } catch {
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

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

module.exports = { Store, newId };
