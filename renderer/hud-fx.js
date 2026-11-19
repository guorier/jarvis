// HUD 효과: 점 지구본, CPU 파형 그래프, 메모리 점 격자, 글자 해독(스크램블), 숫자 트윈
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DPR = () => window.devicePixelRatio || 1;

function fitCanvas(cv, cssH) {
  const w = cv.clientWidth || cv.parentElement.clientWidth;
  const h = cssH || cv.clientHeight;
  const d = DPR();
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) {
    cv.width = Math.round(w * d);
    cv.height = Math.round(h * d);
  }
  return { w: cv.width, h: cv.height, d };
}

// 화면에 안 보이면(창 최소화 등) 그리기를 멈춘다
const Loop = {
  fns: new Set(),
  running: false,
  add(fn) {
    this.fns.add(fn);
    if (!this.running) {
      this.running = true;
      requestAnimationFrame((t) => this.tick(t));
    }
  },
  tick(t) {
    if (!document.hidden) for (const fn of this.fns) fn(t);
    requestAnimationFrame((tt) => this.tick(tt));
  }
};

// ---------- 점 지구본 ----------
const Globe = {
  cv: null,
  pts: null, // [x,y,z, seed] 단위 구 좌표
  rot: 2.2, // 경도 회전 (라디안)
  tilt: -0.38, // 위로 기울기
  reveal: 0, // 0→1: 로딩 때 점이 하나씩 켜짐
  revealStart: 0,
  home: null, // { lat, lon, label }
  lastT: 0,

  init(cv) {
    this.cv = cv;
    const L = window.GLOBE_LAND || [];
    const pts = [];
    for (let i = 0; i < L.length; i += 2) {
      const lat = (L[i] * Math.PI) / 180;
      const lon = (L[i + 1] * Math.PI) / 180;
      pts.push(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon), Math.random());
    }
    this.pts = new Float32Array(pts);
    this.reveal = REDUCED ? 1 : 0;
    Loop.add((t) => this.draw(t));
  },

  start() {
    this.revealStart = performance.now();
  },

  setHome(lat, lon, label) {
    this.home = { lat, lon, label };
    // 처음에는 집 위치가 정면에 오도록 돌려 둔다
    if (!this.homed) {
      this.rot = -(lon * Math.PI) / 180;
      this.homed = true;
    }
  },

  project(x, y, z, cx, cy, R) {
    const cr = Math.cos(this.rot), sr = Math.sin(this.rot);
    const x1 = x * cr + z * sr;
    const z1 = -x * sr + z * cr;
    const ct = Math.cos(this.tilt), st = Math.sin(this.tilt);
    const y2 = y * ct - z1 * st;
    const z2 = y * st + z1 * ct;
    return [cx + x1 * R, cy - y2 * R, z2];
  },

  draw(t) {
    const cv = this.cv;
    if (!cv || !this.pts) return;
    const { w, h, d } = fitCanvas(cv);
    const ctx = cv.getContext("2d");
    const dt = this.lastT ? Math.min(100, t - this.lastT) : 16;
    this.lastT = t;
    if (!REDUCED) this.rot += dt * 0.00012; // 약 52초에 한 바퀴
    if (this.revealStart) this.reveal = Math.min(1, (t - this.revealStart) / 1400);

    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;

    // 외곽 링 + 기울어진 궤도 링
    ctx.strokeStyle = "rgba(73,184,255,0.35)";
    ctx.lineWidth = 1 * d;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(73,184,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 1.18, R * 0.34, -0.35, 0, Math.PI * 2);
    ctx.stroke();

    // 육지 점 (앞면은 밝게, 뒷면은 아주 흐리게)
    const P = this.pts;
    const size = Math.max(1, 1.15 * d);
    for (let i = 0; i < P.length; i += 4) {
      if (P[i + 3] > this.reveal) continue;
      const [sx, sy, z] = this.project(P[i], P[i + 1], P[i + 2], cx, cy, R);
      if (z < -0.15) continue;
      const a = z > 0 ? 0.35 + z * 0.65 : 0.12;
      ctx.fillStyle = `rgba(150,215,255,${a.toFixed(3)})`;
      ctx.fillRect(sx, sy, size, size);
    }

    // 집 위치 핀 (깜빡이는 링 + 기둥)
    if (this.home && this.reveal >= 1) {
      const lat = (this.home.lat * Math.PI) / 180, lon = (this.home.lon * Math.PI) / 180;
      const x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
      const [sx, sy, zz] = this.project(x, y, z, cx, cy, R);
      const [tx, ty] = this.project(x * 1.18, y * 1.18, z * 1.18, cx, cy, R);
      if (zz > -0.05) {
        const pulse = REDUCED ? 0.5 : (t % 1600) / 1600;
        ctx.strokeStyle = `rgba(255,178,30,${(1 - pulse).toFixed(3)})`;
        ctx.lineWidth = 1.2 * d;
        ctx.beginPath();
        ctx.arc(sx, sy, (3 + pulse * 9) * d, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,178,30,0.9)";
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = "#ffb21e";
        ctx.beginPath();
        ctx.arc(tx, ty, 2.2 * d, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${10 * d}px Pretendard, sans-serif`;
        ctx.fillStyle = "rgba(255,210,140,0.95)";
        ctx.fillText(this.home.label, tx + 5 * d, ty - 3 * d);
      }
    }
  }
};

// ---------- 파형 그래프 (CPU · 메모리 · GPU · NPU 공용, 계속 흘러감) ----------
class LineGraph {
  constructor(cv, { lines = 1, colors = ["#49b8ff"], period = 2000, N = 36 } = {}) {
    this.cv = cv;
    this.hist = Array.from({ length: lines }, () => []);
    this.colors = colors;
    this.period = period;
    this.N = N;
    this.lastAt = 0;
    this.off = false; // 데이터가 없으면(N/A) 흐린 평선
    Loop.add((t) => this.draw(t));
  }

  push(values) {
    if (!values) {
      this.off = true;
      return;
    }
    this.off = false;
    values.forEach((v, i) => {
      const h = this.hist[i];
      if (!h) return;
      const val = Math.max(0, Math.min(100, v || 0));
      if (!h.length) for (let k = 0; k < this.N; k++) h.push(val);
      h.push(val);
      if (h.length > this.N + 2) h.shift();
    });
    this.lastAt = performance.now();
  }

  draw(t) {
    const cv = this.cv;
    if (!cv) return;
    const { w, h, d } = fitCanvas(cv);
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(31,143,255,0.12)";
    ctx.lineWidth = 1;
    for (let gy = 1; gy < 3; gy++) {
      ctx.beginPath();
      ctx.moveTo(0, (h * gy) / 3);
      ctx.lineTo(w, (h * gy) / 3);
      ctx.stroke();
    }
    if (this.off) {
      ctx.strokeStyle = "rgba(79,127,179,0.4)";
      ctx.setLineDash([3 * d, 4 * d]);
      ctx.beginPath();
      ctx.moveTo(0, h - 3 * d);
      ctx.lineTo(w, h - 3 * d);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    // 새 측정값이 들어오는 사이에도 왼쪽으로 부드럽게 흐르게 한다
    const frac = REDUCED || !this.lastAt ? 0 : Math.min(1, (t - this.lastAt) / this.period);
    const step = w / (this.N - 1);
    this.hist.forEach((hist, gi) => {
      if (hist.length < 2) return;
      const pts = [];
      for (let i = 0; i < hist.length; i++) {
        const x = (i - (hist.length - this.N) - frac) * step;
        const wobble = REDUCED ? 0 : Math.sin(t / 380 + i * 0.9 + gi * 2) * 0.8 * d;
        const y = h - 3 * d - (hist[i] / 100) * (h - 6 * d) + wobble;
        pts.push([x, y]);
      }
      const color = this.colors[gi % this.colors.length];
      // 선 아래 은은한 채움 (첫 줄만)
      if (gi === 0) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, color + "40");
        grad.addColorStop(1, color + "00");
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineTo(pts[pts.length - 1][0], h);
        ctx.lineTo(pts[0][0], h);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4 * d;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6 * d;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }
}

// ---------- 글자 해독 효과 ----------
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=/<>";
function scrambleText(el, duration = 520) {
  const final = el.dataset.text || el.textContent;
  el.dataset.text = final;
  if (REDUCED || !final.trim()) {
    el.textContent = final;
    return;
  }
  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - start) / duration);
    const fixed = Math.floor(final.length * p);
    let s = final.slice(0, fixed);
    for (let i = fixed; i < final.length; i++) s += final[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = s;
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = final;
  };
  requestAnimationFrame(step);
}

// ---------- 숫자 트윈 (값이 바뀔 때 부드럽게 올라가거나 내려감) ----------
function tweenNumber(el, to, fmt = (v) => `${Math.round(v)}%`, duration = 600) {
  const from = el._val == null ? 0 : el._val;
  el._val = to;
  if (REDUCED || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const step = (t) => {
    const p = Math.min(1, (t - start) / duration);
    el.textContent = fmt(from + (to - from) * ease(p));
    if (p < 1 && el._val === to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
