export const dynamic = "force-dynamic";

const toNumber = (value: unknown) => Number(String(value ?? "0").replaceAll(",", "")) || 0;

const STOCKS = {
  "000660": { naver: "000660", yahoo: "000660.KS" },
  "005930": { naver: "005930", yahoo: "005930.KS" },
} as const;

export async function GET(request: Request) {
  try {
    const symbol = new URL(request.url).searchParams.get("symbol") ?? "000660";
    if (!(symbol in STOCKS)) return Response.json({ error: "Unsupported stock symbol" }, { status: 400 });
    const stockConfig = STOCKS[symbol as keyof typeof STOCKS];
    const [naverResponse, yahooResponse, orderBookResponse] = await Promise.all([
      fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${stockConfig.naver}`, {
        headers: { Referer: "https://finance.naver.com/", "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${stockConfig.yahoo}?range=10d&interval=5m`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }),
      fetch(`https://finance.naver.com/item/sise.naver?code=${stockConfig.naver}&asktype=5`, {
        headers: { Referer: "https://finance.naver.com/", "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }),
    ]);

    if (!naverResponse.ok || !yahooResponse.ok) throw new Error("Upstream market feed error");
    const naver = await naverResponse.json();
    const yahoo = await yahooResponse.json();
    const stock = naver?.datas?.[0];
    const result = yahoo?.chart?.result?.[0];
    const orderBookHtml = orderBookResponse.ok ? await orderBookResponse.text() : "";
    const extractCells = (className: string) => Array.from(orderBookHtml.matchAll(new RegExp(`<td class="num ${className}">[\\s\\S]*?<span[^>]*>([\\s\\S]*?)<\\/span>`, "g")))
      .map((match) => toNumber(match[1].replace(/<[^>]+>/g, "").trim()));
    const askCells = extractCells("bg01");
    const bidCells = extractCells("bg02");
    const asks = Array.from({ length: Math.floor(askCells.length / 2) }, (_, index) => ({ quantity: askCells[index * 2], price: askCells[index * 2 + 1] })).filter((item) => item.price && item.quantity).reverse();
    const bids = Array.from({ length: Math.floor(bidCells.length / 2) }, (_, index) => ({ price: bidCells[index * 2], quantity: bidCells[index * 2 + 1] })).filter((item) => item.price && item.quantity);
    const timestamps: number[] = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0] ?? {};
    const grouped = new Map<string, Array<{ time: number; price: number; volume: number }>>();

    timestamps.forEach((timestamp, index) => {
      const price = quote.close?.[index];
      if (typeof price !== "number") return;
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(timestamp * 1000));
      const bucket = grouped.get(date) ?? [];
      bucket.push({ time: timestamp * 1000, price, volume: quote.volume?.[index] ?? 0 });
      grouped.set(date, bucket);
    });

    const sessions = Array.from(grouped.entries()).slice(-7).map(([date, allPoints]) => {
      const stride = Math.max(1, Math.floor(allPoints.length / 56));
      const points = allPoints.filter((_, index) => index % stride === 0 || index === allPoints.length - 1);
      const prices = allPoints.map((point) => point.price);
      const open = quote.open?.[timestamps.indexOf(allPoints[0].time / 1000)] ?? prices[0];
      const close = prices.at(-1) ?? open;
      return {
        date,
        open,
        high: Math.max(...prices),
        low: Math.min(...prices),
        close,
        change: open ? ((close - open) / open) * 100 : 0,
        volume: allPoints.reduce((sum, point) => sum + point.volume, 0),
        points,
      };
    });

    return Response.json({
      quote: {
        price: toNumber(stock?.closePriceRaw ?? stock?.closePrice),
        change: toNumber(stock?.compareToPreviousClosePriceRaw ?? stock?.compareToPreviousClosePrice),
        changeRate: Number(stock?.fluctuationsRatioRaw ?? stock?.fluctuationsRatio ?? 0),
        open: toNumber(stock?.openPriceRaw ?? stock?.openPrice),
        high: toNumber(stock?.highPriceRaw ?? stock?.highPrice),
        low: toNumber(stock?.lowPriceRaw ?? stock?.lowPrice),
        volume: toNumber(stock?.accumulatedTradingVolumeRaw ?? stock?.accumulatedTradingVolume),
        tradedAt: stock?.localTradedAt ?? new Date().toISOString(),
        marketStatus: stock?.marketStatus ?? "UNKNOWN",
      },
      sessions,
      orderBook: { asks: asks.slice(0, 5), bids: bids.slice(0, 5), delayed: true },
      source: "NAVER · YAHOO FINANCE",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Market feed unavailable" }, { status: 502 });
  }
}
