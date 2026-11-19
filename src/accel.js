// GPU·NPU 사용률 수집 (Windows 성능 카운터 "GPU Engine", "GPU Adapter Memory")
// systeminformation은 NVIDIA만 사용률을 주므로, 작업 관리자와 같은 카운터를 백그라운드 PowerShell 하나로 계속 읽는다.
// - GPU: 3D 엔진이 있는 어댑터 중 엔진 종류가 가장 많은 것
// - NPU: 연산(compute) 엔진만 있는 어댑터 (Windows의 MCDM 장치 — AMD Ryzen AI, Intel AI Boost 등)
const { spawn } = require("child_process");

// parentPid: 자비스(Electron) 프로세스. 자비스가 비정상 종료돼도 수집기가 혼자 남지 않도록 매번 확인한다.
const psLoop = (parentPid) => `
$ErrorActionPreference = 'SilentlyContinue'
while ($true) {
  if (-not (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue)) { exit }
  $out = @{}
  $eng = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage').CounterSamples
  foreach ($c in $eng) {
    if ($c.InstanceName -match 'luid_(0x[0-9a-f]+_0x[0-9a-f]+)_phys_\\d+_eng_\\d+_engtype_(.+)$') {
      $l = $Matches[1]; $t = $Matches[2].Trim()
      if (-not $out.ContainsKey($l)) { $out[$l] = @{ util = @{}; ded = 0.0; shared = 0.0 } }
      $prev = 0.0
      if ($out[$l].util.ContainsKey($t)) { $prev = $out[$l].util[$t] }
      $out[$l].util[$t] = $prev + $c.CookedValue
    }
  }
  $mem = (Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage','\\GPU Adapter Memory(*)\\Shared Usage').CounterSamples
  foreach ($c in $mem) {
    if ($c.InstanceName -match 'luid_(0x[0-9a-f]+_0x[0-9a-f]+)_phys') {
      $l = $Matches[1]
      if ($out.ContainsKey($l)) {
        if ($c.Path -match 'dedicated') { $out[$l].ded += $c.CookedValue } else { $out[$l].shared += $c.CookedValue }
      }
    }
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Depth 5 -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1200
}
`;

let child = null;
let latest = null;
let buf = "";

function classify(raw) {
  const adapters = Object.entries(raw || {}).map(([luid, a]) => {
    const util = a.util || {};
    const types = Object.keys(util);
    const max = types.length ? Math.max(...types.map((t) => util[t] || 0)) : 0;
    const of = (pred) => Math.max(0, ...types.filter(pred).map((t) => util[t] || 0));
    return {
      luid,
      types,
      util: Math.min(100, max),
      util3d: Math.min(100, of((t) => t === "3d")),
      utilVideo: Math.min(100, of((t) => t.startsWith("video"))),
      utilCompute: Math.min(100, of((t) => t.startsWith("compute"))),
      dedGB: (a.ded || 0) / 1024 ** 3,
      sharedGB: (a.shared || 0) / 1024 ** 3
    };
  });
  const gpu = adapters
    .filter((a) => a.types.includes("3d"))
    .sort((x, y) => y.types.length - x.types.length)[0] || null;
  const npu = adapters.find((a) => a.types.length && a.types.every((t) => t.startsWith("compute"))) || null;
  return { gpu, npu, at: Date.now() };
}

function start() {
  if (process.platform !== "win32" || child) return;
  const encoded = Buffer.from(psLoop(process.pid), "utf16le").toString("base64");
  child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"]
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("{")) continue;
      try {
        latest = classify(JSON.parse(line));
      } catch {}
    }
  });
  child.on("exit", () => {
    child = null;
  });
}

function stop() {
  if (child) child.kill();
  child = null;
}

// 10초 넘게 갱신이 없으면 오래된 값으로 보고 버린다
function get() {
  return latest && Date.now() - latest.at < 10000 ? latest : null;
}

module.exports = { start, stop, get, classify };
