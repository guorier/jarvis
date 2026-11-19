// AI 비서: Claude API + 도구(시스템 상태, 앱 실행, 루틴, 할 일, 일정, 메모, 스마트홈, 날씨) + 웹 검색
const Anthropic = require("@anthropic-ai/sdk");
const { newId } = require("./store");
const system = require("./system");
const feeds = require("./feeds");
const control = require("./control");
const { GeminiProvider } = require("./gemini");

const SYSTEM_PROMPT = `당신은 J.A.R.V.I.S., 사용자의 데스크톱에서 동작하는 개인 AI 비서입니다.
- 항상 한국어로, 정중하고 간결하게 답합니다. 사용자를 설정된 호칭으로 부릅니다.
- 채팅 화면에 표시되므로 답은 짧게(보통 1~4문장) 하고, 목록이 필요할 때만 짧은 글머리표를 씁니다.
- 사용자가 무언가를 실행하거나 기록해 달라고 하면 해당 도구를 사용하고, 결과를 한 문장으로 알려줍니다.
- 앱 실행과 루틴은 등록된 항목만 가능합니다. 이름이 애매하면 list_launchers_and_routines로 확인한 뒤 실행합니다. 등록되지 않은 항목이면 설정의 런처 목록에 추가하라고 안내합니다.
- 최신 정보, 뉴스, 사실 확인, 맛집·가게·장소, 제품·사용법처럼 인터넷에서 찾아야 하는 질문은 web_search를 사용하고 핵심만 요약합니다.
- 일정의 날짜는 YYYY-MM-DD, 시각은 HH:MM(24시간) 형식으로 저장합니다. "내일", "다음 주 월요일" 같은 표현은 메시지에 포함된 현재 시각을 기준으로 계산합니다.
- 각 사용자 메시지 앞의 [컨텍스트] 블록은 앱이 자동으로 붙인 정보이며 사용자가 직접 쓴 말이 아닙니다.`;

const str = (d) => ({ type: "string", description: d });

const TOOLS = [
  {
    name: "get_system_status",
    description: "현재 PC의 CPU, RAM, GPU, 디스크, 네트워크, 배터리, 상위 프로세스 정보를 가져온다.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false }
  },
  {
    name: "list_launchers_and_routines",
    description: "실행 가능하게 등록된 앱/파일/URL 런처 목록과 루틴 목록을 가져온다.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false }
  },
  {
    name: "launch_app",
    description: "등록된 런처 항목(앱, 파일, 폴더, URL)을 이름이나 id로 실행한다.",
    input_schema: { type: "object", properties: { name: str("런처 이름 또는 id") }, required: ["name"], additionalProperties: false }
  },
  {
    name: "run_routine",
    description: "등록된 루틴(여러 동작을 순서대로 실행하는 매크로)을 이름이나 id로 실행한다.",
    input_schema: { type: "object", properties: { name: str("루틴 이름 또는 id") }, required: ["name"], additionalProperties: false }
  },
  {
    name: "add_todo",
    description: "할 일을 추가한다. due를 주면 그 시각에 리마인더 알림이 뜬다.",
    input_schema: {
      type: "object",
      properties: { text: str("할 일 내용"), due: str("리마인더 시각, 'YYYY-MM-DD HH:MM' 형식. 없으면 빈 문자열") },
      required: ["text", "due"],
      additionalProperties: false
    }
  },
  {
    name: "list_todos",
    description: "할 일 목록을 가져온다.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false }
  },
  {
    name: "complete_todo",
    description: "할 일을 완료 처리한다. 내용 일부로 찾는다.",
    input_schema: { type: "object", properties: { text: str("완료할 할 일 내용 또는 일부") }, required: ["text"], additionalProperties: false }
  },
  {
    name: "add_event",
    description: "일정을 추가한다.",
    input_schema: {
      type: "object",
      properties: { title: str("일정 제목"), date: str("YYYY-MM-DD"), time: str("HH:MM, 종일이면 빈 문자열") },
      required: ["title", "date", "time"],
      additionalProperties: false
    }
  },
  {
    name: "list_events",
    description: "일정 목록을 가져온다. from/to로 기간을 지정할 수 있다.",
    input_schema: {
      type: "object",
      properties: { from: str("시작 날짜 YYYY-MM-DD, 없으면 빈 문자열"), to: str("끝 날짜 YYYY-MM-DD, 없으면 빈 문자열") },
      required: ["from", "to"],
      additionalProperties: false
    }
  },
  {
    name: "add_memo",
    description: "메모를 저장한다.",
    input_schema: { type: "object", properties: { text: str("메모 내용") }, required: ["text"], additionalProperties: false }
  },
  {
    name: "list_memos",
    description: "저장된 메모 목록을 가져온다.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false }
  },
  {
    name: "get_weather",
    description: "도시의 현재 날씨와 주간 예보를 가져온다.",
    input_schema: { type: "object", properties: { city: str("도시 이름(영문 권장). 기본 도시면 빈 문자열") }, required: ["city"], additionalProperties: false }
  },
  {
    name: "list_devices",
    description: "Home Assistant에 등록된 스마트홈 기기와 현재 상태를 가져온다.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false }
  },
  {
    name: "control_device",
    description: "등록된 스마트홈 기기를 켜거나 끄거나 토글한다.",
    input_schema: {
      type: "object",
      properties: { entity_id: str("기기 entity_id, 예: light.living_room"), action: { type: "string", enum: ["turn_on", "turn_off", "toggle"] } },
      required: ["entity_id", "action"],
      additionalProperties: false
    }
  }
].map((t) => ({ ...t, eager_input_streaming: true }));

const SERVER_TOOLS = [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }];

// eager_input_streaming을 켜면 API가 입력을 검증하지 않으므로 직접 검증한다.
function validateInput(tool, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "입력이 객체가 아닙니다.";
  const schema = tool.input_schema;
  for (const key of schema.required) {
    if (!(key in input)) return `필수 값 누락: ${key}`;
  }
  for (const [key, val] of Object.entries(input)) {
    const prop = schema.properties[key];
    if (!prop) return `알 수 없는 값: ${key}`;
    if (prop.type === "string" && typeof val !== "string") return `${key}는 문자열이어야 합니다.`;
    if (prop.enum && !prop.enum.includes(val)) return `${key} 값이 허용 범위 밖입니다.`;
  }
  return null;
}

const findByName = (list, name) => {
  const n = name.trim().toLowerCase();
  return list.find((x) => x.id.toLowerCase() === n || x.name.toLowerCase() === n) ||
    list.find((x) => x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase()));
};

class Assistant {
  constructor({ store, onDataChanged, onLog }) {
    this.store = store;
    this.onDataChanged = onDataChanged;
    this.onLog = onLog;
    this.messages = [];
    this.busy = false;
    this.gemini = new GeminiProvider({
      systemPrompt: SYSTEM_PROMPT,
      tools: TOOLS,
      runTool: (name, input) => this.runTool(name, input),
      validate: validateInput
    });
  }

  reset() {
    this.messages = [];
    this.gemini.reset();
  }

  client() {
    const { apiKey } = this.store.get("settings");
    // 설정에 키가 없으면 환경변수(ANTHROPIC_API_KEY)나 `ant auth login` 프로필을 사용한다.
    return apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  context() {
    const s = this.store.get("settings");
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `[컨텍스트] 현재 시각: ${stamp} (${days[now.getDay()]}요일), 사용자 호칭: ${s.userName}, 기본 도시: ${s.city}`;
  }

  async runTool(name, input) {
    const store = this.store;
    switch (name) {
      case "get_system_status":
        return await system.getSummary();
      case "list_launchers_and_routines":
        return {
          launchers: store.get("launchers").map(({ id, name, target }) => ({ id, name, target })),
          routines: store.get("routines").map(({ id, name, steps }) => ({ id, name, steps: steps.length }))
        };
      case "launch_app": {
        const l = findByName(store.get("launchers"), input.name);
        if (!l) throw new Error(`등록된 런처가 없습니다: ${input.name}`);
        return await control.launch(l);
      }
      case "run_routine": {
        const r = findByName(store.get("routines"), input.name);
        if (!r) throw new Error(`등록된 루틴이 없습니다: ${input.name}`);
        return await control.runRoutine(r, store, this.onLog);
      }
      case "add_todo": {
        const todo = { id: newId(), text: input.text, done: false, due: input.due || "" };
        store.set("todos", [...store.get("todos"), todo]);
        this.onDataChanged("todos");
        return todo;
      }
      case "list_todos":
        return store.get("todos");
      case "complete_todo": {
        const q = input.text.toLowerCase();
        const todos = store.get("todos");
        const t = todos.find((x) => !x.done && x.text.toLowerCase().includes(q));
        if (!t) throw new Error(`해당하는 할 일이 없습니다: ${input.text}`);
        t.done = true;
        store.set("todos", todos);
        this.onDataChanged("todos");
        return t;
      }
      case "add_event": {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("date는 YYYY-MM-DD 형식이어야 합니다.");
        const ev = { id: newId(), title: input.title, date: input.date, time: input.time || "" };
        store.set("events", [...store.get("events"), ev]);
        this.onDataChanged("events");
        return ev;
      }
      case "list_events":
        return store.get("events").filter((e) => (!input.from || e.date >= input.from) && (!input.to || e.date <= input.to));
      case "add_memo": {
        const memo = { id: newId(), text: input.text, createdAt: new Date().toISOString() };
        store.set("memos", [memo, ...store.get("memos")]);
        this.onDataChanged("memos");
        return memo;
      }
      case "list_memos":
        return store.get("memos").slice(0, 30);
      case "get_weather":
        return await feeds.getWeather(input.city || store.get("settings").city);
      case "list_devices":
        return await control.haStates(store.get("settings"));
      case "control_device": {
        const r = await control.haCall(store.get("settings"), input.entity_id, input.action);
        this.onDataChanged("devices");
        return r;
      }
      default:
        throw new Error(`알 수 없는 도구: ${name}`);
    }
  }

  // 한 번의 API 호출을 스트리밍한다. 연결 끊김이나 잘린 도구 입력 JSON은 최대 2번 다시 시도한다.
  async streamOnce(client, onEvent) {
    const s = this.store.get("settings");
    for (let attempt = 0; ; attempt++) {
      try {
        const stream = client.beta.messages.stream({
          model: s.model || "claude-opus-5-5",
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
          output_config: { effort: s.effort || "low" },
          tools: [...TOOLS, ...SERVER_TOOLS],
          messages: this.messages,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default"
        });
        stream.on("text", (delta) => onEvent({ type: "delta", text: delta }));
        stream.on("contentBlock", (block) => {
          if (block.type === "server_tool_use" && block.name === "web_search") {
            onEvent({ type: "tool", name: "web_search", detail: block.input && block.input.query });
          }
        });
        return await stream.finalMessage();
      } catch (err) {
        if (err instanceof Anthropic.APIError || attempt >= 2) throw err;
        onEvent({ type: "status", text: "응답이 끊겨 다시 요청합니다…" });
      }
    }
  }

  async chat(userText, onEvent) {
    if (this.busy) throw new Error("이전 요청을 처리 중입니다.");
    const settings = this.store.get("settings");
    if (settings.provider === "gemini") {
      this.busy = true;
      try {
        await this.gemini.chat({
          apiKey: settings.geminiKey,
          model: settings.geminiModel,
          settings,
          userText: `${this.context()}\n\n${userText}`,
          onEvent
        });
      } finally {
        this.busy = false;
      }
      return;
    }
    this.busy = true;
    const client = this.client();
    this.messages.push({ role: "user", content: `${this.context()}\n\n${userText}` });
    try {
      for (let turn = 0; turn < 12; turn++) {
        const msg = await this.streamOnce(client, onEvent);
        // 생각(thinking) 블록 포함 전체 content를 그대로 보관해야 다음 요청이 유효하다.
        this.messages.push({ role: "assistant", content: msg.content });

        if (msg.stop_reason === "refusal") {
          onEvent({ type: "delta", text: "\n(이 요청은 처리할 수 없습니다.)" });
          break;
        }
        if (msg.stop_reason === "pause_turn") continue; // 서버 도구(웹 검색)가 길어져 잠시 멈춘 경우 이어서 요청
        const toolUses = msg.content.filter((b) => b.type === "tool_use");
        // 잘린 도구 입력은 검증을 통과할 수 있으므로 실행하지 않는다.
        if (msg.stop_reason === "max_tokens" && toolUses.length) throw new Error("응답이 너무 길어 잘렸습니다.");
        if (msg.stop_reason !== "tool_use" || !toolUses.length) break;

        const results = await Promise.all(
          toolUses.map(async (tu) => {
            const tool = TOOLS.find((t) => t.name === tu.name);
            const invalid = tool ? validateInput(tool, tu.input) : `알 수 없는 도구: ${tu.name}`;
            onEvent({ type: "tool", name: tu.name, detail: tu.input });
            if (invalid) return { type: "tool_result", tool_use_id: tu.id, content: invalid, is_error: true };
            try {
              const out = await this.runTool(tu.name, tu.input);
              return { type: "tool_result", tool_use_id: tu.id, content: typeof out === "string" ? out : JSON.stringify(out) };
            } catch (e) {
              return { type: "tool_result", tool_use_id: tu.id, content: e.message, is_error: true };
            }
          })
        );
        // 모든 도구 결과는 하나의 user 메시지로 돌려준다.
        this.messages.push({ role: "user", content: results });
        onEvent({ type: "delta", text: "\n" });
      }
    } catch (err) {
      // 실패한 사용자 메시지가 대화에 남아 다음 요청을 망치지 않도록 이번 턴을 되돌린다.
      const lastUser = this.messages.map((m) => m.role === "user" && typeof m.content === "string").lastIndexOf(true);
      if (lastUser >= 0) this.messages.length = lastUser;
      throw new Error(describeError(err));
    } finally {
      this.busy = false;
    }
  }
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "API 키가 올바르지 않습니다. 설정에서 키를 확인하세요.";
  if (err instanceof Anthropic.PermissionDeniedError) return "이 API 키로는 해당 모델을 사용할 수 없습니다.";
  if (err instanceof Anthropic.RateLimitError) return "요청이 너무 많습니다. 잠시 후 다시 시도하세요.";
  if (err instanceof Anthropic.BadRequestError) return `잘못된 요청: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Claude API에 연결할 수 없습니다. 네트워크를 확인하세요.";
  if (err instanceof Anthropic.APIError) return `API 오류 ${err.status}: ${err.message}`;
  if (/api.?key|apiKey|authToken|credentials/i.test(String(err && err.message))) {
    return "API 키가 없습니다. 설정(⚙)에서 Anthropic API 키를 입력하세요.";
  }
  return err && err.message ? err.message : String(err);
}

module.exports = { Assistant };
