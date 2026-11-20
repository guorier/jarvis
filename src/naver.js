// 네이버 검색 API (무료, 하루 25,000회): 웹문서 · 블로그 · 지역(가게) · 뉴스
// 키 발급: https://developers.naver.com → 애플리케이션 등록 → 사용 API "검색"
const BASE = "https://openapi.naver.com/v1/search";

const stripTags = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .trim();

function naverReady(settings) {
  return Boolean(settings.naverClientId && settings.naverClientSecret);
}

async function searchType(settings, type, query, display) {
  const url = `${BASE}/${type}.json?query=${encodeURIComponent(query)}&display=${display}`;
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": settings.naverClientId, "X-Naver-Client-Secret": settings.naverClientSecret },
    signal: AbortSignal.timeout(8000)
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("네이버 검색 API 키가 올바르지 않거나 '검색' API 사용 설정이 안 되어 있습니다.");
  }
  if (res.status === 429) throw new Error("네이버 검색 하루 사용량을 넘었습니다.");
  if (!res.ok) throw new Error(`네이버 검색 오류 (HTTP ${res.status})`);
  const data = await res.json();
  return data.items || [];
}

// 여러 종류를 한 번에 찾아 AI가 읽기 좋은 형태로 돌려준다.
// [코드 리뷰] 네 종류를 동시에(Promise.all) 찾아 응답이 빠르다. 키는 메인 프로세스 안에서만 쓰여 화면으로 나가지 않는다.
// [리뷰] 지역·뉴스는 실패해도 빈 목록으로 넘어가지만, 웹문서·블로그 중 하나라도 실패하면 전체가 실패한다.
//        네 종류 모두 .catch(() => [])로 맞추고 "전부 비었을 때만 실패"로 하면 일부 장애에도 답할 수 있다.
async function naverSearch(settings, query) {
  if (!naverReady(settings)) throw new Error("네이버 검색 API 키가 설정되지 않았습니다.");
  const [web, blog, local, news] = await Promise.all([
    searchType(settings, "webkr", query, 5),
    searchType(settings, "blog", query, 5),
    searchType(settings, "local", query, 5).catch(() => []),
    searchType(settings, "news", query, 5).catch(() => [])
  ]);
  return {
    note: "네이버 검색 결과입니다. 질문에 맞는 결과만 골라 한국어로 짧게 답하고, 필요하면 출처(사이트·블로그·가게 이름)를 밝혀라.",
    web: web.map((i) => ({ title: stripTags(i.title), summary: stripTags(i.description), link: i.link })),
    blog: blog.map((i) => ({ title: stripTags(i.title), summary: stripTags(i.description), blogger: i.bloggername, date: i.postdate, link: i.link })),
    places: local.map((i) => ({ name: stripTags(i.title), category: i.category, address: i.roadAddress || i.address, phone: i.telephone || "" })),
    news: news.map((i) => ({ title: stripTags(i.title), summary: stripTags(i.description), date: i.pubDate }))
  };
}

module.exports = { naverSearch, naverReady };
