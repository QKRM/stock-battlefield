export const dynamic = "force-dynamic";

const KIND_URL = "https://kind.krx.co.kr/disclosure/todaydisclosure.do";

const cleanText = (value: string) => value
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ")
  .trim();

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }

  try {
    const body = new URLSearchParams({
      method: "searchTodayDisclosureSub",
      currentPageSize: "3000",
      pageIndex: "1",
      orderMode: "0",
      orderStat: "D",
      marketType: "1",
      forward: "todaydisclosure_sub",
      searchMode: "",
      searchCodeType: "",
      chose: "S",
      todayFlag: "N",
      repIsuSrtCd: "",
      kosdaqSegment: "",
      selDate: date,
      searchCorpName: "",
    });
    const response = await fetch(KIND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${KIND_URL}?method=searchTodayDisclosureMain`,
        "User-Agent": "Mozilla/5.0",
      },
      body,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("KRX event feed unavailable");
    const html = await response.text();
    const events = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).flatMap((match) => {
      const row = match[1];
      const title = cleanText(row.match(/<a[^>]+title=['"]([^'"]+)['"][^>]*>/i)?.[1] ?? "");
      const isSidecar = /사이드카|side\s*car/i.test(title);
      const isCircuitBreaker = /서킷브레이커|circuit\s*breakers?|시장.*매매거래.*중단/i.test(title);
      if (!isSidecar && !isCircuitBreaker) return [];
      const time = row.match(/class=['"]first txc['"][^>]*>\s*(\d{2}:\d{2})/i)?.[1];
      if (!time) return [];
      const type = isCircuitBreaker ? "CIRCUIT_BREAKER" : /매수/.test(title) ? "SIDECAR_BUY" : "SIDECAR_SELL";
      const durationMinutes = isCircuitBreaker ? (/3단계|3차/.test(title) ? 390 : 20) : 5;
      return [{
        type,
        title,
        date,
        time,
        durationMinutes,
        message: isCircuitBreaker ? "주식시장 매매거래 전면 중단" : type === "SIDECAR_BUY" ? "프로그램 매수호가 5분간 효력 정지" : "프로그램 매도호가 5분간 효력 정지",
      }];
    });

    return Response.json({ date, events, source: "KRX KIND" }, {
      headers: { "Cache-Control": "public, max-age=20, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Market event feed unavailable", events: [] }, { status: 502 });
  }
}
