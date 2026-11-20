// 공통 유틸: DOM, 포맷, 효과음, TTS, 로그, 알림
// ============================================================================
// [코드 리뷰] renderer/util.js — 다른 화면 스크립트가 모두 쓰는 공통 함수 (index.html에서 가장 먼저 로드)
// 좋은 점
//  - esc()로 HTML 특수문자를 막고, miniMarkdown은 "먼저 이스케이프 → 그다음 태그"라 AI 답변에 HTML이 섞여도 안전하다.
//  - 링크는 http/https만 <a>로 만든다(javascript: 주소 차단).
//  - 로그는 300줄까지만 남겨 오래 켜 둬도 메모리가 늘지 않는다.
// 개선 포인트
//  - [리뷰] 전역 변수($, esc, Sound…)로 파일끼리 연결돼 있다. 로드 순서(index.html <script> 순서)에 의존하므로
//           순서를 바꾸면 깨진다. 규모가 더 커지면 ES 모듈(import/export)로 바꾸는 것을 권장.
// ============================================================================
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
// [리뷰] AudioContext는 처음 만들 때 0.2초쯤 화면을 멈추게 한다. 그래서 로딩 시작 전에 intro.js가 미리 만들어 둔다.
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

// ===== 알림 =====
// 알림 패널은 없앴다. 알림은 시스템 로그에 남기고, 리마인더는 메인 프로세스가 Windows 알림으로 띄운다.
function pushNotice(text, kind = "info") {
  logLine(kind === "reminder" ? `⏰ ${text}` : text, kind === "error" ? "error" : "info");
}
