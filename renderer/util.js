// 공통 유틸: DOM, 포맷, 효과음, TTS, 로그, 알림
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const pad = (n) => String(n).padStart(2, "0");
const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowStamp = (d = new Date()) => `${todayStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function fmtBytesPerSec(b) {
  if (b == null) return "--";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// 아주 간단한 마크다운: 굵게, 코드, 링크, 글머리표, 줄바꿈 (HTML은 먼저 이스케이프)
function miniMarkdown(text) {
  const lines = esc(text).split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    let line = raw
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${m[1]}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += line ? `${line}<br>` : "<br>";
    }
  }
  if (inList) html += "</ul>";
  return html.replace(/(<br>)+$/, "");
}

// ===== 효과음 (WebAudio로 합성) =====
const Sound = {
  ctx: null,
  enabled: true,
  beep(freq = 880, dur = 0.06, type = "sine", vol = 0.05) {
    if (!this.enabled) return;
    try {
      this.ctx = this.ctx || new AudioContext();
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start();
      o.stop(this.ctx.currentTime + dur);
    } catch {}
  },
  click() { this.beep(1400, 0.03, "square", 0.015); },
  send() { this.beep(660, 0.05); setTimeout(() => this.beep(990, 0.06), 60); },
  done() { this.beep(990, 0.05); setTimeout(() => this.beep(1320, 0.08), 70); },
  error() { this.beep(220, 0.18, "sawtooth", 0.04); },
  boot() { [440, 660, 880, 1320].forEach((f, i) => setTimeout(() => this.beep(f, 0.08), i * 110)); }
};

// ===== TTS (음성 출력만, 음성인식 없음) =====
const TTS = {
  enabled: false,
  speak(text, onStart, onEnd) {
    if (!this.enabled || !("speechSynthesis" in window)) return;
    const clean = text.replace(/[*`#>\[\]()]/g, "").replace(/https?:\/\/\S+/g, "").slice(0, 600);
    if (!clean.trim()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "ko-KR";
    const ko = speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith("ko"));
    if (ko) u.voice = ko;
    u.rate = 1.05;
    u.onstart = onStart;
    u.onend = onEnd;
    u.onerror = onEnd;
    speechSynthesis.speak(u);
  },
  stop() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }
};

// ===== 로그 콘솔 =====
function logLine(text, level = "info", at = Date.now()) {
  const box = $("#log");
  if (!box) return;
  const d = new Date(at);
  const row = document.createElement("div");
  row.className = level;
  row.innerHTML = `<time>${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</time>${esc(text)}`;
  box.appendChild(row);
  while (box.children.length > 300) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

// ===== 알림 센터 =====
const notices = [];
function pushNotice(text, kind = "info") {
  notices.unshift({ text, kind, at: Date.now() });
  notices.length = Math.min(notices.length, 50);
  const list = $("#notice-list");
  list.innerHTML = notices
    .map((n) => {
      const d = new Date(n.at);
      return `<li class="${n.kind}"><span class="grow">${esc(n.text)}</span><small>${pad(d.getHours())}:${pad(d.getMinutes())}</small></li>`;
    })
    .join("");
  $("#notice-count").textContent = notices.length;
}
