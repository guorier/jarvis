// Google Gemini 제공자 (무료 등급 사용 가능). 도구 정의와 실행은 ai.js의 것을 그대로 쓴다.
// ============================================================================
// [코드 리뷰] src/gemini.js
// 흐름: chat() → generate()(모델 대체 사슬) → 함수 호출이면 도구 실행 → 결과를 붙여 다시 요청 (최대 10턴)
// 좋은 점
//  - 혼잡(429/5xx)·시간 초과면 가벼운 모델로 자동 전환하고, 잘 된 모델을 15분 동안 먼저 쓴다.
//  - 웹 검색은 네이버 → Gemini Google 검색 → 뉴스 RSS 순으로 내려가며, 무료 등급의 검색 차단(429)은 1시간 기억한다.
//  - 실패한 턴은 대화 기록에서 지워 다음 질문이 망가지지 않는다.
//  - 모델이 준 content(생각 서명 포함)를 그대로 보관해 다음 요청이 유효하다.
// 개선 포인트
//  - [리뷰-G1] 대화 기록(history)이 /초기화 전까지 계속 늘어난다. 길어질수록 요청이 느려지고 무료 한도를 빨리 쓴다.
//              → 최근 N턴(예: 20)만 남기거나, 오래된 턴을 요약해 줄이는 것을 권장.
//  - [리뷰] 도구 호출을 Promise.all로 동시에 실행한다. 지금 도구들은 저장을 동기로 끝내 충돌이 없지만,
//           나중에 await가 끼는 쓰기 도구를 추가하면 같은 목록을 동시에 덮어쓸 수 있다.
// ============================================================================
const { GoogleGenAI } = require("@google/genai");
const feeds = require("./feeds");
const { naverSearch, naverReady } = require("./naver");

const DEFAULT_MODEL = "gemini-3.8-flash";
// 설정한 모델이 과부하(503/504/429)이거나 응답이 없을 때 차례로 시도할 가벼운 모델
const FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const REQUEST_TIMEOUT_MS = 25000;
const STICKY_MS = 15 * 60 * 1000; // 대체 모델이 잘 되면 15분 동안 그 모델을 먼저 쓴다
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// Gemini에서는 웹 검색(googleSearch)과 함수 호출을 한 요청에 섞지 않고,
// web_search라는 함수를 두어 내부에서 검색 전용 요청을 따로 보낸다.
const WEB_SEARCH_DECL = {
  name: "web_search",
  description: "인터넷 검색. 최신 정보, 뉴스, 맛집·가게·장소, 제품·사용법, 사실 확인이 필요할 때 사용한다. 웹문서·블로그·지역 정보·뉴스를 돌려준다.",
  parametersJsonSchema: {
    type: "object",
    properties: { query: { type: "string", description: "검색할 내용" } },
    required: ["query"],
    additionalProperties: false
  }
};

function toDeclarations(tools) {
  return [
    ...tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema })),
    WEB_SEARCH_DECL
  ];
}

class GeminiProvider {
  constructor({ systemPrompt, tools, runTool, validate }) {
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.declarations = toDeclarations(tools);
    this.runTool = runTool;
    this.validate = validate;
    this.history = [];
    this.sticky = null; // { model, until }
  }

  reset() {
    this.history = [];
  }

  modelChain(configured) {
    const chain = [configured, ...FALLBACK_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
    if (this.sticky && this.sticky.until > Date.now() && chain.includes(this.sticky.model)) {
      return [this.sticky.model, ...chain.filter((m) => m !== this.sticky.model)];
    }
    return chain;
  }

  // 과부하·시간 초과면 다음 모델로 넘어가며 요청한다. 한 번의 대화 턴 안에서는 성공한 모델을 계속 쓴다.
  async generate(ai, chain, params, onEvent) {
    let lastErr;
    for (const model of chain) {
      try {
        const res = await ai.models.generateContent({ ...params, model });
        if (model !== chain[0]) {
          this.sticky = { model, until: Date.now() + STICKY_MS };
          onEvent && onEvent({ type: "status", text: `${model} 모델로 응답 중…` });
        }
        return { res, model };
      } catch (err) {
        const status = err && (err.status || err.code);
        const timedOut = !status && /abort|timeout|deadline/i.test(String(err && err.message));
        if (!(RETRYABLE.has(status) || timedOut)) throw err;
        lastErr = err;
        onEvent && onEvent({ type: "status", text: `${model} 혼잡 — 다른 모델로 전환…` });
      }
    }
    throw lastErr;
  }

  async webSearch(ai, chain, query, settings) {
    // 1순위: 네이버 검색 API (키가 있으면). 실패하면 아래 방법으로 넘어간다.
    if (settings && naverReady(settings)) {
      try {
        return await naverSearch(settings, query);
      } catch (err) {
        this.lastSearchError = err.message;
      }
    }
    // 2순위: Gemini의 Google 검색 (무료 등급은 대부분 막혀 있음)
    if (!this.groundingBlockedUntil || this.groundingBlockedUntil < Date.now()) {
      try {
        const { res } = await this.generate(ai, chain, {
          contents: `다음을 Google에서 검색해 핵심만 한국어로 요약하고, 끝에 출처 사이트 이름을 짧게 적어줘: ${query}`,
          config: { tools: [{ googleSearch: {} }] }
        });
        if (res.text) return res.text;
      } catch (err) {
        const status = err && (err.status || err.code);
        // 무료 등급은 Google 검색 한도가 없어서(429/403) 막히는 경우가 많다 → 1시간 동안은 바로 뉴스 검색으로 간다
        if (status === 429 || status === 403) this.groundingBlockedUntil = Date.now() + 60 * 60 * 1000;
        else throw err;
      }
    }
    // 대체: Google 뉴스 RSS 검색 결과를 모델에게 넘겨 요약하게 한다 (무료, 뉴스 기사 한정)
    const items = await feeds.getNews(query);
    if (!items.length) return "관련 뉴스 기사를 찾지 못했습니다.";
    return {
      note:
        "웹 검색 대신 Google 뉴스 기사 검색 결과입니다. 아래 기사 제목을 바탕으로 답하고, 뉴스 기사 기준이라는 점을 짧게 밝혀라." +
        (this.lastSearchError ? ` (네이버 검색 실패: ${this.lastSearchError} — 이 사실도 사용자에게 한 줄로 알려라)` : ""),
      articles: items.slice(0, 8).map((n) => ({ title: n.title, source: n.source, date: n.date }))
    };
  }

  async chat({ apiKey, model, settings, userText, onEvent }) {
    this.lastSearchError = null;
    if (!apiKey) throw new Error("Gemini API 키가 없습니다. 설정(⚙)에서 Gemini API 키를 입력하세요.");
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
    let chain = this.modelChain(model || DEFAULT_MODEL);
    const start = this.history.length;
    // [리뷰-G1] 여기서 계속 쌓인다. 예: if (this.history.length > 40) 오래된 턴부터 잘라내기
    //           (함수 호출과 그 결과는 짝으로 함께 지워야 요청이 유효하다)
    this.history.push({ role: "user", parts: [{ text: userText }] });
    try {
      for (let turn = 0; turn < 10; turn++) {
        const { res, model: used } = await this.generate(
          ai,
          chain,
          {
            contents: this.history,
            config: {
              systemInstruction: this.systemPrompt,
              tools: [{ functionDeclarations: this.declarations }]
            }
          },
          onEvent
        );
        // 이번 턴의 나머지 요청은 방금 성공한 모델부터 시도한다
        chain = [used, ...chain.filter((m) => m !== used)];
        const content = res.candidates && res.candidates[0] && res.candidates[0].content;
        if (!content) {
          const reason = res.promptFeedback && res.promptFeedback.blockReason;
          throw new Error(reason ? `요청이 차단되었습니다 (${reason}).` : "응답이 비어 있습니다.");
        }
        // 모델이 준 content(생각 서명 포함)를 그대로 보관해야 다음 요청이 유효하다.
        this.history.push(content);

        const text = (content.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("");
        if (text) onEvent({ type: "delta", text });

        const calls = res.functionCalls || [];
        if (!calls.length) break;

        const parts = await Promise.all(
          calls.map(async (fc) => {
            onEvent({ type: "tool", name: fc.name, detail: fc.args });
            let result;
            try {
              if (fc.name === "web_search") {
                result = await this.webSearch(ai, chain, (fc.args && fc.args.query) || "", settings);
              } else {
                const tool = this.tools.find((t) => t.name === fc.name);
                const invalid = tool ? this.validate(tool, fc.args || {}) : `알 수 없는 도구: ${fc.name}`;
                if (invalid) throw new Error(invalid);
                result = await this.runTool(fc.name, fc.args || {});
              }
              return { functionResponse: { id: fc.id, name: fc.name, response: { result } } };
            } catch (e) {
              return { functionResponse: { id: fc.id, name: fc.name, response: { error: e.message } } };
            }
          })
        );
        this.history.push({ role: "user", parts });
        onEvent({ type: "delta", text: "\n" });
      }
    } catch (err) {
      this.history.length = start; // 실패한 턴은 기록에서 지운다
      throw new Error(describeGeminiError(err));
    }
  }
}

function describeGeminiError(err) {
  const status = err && (err.status || err.code);
  const msg = (err && err.message) || String(err);
  if (status === 400 && /API key/i.test(msg)) return "Gemini API 키가 올바르지 않습니다. 설정에서 키를 확인하세요.";
  if (status === 401 || status === 403) return "Gemini API 키가 올바르지 않거나 권한이 없습니다.";
  if (status === 404) return "Gemini 모델 이름을 찾을 수 없습니다. 설정에서 모델 이름을 확인하세요.";
  if (status === 429) return "Gemini 무료 사용량 한도에 도달했습니다. 잠시 후(또는 내일) 다시 시도하세요.";
  if (status === 503 || status === 504) return "Gemini 서버가 혼잡해 모든 모델이 응답하지 못했습니다. 잠시 후 다시 시도하세요.";
  if (status >= 500) return "Gemini 서버 오류입니다. 잠시 후 다시 시도하세요.";
  if (/abort|timeout|deadline/i.test(msg)) return "Gemini 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.";
  if (/fetch failed|ENOTFOUND|ECONNRESET|network/i.test(msg)) return "Gemini에 연결할 수 없습니다. 네트워크를 확인하세요.";
  return msg;
}

module.exports = { GeminiProvider, DEFAULT_MODEL };
