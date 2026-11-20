// 화면(renderer)에 필요한 기능만 안전하게 노출한다.
// ============================================================================
// [코드 리뷰] preload.js — 화면이 쓸 수 있는 기능 목록 (window.jarvis)
// 좋은 점
//  - ipcRenderer 자체를 넘기지 않고, 정해진 채널만 함수로 감싸 노출한다(contextBridge).
//  - call()이 { ok:false }를 예외로 바꿔 화면 쪽은 try/catch 하나로 처리할 수 있다.
//  - on()이 해제 함수를 돌려줘 리스너를 지울 수 있다.
// 개선 포인트
//  - [리뷰] ha.states / ha.call 은 스마트홈 패널을 없앤 뒤 화면에서 쓰지 않는다(AI는 메인에서 직접 호출).
//           노출 면을 줄이려면 지워도 된다.
// ============================================================================
const { contextBridge, ipcRenderer } = require("electron");

const call = async (channel, ...args) => {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.data;
};

const on = (channel) => (fn) => {
  const listener = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("jarvis", {
  store: {
    all: () => call("store:all"),
    set: (key, value) => call("store:set", key, value)
  },
  newId: () => call("id:new"),
  sys: { fast: () => call("sys:fast"), slow: () => call("sys:slow") },
  feed: { weather: () => call("feed:weather"), news: () => call("feed:news"), rates: () => call("feed:rates") },
  launch: (id) => call("launch", id),
  runRoutine: (id) => call("routine:run", id),
  ha: { states: () => call("ha:states"), call: (entityId, action) => call("ha:call", entityId, action) },
  openUrl: (url) => call("open:url", url),
  ai: {
    chat: (requestId, text) => call("ai:chat", requestId, text),
    reset: () => call("ai:reset"),
    onEvent: on("ai:event")
  },
  onLog: on("log"),
  onNotice: on("notice"),
  onDataChanged: on("data:changed")
});
