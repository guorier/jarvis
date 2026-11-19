// 화면(renderer)에 필요한 기능만 안전하게 노출한다.
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
