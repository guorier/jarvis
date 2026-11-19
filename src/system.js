// 시스템 모니터링: CPU, RAM, GPU, 디스크, 네트워크, 배터리, 온도, 프로세스
const si = require("systeminformation");
const accel = require("./accel");

async function safe(fn, fallback) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// 자주(2초마다) 가져오는 가벼운 정보
async function getFast() {
  const [load, mem, net, speed] = await Promise.all([
    safe(() => si.currentLoad(), null),
    safe(() => si.mem(), null),
    safe(() => si.networkStats("*"), []), // 모든 어댑터 합산
    safe(() => si.cpuCurrentSpeed(), null)
  ]);
  const temp = lastTemp; // 온도 조회는 느려서 getSlow에서 갱신한다
  const totalRx = net.reduce((s, n) => s + (n.rx_sec || 0), 0);
  const totalTx = net.reduce((s, n) => s + (n.tx_sec || 0), 0);
  // 코어를 앞·뒤 절반 두 그룹으로 묶어 평균 (CPU 파형 그래프 두 줄)
  const cores = load && load.cpus ? load.cpus.map((c) => c.load) : [];
  const half = Math.ceil(cores.length / 2);
  const avg = (a) => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : null);
  return {
    cpu: load ? Math.round(load.currentLoad) : null,
    coreGroups: cores.length ? [avg(cores.slice(0, half)), avg(cores.slice(half))] : null,
    coreCount: cores.length,
    ghz: speed && speed.avg ? +speed.avg.toFixed(2) : null,
    ghzMax: speed && speed.max ? +speed.max.toFixed(2) : null,
    ram: mem ? Math.round(((mem.total - mem.available) / mem.total) * 100) : null,
    ramUsedGB: mem ? +((mem.total - mem.available) / 1024 ** 3).toFixed(1) : null,
    ramTotalGB: mem ? +(mem.total / 1024 ** 3).toFixed(1) : null,
    ramAvailGB: mem ? +(mem.available / 1024 ** 3).toFixed(1) : null,
    swapPct: mem && mem.swaptotal ? Math.round((mem.swapused / mem.swaptotal) * 100) : null,
    accel: accel.get(), // { gpu, npu } — Windows 성능 카운터 (없으면 null)
    netDown: totalRx, // bytes/sec
    netUp: totalTx,
    tempC: temp && temp.main ? Math.round(temp.main) : null
  };
}

// 가끔(10초마다) 가져오는 무거운 정보
let lastTemp = null;
async function getSlow() {
  const [disks, gpu, battery, procs, temp] = await Promise.all([
    safe(() => si.fsSize(), []),
    safe(() => si.graphics(), null),
    safe(() => si.battery(), null),
    safe(() => si.processes(), null),
    safe(() => si.cpuTemperature(), null)
  ]);
  lastTemp = temp;
  const gpuCtrl = gpu && gpu.controllers ? gpu.controllers.find((c) => c.utilizationGpu != null) || gpu.controllers[0] : null;
  const top = procs
    ? procs.list
        .filter((p) => p.name && p.name !== "System Idle Process")
        .sort((a, b) => b.cpu - a.cpu || b.memRss - a.memRss)
        .slice(0, 12)
        .map((p) => ({ name: p.name, cpu: +p.cpu.toFixed(1), memMB: Math.round(p.memRss / 1024) }))
    : [];
  return {
    disks: disks.map((d) => ({
      mount: d.mount,
      usePct: Math.round(d.use),
      usedGB: Math.round(d.used / 1024 ** 3),
      sizeGB: Math.round(d.size / 1024 ** 3)
    })),
    gpu: gpuCtrl
      ? { model: gpuCtrl.model, util: gpuCtrl.utilizationGpu ?? null, temp: gpuCtrl.temperatureGpu ?? null }
      : null,
    battery: battery && battery.hasBattery ? { percent: battery.percent, charging: battery.isCharging } : null,
    processes: top,
    processCount: procs ? procs.all : null
  };
}

// AI 도구용 요약
async function getSummary() {
  const [fast, slow] = await Promise.all([getFast(), getSlow()]);
  return { ...fast, ...slow };
}

module.exports = { getFast, getSlow, getSummary };
