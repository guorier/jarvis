// 외부 정보: 날씨(Open-Meteo), 뉴스(Google News RSS), 환율(open.er-api.com). 모두 API 키가 필요 없다.

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const WEATHER_CODES = {
  0: ["맑음", "☀"], 1: ["대체로 맑음", "🌤"], 2: ["구름 조금", "⛅"], 3: ["흐림", "☁"],
  45: ["안개", "🌫"], 48: ["안개", "🌫"],
  51: ["이슬비", "🌦"], 53: ["이슬비", "🌦"], 55: ["이슬비", "🌦"],
  61: ["비", "🌧"], 63: ["비", "🌧"], 65: ["강한 비", "🌧"],
  66: ["어는 비", "🌧"], 67: ["어는 비", "🌧"],
  71: ["눈", "🌨"], 73: ["눈", "🌨"], 75: ["강한 눈", "❄"], 77: ["싸락눈", "🌨"],
  80: ["소나기", "🌦"], 81: ["소나기", "🌦"], 82: ["강한 소나기", "⛈"],
  85: ["눈보라", "🌨"], 86: ["눈보라", "❄"],
  95: ["뇌우", "⛈"], 96: ["우박 뇌우", "⛈"], 99: ["우박 뇌우", "⛈"]
};
const describe = (code) => WEATHER_CODES[code] || ["알 수 없음", "·"];

const geoCache = new Map();
async function geocode(city) {
  if (geoCache.has(city)) return geoCache.get(city);
  const q = encodeURIComponent(city);
  const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=ko`);
  if (!data.results || !data.results.length) throw new Error(`도시를 찾을 수 없습니다: ${city}`);
  const r = data.results[0];
  const loc = { name: r.name, lat: r.latitude, lon: r.longitude, tz: r.timezone };
  geoCache.set(city, loc);
  return loc;
}

async function getWeather(city) {
  const loc = await geocode(city || "Seoul");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&hourly=temperature_2m,weather_code,precipitation_probability` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=7`;
  const d = await getJson(url);
  const nowIdx = d.hourly.time.findIndex((t) => t >= d.current.time.slice(0, 13));
  const start = Math.max(0, nowIdx);
  return {
    city: loc.name,
    lat: loc.lat,
    lon: loc.lon,
    current: {
      temp: Math.round(d.current.temperature_2m),
      feels: Math.round(d.current.apparent_temperature),
      humidity: d.current.relative_humidity_2m,
      wind: d.current.wind_speed_10m,
      desc: describe(d.current.weather_code)[0],
      icon: describe(d.current.weather_code)[1]
    },
    hourly: d.hourly.time.slice(start, start + 12).map((t, i) => ({
      time: t.slice(11, 16),
      temp: Math.round(d.hourly.temperature_2m[start + i]),
      icon: describe(d.hourly.weather_code[start + i])[1],
      rain: d.hourly.precipitation_probability[start + i]
    })),
    daily: d.daily.time.map((t, i) => ({
      date: t,
      max: Math.round(d.daily.temperature_2m_max[i]),
      min: Math.round(d.daily.temperature_2m_min[i]),
      icon: describe(d.daily.weather_code[i])[1],
      desc: describe(d.daily.weather_code[i])[0],
      rain: d.daily.precipitation_probability_max[i]
    }))
  };
}

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function getNews(keyword) {
  const base = "https://news.google.com/rss";
  const url = keyword
    ? `${base}/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR:ko`
    : `${base}?hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map((m) => {
    const block = m[1];
    const pick = (tag) => {
      const r = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return r ? decodeEntities(r[1]).trim() : "";
    };
    return { title: pick("title"), link: pick("link"), source: pick("source"), date: pick("pubDate") };
  });
  return items;
}

async function getRates() {
  const d = await getJson("https://open.er-api.com/v6/latest/USD");
  const krw = d.rates.KRW;
  // 1 단위 외화 = ? 원
  const toKrw = (code) => +(krw / d.rates[code]).toFixed(code === "JPY" ? 2 : 1);
  return {
    updated: d.time_last_update_utc,
    rates: [
      { code: "USD", krw: toKrw("USD") },
      { code: "EUR", krw: toKrw("EUR") },
      { code: "JPY", krw: +(toKrw("JPY") * 100).toFixed(1), unit: 100 },
      { code: "CNY", krw: toKrw("CNY") },
      { code: "GBP", krw: toKrw("GBP") }
    ]
  };
}

module.exports = { getWeather, getNews, getRates };
