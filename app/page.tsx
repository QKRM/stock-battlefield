"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SessionPoint = { time: number; price: number; volume: number };
type Session = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  volume: number;
  points: SessionPoint[];
};
type MarketData = {
  quote: {
    price: number;
    change: number;
    changeRate: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    tradedAt: string;
    marketStatus: string;
  };
  sessions: Session[];
  orderBook: {
    asks: Array<{ price: number; quantity: number }>;
    bids: Array<{ price: number; quantity: number }>;
    delayed: boolean;
  };
  source: string;
};

type StockCode = "000660" | "005930";

const STOCKS = {
  "000660": { symbol: "000660" as const, name: "SK하이닉스", englishName: "SK HYNIX", shortName: "Hynix", fallbackBase: 1380000, tick: 1000, volumeScale: 1 },
  "005930": { symbol: "005930" as const, name: "삼성전자", englishName: "SAMSUNG ELEC", shortName: "Samsung", fallbackBase: 182000, tick: 100, volumeScale: 5.4 },
};

function makeFallbackData(code: StockCode): MarketData {
  const stock = STOCKS[code];
  const sessions: Session[] = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(Date.now() - (6 - index) * 86400000);
    const base = stock.fallbackBase * (1 + index * .0045 + Math.sin(index * 1.7) * .018);
    const points = Array.from({ length: 48 }, (_, i) => ({
      time: day.setHours(9, i * 8, 0, 0),
      price: Math.round((base + Math.sin(i / 5) * stock.fallbackBase * .013 + Math.cos(i / 2.8) * stock.fallbackBase * .004) / stock.tick) * stock.tick,
      volume: Math.round((26000 + Math.abs(Math.sin(i / 7)) * 74000) * stock.volumeScale),
    }));
    const prices = points.map((point) => point.price);
    return {
      date: new Date(points[0].time).toISOString().slice(0, 10),
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices.at(-1)!,
      change: ((prices.at(-1)! - prices[0]) / prices[0]) * 100,
      volume: points.reduce((sum, point) => sum + point.volume, 0),
      points,
    };
  });
  const latest = sessions.at(-1)!;
  return {
    quote: { price: latest.close, change: latest.close - latest.open, changeRate: latest.change, open: latest.open, high: latest.high, low: latest.low, volume: latest.volume, tradedAt: new Date().toISOString(), marketStatus: "CLOSE" },
    sessions,
    orderBook: {
      asks: Array.from({ length: 5 }, (_, index) => ({ price: latest.close + (index + 1) * stock.tick, quantity: Math.round((1800 + index * 730) * stock.volumeScale) })),
      bids: Array.from({ length: 5 }, (_, index) => ({ price: latest.close - (index + 1) * stock.tick, quantity: Math.round((2400 + index * 640) * stock.volumeScale) })),
      delayed: true,
    },
    source: "DEMO FEED",
  };
}

const fallbackDataByStock: Record<StockCode, MarketData> = {
  "000660": makeFallbackData("000660"),
  "005930": makeFallbackData("005930"),
};

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const compact = (value: number) =>
  new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00+09:00`);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`;
}

function MarketScene({ session, live, bookPressure, depthProfile, priceLevels, stockName }: { session: Session; live: boolean; bookPressure: number; depthProfile: { asks: number[]; bids: number[] }; priceLevels: { current: number; asks: Array<{ price: number; quantity: number }>; bids: Array<{ price: number; quantity: number }> }; stockName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneState = useRef({ session, live, bookPressure, depthProfile, priceLevels });
  sceneState.current = { session, live, bookPressure, depthProfile, priceLevels };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animation = 0;
    let frame = 0;
    let smoothPressure = sceneState.current.bookPressure;

    const draw = () => {
      const { session, live, bookPressure, depthProfile, priceLevels } = sceneState.current;
      smoothPressure += (bookPressure - smoothPressure) * .035;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== rect.width * ratio || canvas.height !== rect.height * ratio) {
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const width = rect.width;
      const height = rect.height;
      context.clearRect(0, 0, width, height);

      const time = frame * (live ? 0.016 : 0.011);
      const pressure = Math.max(-1, Math.min(1, smoothPressure));
      const buyPower = .5 + pressure * .34;
      const frontlineShift = -pressure * .33;
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "#030906");
      sky.addColorStop(0.38, "#102019");
      sky.addColorStop(1, "#080b09");
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      const horizon = height * 0.22;
      const project = (x: number, z: number, y = 0) => ({
        x: width / 2 + x * width * (.16 + z * .44),
        y: horizon + z * (height - horizon) - y * (24 + z * 46),
        scale: .28 + z * 1.02,
      });
      const polygon = (points: Array<{x:number;y:number}>, fill: string, stroke?: string) => {
        context.beginPath();
        points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.closePath();
        context.fillStyle = fill;
        context.fill();
        if (stroke) { context.strokeStyle = stroke; context.stroke(); }
      };
      const block = (x: number, z: number, size: number, tall: number, color: "red" | "green", alpha = 1) => {
        const base = project(x, z);
        const s = size * base.scale;
        const h = tall * base.scale;
        const palette = color === "green"
          ? [`rgba(34,132,79,${alpha})`,`rgba(19,77,48,${alpha})`,`rgba(86,250,164,${alpha})`]
          : [`rgba(150,42,53,${alpha})`,`rgba(89,24,31,${alpha})`,`rgba(255,92,105,${alpha})`];
        polygon([{x:base.x-s,y:base.y-h},{x:base.x,y:base.y-h-s*.42},{x:base.x+s,y:base.y-h},{x:base.x,y:base.y-h+s*.42}],palette[2]);
        polygon([{x:base.x-s,y:base.y-h},{x:base.x,y:base.y-h+s*.42},{x:base.x,y:base.y+s*.42},{x:base.x-s,y:base.y}],palette[1]);
        polygon([{x:base.x+s,y:base.y-h},{x:base.x,y:base.y-h+s*.42},{x:base.x,y:base.y+s*.42},{x:base.x+s,y:base.y}],palette[0]);
      };
      const tank = (x: number, z: number, color: "red" | "green", bounce: number) => {
        const base = project(x, z);
        const direction = color === "red" ? 1 : -1;
        const s = (11.5 + z * 6) * base.scale;
        const lift = bounce * base.scale;
        const bright = color === "green" ? "#55e89a" : "#ee5967";
        const body = color === "green" ? "#216b45" : "#792d36";
        const dark = color === "green" ? "#102f21" : "#38171c";
        context.save();
        context.fillStyle = "rgba(0,0,0,.48)";
        context.beginPath(); context.ellipse(base.x, base.y + s * .36, s * 1.28, s * .35, 0, 0, Math.PI * 2); context.fill();
        polygon([{x:base.x-s*1.18,y:base.y+s*.16-lift},{x:base.x-s*.78,y:base.y-s*.5-lift},{x:base.x+s*.95,y:base.y-s*.36-lift},{x:base.x+s*1.24,y:base.y+s*.2-lift}],dark,`${bright}77`);
        polygon([{x:base.x-s*.82,y:base.y-s*.45-lift},{x:base.x-s*.35,y:base.y-s*.78-lift},{x:base.x+s*.72,y:base.y-s*.64-lift},{x:base.x+s*.98,y:base.y-s*.33-lift}],body);
        context.fillStyle = bright;
        context.beginPath(); context.ellipse(base.x+direction*s*.05,base.y-s*.72-lift,s*.42,s*.26,-.06,0,Math.PI*2); context.fill();
        context.strokeStyle = bright; context.lineWidth = Math.max(1, s*.14); context.lineCap = "round";
        context.beginPath(); context.moveTo(base.x+direction*s*.22,base.y-s*.75-lift); context.lineTo(base.x+direction*s*1.72,base.y-s*.93-lift); context.stroke();
        context.strokeStyle = "rgba(8,12,10,.9)"; context.lineWidth = Math.max(1,s*.12);
        for(let tread=-.76;tread<=.8;tread+=.33){context.beginPath();context.moveTo(base.x+tread*s,base.y-s*.26-lift);context.lineTo(base.x+(tread+.11)*s,base.y+s*.1-lift);context.stroke();}
        context.restore();
      };
      const soldier = (x: number, z: number, color: "red" | "green", stride: number) => {
        const base = project(x, z);
        const direction = color === "red" ? 1 : -1;
        const s = (5.8 + z * 4.5) * base.scale;
        const bright = color === "green" ? "#72f2aa" : "#ff727e";
        const armor = color === "green" ? "#174f34" : "#60242c";
        context.save();
        context.translate(base.x, base.y);
        context.lineCap = "round";
        context.strokeStyle = "rgba(0,0,0,.75)"; context.lineWidth = Math.max(1,s*.52);
        context.beginPath(); context.moveTo(0,-s*1.5); context.lineTo(0,-s*.45); context.stroke();
        context.strokeStyle = bright; context.lineWidth = Math.max(1,s*.24);
        context.beginPath(); context.moveTo(0,-s*.65); context.lineTo(-s*.42,-s*.05+stride); context.moveTo(0,-s*.65); context.lineTo(s*.42,-s*.05-stride); context.stroke();
        context.strokeStyle = armor; context.lineWidth = Math.max(1,s*.34);
        context.beginPath(); context.moveTo(0,-s*1.15); context.lineTo(direction*s*.58,-s*.68); context.stroke();
        context.strokeStyle = bright; context.lineWidth = Math.max(1,s*.16);
        context.beginPath(); context.moveTo(direction*s*.12,-s*1.05); context.lineTo(direction*s*1.18,-s*.87); context.stroke();
        context.fillStyle = bright; context.beginPath(); context.arc(0,-s*1.75,s*.34,0,Math.PI*2); context.fill();
        context.fillStyle = armor; context.beginPath(); context.arc(direction*s*.06,-s*1.86,s*.3,Math.PI,Math.PI*2); context.fill();
        context.restore();
      };
      const artillery = (x: number, z: number, color: "red" | "green", recoil: number) => {
        tank(x, z, color, 0);
        const base = project(x, z);
        const direction = color === "red" ? 1 : -1;
        const s = (10 + z * 5) * base.scale;
        const bright = color === "green" ? "#7affb6" : "#ff7c87";
        context.save();
        context.strokeStyle = bright;
        context.lineCap = "round";
        context.lineWidth = Math.max(2, s * .23);
        context.beginPath();
        context.moveTo(base.x + direction * s * .05, base.y - s * .86);
        context.lineTo(base.x + direction * s * (2.25 - recoil * .2), base.y - s * 1.48);
        context.stroke();
        context.fillStyle = bright;
        context.beginPath();
        context.arc(base.x + direction * s * (2.28 - recoil * .2), base.y - s * 1.49, Math.max(1.5, s * .18), 0, Math.PI * 2);
        context.fill();
        context.restore();
      };
      const truck = (x: number, z: number, color: "red" | "green", bounce: number) => {
        const base = project(x, z);
        const direction = color === "red" ? 1 : -1;
        const s = (8.5 + z * 4) * base.scale;
        const bright = color === "green" ? "#55e89a" : "#f26370";
        const body = color === "green" ? "#1d6240" : "#702b34";
        const y = base.y - bounce * base.scale;
        context.save();
        context.fillStyle = "rgba(0,0,0,.48)";
        context.beginPath(); context.ellipse(base.x, y + s * .42, s * 1.35, s * .28, 0, 0, Math.PI * 2); context.fill();
        context.fillStyle = body;
        context.fillRect(base.x - s * 1.2, y - s * .58, s * 1.55, s * .72);
        context.fillStyle = bright;
        context.fillRect(base.x + direction * s * .35, y - s * .72, direction * s * .62, s * .86);
        context.fillStyle = "#08100b";
        context.fillRect(base.x + direction * s * .47, y - s * .58, direction * s * .34, s * .28);
        context.fillStyle = "#090b0a";
        for (const wheel of [-.78, .62]) { context.beginPath(); context.arc(base.x + wheel * s, y + s * .24, s * .25, 0, Math.PI * 2); context.fill(); }
        context.strokeStyle = `${bright}99`; context.lineWidth = 1;
        for(let rib=-1;rib<.2;rib+=.3){context.beginPath();context.moveTo(base.x+rib*s,y-s*.57);context.lineTo(base.x+rib*s,y+s*.08);context.stroke();}
        context.restore();
      };
      const drone = (x: number, z: number, color: "red" | "green", phase: number) => {
        const base = project(x, z, .23 + Math.sin(phase) * .035);
        const s = (5 + z * 4) * base.scale;
        const bright = color === "green" ? "#79ffb8" : "#ff7d88";
        context.save();
        context.translate(base.x, base.y);
        context.rotate(Math.sin(phase * .7) * .08);
        context.strokeStyle = bright; context.lineWidth = Math.max(1,s*.18);
        context.beginPath(); context.moveTo(-s,0); context.lineTo(s,0); context.moveTo(0,-s*.62); context.lineTo(0,s*.62); context.stroke();
        context.fillStyle = bright; context.beginPath(); context.ellipse(0,0,s*.35,s*.24,0,0,Math.PI*2); context.fill();
        for(const [rx,ry] of [[-s,0],[s,0],[0,-s*.62],[0,s*.62]]){context.strokeStyle=`${bright}88`;context.beginPath();context.ellipse(rx,ry,s*.42,s*.12,phase,0,Math.PI*2);context.stroke();}
        context.restore();
      };
      const helicopter = (x: number, z: number, color: "red" | "green", phase: number) => {
        const base = project(x, z, .38 + Math.sin(phase * .8) * .025);
        const direction = color === "red" ? 1 : -1;
        const s = (8 + z * 5) * base.scale;
        const bright = color === "green" ? "#69f2a7" : "#f66c78";
        const body = color === "green" ? "#1b6941" : "#7b2a34";
        context.save();
        context.fillStyle="rgba(0,0,0,.32)";context.beginPath();context.ellipse(base.x,base.y+s*2.8,s*1.4,s*.25,0,0,Math.PI*2);context.fill();
        context.fillStyle=body;context.beginPath();context.ellipse(base.x,base.y,s*.9,s*.5,0,0,Math.PI*2);context.fill();
        polygon([{x:base.x-direction*s*.55,y:base.y-s*.12},{x:base.x-direction*s*2.05,y:base.y-s*.36},{x:base.x-direction*s*2.15,y:base.y-s*.12},{x:base.x-direction*s*.55,y:base.y+s*.16}],body);
        context.fillStyle=bright;context.beginPath();context.ellipse(base.x+direction*s*.45,base.y-s*.08,s*.35,s*.28,0,0,Math.PI*2);context.fill();
        context.strokeStyle=`${bright}bb`;context.lineWidth=Math.max(1,s*.12);context.beginPath();context.moveTo(base.x-s*2.15,base.y-s*.75);context.lineTo(base.x+s*2.15,base.y+s*.75);context.stroke();
        context.strokeStyle=bright;context.beginPath();context.arc(base.x-direction*s*2.05,base.y-s*.25,s*.45,phase,phase+Math.PI*1.7);context.stroke();
        context.restore();
      };
      context.save();
      context.beginPath();
      context.moveTo(0, horizon);
      context.lineTo(width, horizon);
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      context.clip();

      const field = context.createLinearGradient(0, 0, width, 0);
      field.addColorStop(0, "rgba(87,44,36,.98)");
      field.addColorStop(.38, "rgba(91,67,42,.96)");
      field.addColorStop(.5 + pressure * .13, "rgba(58,70,43,.96)");
      field.addColorStop(.66, "rgba(39,85,53,.96)");
      field.addColorStop(1, "rgba(13,49,31,.99)");
      context.fillStyle = field;
      context.fillRect(0, horizon, width, height - horizon);

      const groundLight = context.createRadialGradient(width * .5, horizon + height * .13, 20, width * .5, height * .6, width * .72);
      groundLight.addColorStop(0, "rgba(190,205,130,.18)");
      groundLight.addColorStop(.6, "rgba(37,53,32,.06)");
      groundLight.addColorStop(1, "rgba(0,0,0,.48)");
      context.fillStyle = groundLight;
      context.fillRect(0, horizon, width, height - horizon);

      // Low-poly hills and craters give the flat grid a battlefield silhouette.
      for (let i = 0; i < 22; i += 1) {
        const z = .08 + ((i * 37) % 88) / 100;
        const x = -1 + ((i * 53) % 190) / 95;
        if (Math.abs(x) < .19) continue;
        const base = project(x, z);
        const size = (7 + (i % 5) * 4) * base.scale;
        context.fillStyle = x < 0 ? "rgba(67,38,30,.35)" : "rgba(19,65,40,.38)";
        polygon([{x:base.x-size*1.8,y:base.y},{x:base.x-size*.4,y:base.y-size*.8},{x:base.x+size*.25,y:base.y-size*1.5},{x:base.x+size*1.6,y:base.y}],context.fillStyle as string);
        context.strokeStyle = "rgba(0,0,0,.2)";
        context.beginPath(); context.ellipse(base.x, base.y + size * .12, size * 1.1, size * .28, 0, 0, Math.PI * 2); context.stroke();
      }

      context.strokeStyle = "rgba(205,222,175,.1)";
      context.lineWidth = 1;
      for (let i = -10; i <= 10; i += 1) {
        const far = project(i / 10, 0);
        const near = project(i / 10, 1);
        context.beginPath();
        context.moveTo(far.x, far.y);
        context.lineTo(near.x, near.y);
        context.stroke();
      }
      for (let z = 0; z <= 1; z += .08) {
        const left = project(-1, z);
        const right = project(1, z);
        context.beginPath();
        context.moveTo(left.x, left.y);
        context.lineTo(right.x, right.y);
        context.stroke();
      }

      // Supply roads cross the map and reinforce the tilted camera depth.
      const drawRoad = (offset: number, color: string, widthFactor: number) => {
        context.beginPath();
        for (let z = 0; z <= 1; z += .025) {
          const x = offset + (z - .5) * .92 + Math.sin(z * 5.2) * .025;
          const point = project(x, z);
          if (z === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
        }
        context.strokeStyle = color;
        context.lineWidth = widthFactor;
        context.stroke();
      };
      drawRoad(-.66, "rgba(220,204,158,.18)", 8);
      drawRoad(-.66, "rgba(247,231,180,.26)", 1.2);
      drawRoad(.52, "rgba(187,220,186,.15)", 7);
      drawRoad(.52, "rgba(213,244,211,.24)", 1.1);

      for (let i = 0; i < 42; i += 1) {
        const z = .12 + ((i * 29) % 82) / 100;
        const side = i % 2 ? -1 : 1;
        const x = side * (.42 + ((i * 17) % 45) / 100);
        const tree = project(x, z);
        const s = (2.8 + z * 5.5) * tree.scale;
        context.fillStyle = side < 0 ? "rgba(48,32,25,.75)" : "rgba(12,52,30,.82)";
        context.fillRect(tree.x - s * .12, tree.y - s * .9, s * .24, s * .9);
        polygon([{x:tree.x,y:tree.y-s*2.4},{x:tree.x-s*.75,y:tree.y-s*.65},{x:tree.x+s*.75,y:tree.y-s*.65}],side < 0 ? "rgba(77,48,34,.78)" : "rgba(22,82,47,.82)");
      }

      // The moving price front: real session direction controls which army advances.
      const frontAt = (z: number) => frontlineShift * (.28 + z * .72) + (z - .42) * .18 + Math.sin(time * .72) * .055 * (1 - Math.abs(pressure) * .35) + Math.sin(z * 7 + time * 1.35) * .055;
      context.beginPath();
      for (let z = 0; z <= 1.02; z += .025) {
        const point = project(frontAt(z), z, .015 + Math.sin(time * 3 + z * 18) * .006);
        if (z === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
      }
      context.lineWidth = 22;
      context.strokeStyle = "rgba(174,255,207,.075)";
      context.stroke();
      context.lineWidth = 3;
      context.strokeStyle = "#baffd4";
      context.shadowBlur = 22;
      context.shadowColor = context.strokeStyle;
      context.stroke();
      context.shadowBlur = 0;

      // Trench lines track both sides of the active price boundary.
      for (const side of [-1, 1]) {
        context.beginPath();
        for (let z = .05; z <= 1; z += .025) {
          const point = project(frontAt(z) + side * (.13 + z * .04), z);
          if (z === .05) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
        }
        context.setLineDash([5, 7]);
        context.strokeStyle = side < 0 ? "rgba(255,113,120,.42)" : "rgba(103,255,170,.42)";
        context.lineWidth = 2.2;
        context.stroke();
      }
      context.setLineDash([]);

      const drawGroundPrice = (x: number, y: number, label: string, color: string, align: "left" | "right") => {
        const fontSize = Math.max(8, Math.min(12, 8 + (y - horizon) / Math.max(1, height - horizon) * 5));
        context.font = `700 ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
        context.textAlign = align;
        context.textBaseline = "middle";
        const metrics = context.measureText(label);
        const boxWidth = metrics.width + 10;
        context.fillStyle = "rgba(4,8,6,.78)";
        context.fillRect(align === "left" ? x - 4 : x - boxWidth + 4, y - fontSize * .8, boxWidth, fontSize * 1.55);
        context.strokeStyle = `${color}88`;
        context.lineWidth = 1;
        context.strokeRect(align === "left" ? x - 4 : x - boxWidth + 4, y - fontSize * .8, boxWidth, fontSize * 1.55);
        context.fillStyle = color;
        context.shadowBlur = 8;
        context.shadowColor = color;
        context.fillText(label, x, y);
        context.shadowBlur = 0;
      };

      // Actual quote prices are printed directly beside their battlefield lanes.
      for (let i = 0; i < 5; i += 1) {
        const z = .15 + i * .16;
        const front = frontAt(z);
        const ask = priceLevels.asks[i];
        const bid = priceLevels.bids[i];
        const askPoint = project(front - .2 - i * .008, z, .025);
        const bidPoint = project(front + .2 + i * .008, z + .018, .025);
        const frontPoint = project(front, z, .02);
        context.strokeStyle = "rgba(255,255,255,.2)";
        context.lineWidth = 1;
        context.beginPath(); context.moveTo(frontPoint.x, frontPoint.y); context.lineTo(askPoint.x, askPoint.y); context.moveTo(frontPoint.x, frontPoint.y); context.lineTo(bidPoint.x, bidPoint.y); context.stroke();
        if (ask) drawGroundPrice(askPoint.x - 5, askPoint.y, `매도 ${Math.round(ask.price).toLocaleString("ko-KR")}`, "#ff8791", "right");
        if (bid) drawGroundPrice(bidPoint.x + 5, bidPoint.y, `매수 ${Math.round(bid.price).toLocaleString("ko-KR")}`, "#73f2ab", "left");
      }

      for (const z of [.26, .52, .78, .94]) {
        const point = project(frontAt(z), z, .055);
        const before = project(frontAt(Math.max(0, z - .02)), Math.max(0, z - .02), .055);
        const after = project(frontAt(Math.min(1, z + .02)), Math.min(1, z + .02), .055);
        const angle = Math.atan2(after.y - before.y, after.x - before.x) - Math.PI / 2;
        const text = `현재 ${Math.round(priceLevels.current).toLocaleString("ko-KR")}원`;
        context.save();
        context.translate(point.x, point.y);
        context.rotate(angle);
        context.font = `800 ${9 + z * 4}px ${getComputedStyle(document.body).fontFamily}`;
        context.textAlign = "center";
        const width = context.measureText(text).width + 12;
        context.fillStyle = "rgba(5,10,7,.88)";
        context.fillRect(-width / 2, -10, width, 19);
        context.strokeStyle = "rgba(208,255,225,.68)";
        context.strokeRect(-width / 2, -10, width, 19);
        context.fillStyle = "#f2fff7";
        context.shadowBlur = 10;
        context.shadowColor = "#87ffb7";
        context.fillText(text, 0, 1);
        context.restore();
      }

      // Paired walls travel back and forth across the battlefield.
      for (let row = 0; row < 12; row += 1) {
        const z = .08 + row * .075;
        const front = frontAt(z);
        const clash = Math.sin(time * 2.5 + row * .8) * .018;
        const scale = 6 + z * 9;
        const askDepth = depthProfile.asks[row % Math.max(1, depthProfile.asks.length)] ?? .5;
        const bidDepth = depthProfile.bids[row % Math.max(1, depthProfile.bids.length)] ?? .5;
        block(front - .075 - clash, z, scale, 5 + askDepth * 15, "red", .82);
        block(front + .075 + clash, z, scale, 5 + bidDepth * 15, "green", .86);
      }

      const volumeLoad = Math.min(1.35, Math.max(.18, session.volume / 4000000));
      // The visible force grows with cumulative traded volume.
      for (let row = 0; row < 9; row += 1) {
        const z = .12 + row * .1;
        const front = frontAt(z);
        const unitCount = 8 + Math.floor(volumeLoad * 7);
        for (let unit = 0; unit < unitCount; unit += 1) {
          const depthPhase = (time * (.22 + (unit % 3) * .035) + row * .23 + unit * .23) % 1;
          const redHome = -.84 + unit * .067;
          const greenHome = .84 - unit * .067;
          const redAdvance = Math.min(front - .13, redHome + depthPhase * .44 * (1 - pressure * .45));
          const greenAdvance = Math.max(front + .13, greenHome - depthPhase * .44 * (1 + pressure * .45));
          const bob = Math.abs(Math.sin(time * 5 + unit + row));
          const unitType = (unit + row * 2) % 8;
          if (unitType === 0 || unitType === 6) {
            tank(redAdvance, z + .012, "red", bob * 1.3);
            tank(greenAdvance, z + .026, "green", bob * 1.3);
          } else if (unitType === 4 && volumeLoad > .5) {
            artillery(redAdvance, z + .012, "red", bob);
            artillery(greenAdvance, z + .026, "green", bob);
          } else if (unitType === 2 && volumeLoad > .32) {
            truck(redAdvance, z + .012, "red", bob);
            truck(greenAdvance, z + .026, "green", bob);
          } else {
            soldier(redAdvance, z + (unit % 2) * .025, "red", Math.sin(time * 7 + unit) * 1.2);
            soldier(greenAdvance, z + ((unit + 1) % 2) * .025, "green", Math.sin(time * 7 + unit + 2) * 1.2);
          }
        }
      }

      const airCount = Math.floor(Math.max(0, volumeLoad - .28) * 9);
      for (let i = 0; i < airCount; i += 1) {
        const z = .18 + (i % 4) * .18;
        const orbit = Math.sin(time * .42 + i * 1.9) * .16;
        const redX = -.48 + orbit - pressure * .12;
        const greenX = .48 - orbit - pressure * .12;
        if (i % 3 === 2 && volumeLoad > .75) {
          helicopter(redX, z, "red", time * 4 + i);
          helicopter(greenX, z + .035, "green", time * 4 + i + 1);
        } else {
          drone(redX, z, "red", time * 5 + i);
          drone(greenX, z + .025, "green", time * 5 + i + 2);
        }
      }

      // Rifle and machine-gun tracers continuously cross the live price front.
      const fireCount = Math.min(76, 24 + Math.floor(volumeLoad * 30) + Math.floor(Math.abs(pressure) * 16));
      for (let i = 0; i < fireCount; i += 1) {
        const redFires = i % 2 === 0;
        const z = .1 + ((i * 37) % 86) / 100;
        const front = frontAt(z);
        const speed = .68 + (i % 7) * .07;
        const travel = (time * speed + i * .173) % 1;
        const fromX = front + (redFires ? -.52 - (i % 4) * .035 : .52 + (i % 4) * .035);
        const toX = front + (redFires ? .16 : -.16);
        const x = fromX + (toX - fromX) * travel;
        const previousTravel = Math.max(0, travel - .09);
        const previousX = fromX + (toX - fromX) * previousTravel;
        const lift = .018 + Math.sin(travel * Math.PI) * (.025 + (i % 3) * .009);
        const point = project(x, z, lift);
        const previous = project(previousX, z, lift);
        const tracer = redFires ? "rgba(255,166,95,.96)" : "rgba(120,255,190,.96)";
        context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(point.x, point.y);
        context.strokeStyle = tracer; context.lineWidth = 1 + z * 1.5;
        context.shadowBlur = 8; context.shadowColor = tracer; context.stroke(); context.shadowBlur = 0;
        if (travel < .045) {
          const muzzle = project(fromX, z, .025);
          context.fillStyle = "rgba(255,241,170,.95)";
          context.beginPath(); context.arc(muzzle.x, muzzle.y, 2 + z * 3, 0, Math.PI * 2); context.fill();
        }
      }

      // Heavy shells fly in visible arcs and detonate on the opposing side.
      const shellCount = 5 + Math.floor(volumeLoad * 5);
      for (let i = 0; i < shellCount; i += 1) {
        const redFires = i % 2 === 0;
        const z = .18 + (i % 6) * .125;
        const front = frontAt(z);
        const travel = (time * (.24 + (i % 3) * .035) + i * .29) % 1;
        const fromX = front + (redFires ? -.68 : .68);
        const toX = front + (redFires ? .22 : -.22);
        const x = fromX + (toX - fromX) * travel;
        const lift = .08 + Math.sin(travel * Math.PI) * (.3 + (i % 2) * .08);
        const shell = project(x, z, lift);
        const shellTrail = project(fromX + (toX - fromX) * Math.max(0, travel - .035), z, lift * .96);
        context.beginPath(); context.moveTo(shellTrail.x, shellTrail.y); context.lineTo(shell.x, shell.y);
        context.strokeStyle = "rgba(255,232,170,.9)"; context.lineWidth = 2 + z; context.stroke();
        context.fillStyle = redFires ? "#ff8a65" : "#8affc4";
        context.beginPath(); context.arc(shell.x, shell.y, 2.2 + z * 1.8, 0, Math.PI * 2); context.fill();
        if (travel > .91) {
          const impact = project(toX, z, .03);
          const blast = (travel - .91) / .09;
          const radius = (1 - blast) * (14 + z * 13) + 3;
          const glow = context.createRadialGradient(impact.x, impact.y, 0, impact.x, impact.y, radius);
          glow.addColorStop(0, "rgba(255,249,199,.98)"); glow.addColorStop(.3, "rgba(255,133,61,.82)"); glow.addColorStop(1, "rgba(255,48,24,0)");
          context.fillStyle = glow; context.beginPath(); context.arc(impact.x, impact.y, radius, 0, Math.PI * 2); context.fill();
        }
      }

      // Smoke columns linger around repeated impact zones.
      for (let i = 0; i < 12; i += 1) {
        const z = .14 + ((i * 23) % 78) / 100;
        const phase = (time * .14 + i * .19) % 1;
        const point = project(frontAt(z) + Math.sin(i * 2.3) * .11, z, .03 + phase * .22);
        const size = (3 + phase * 12) * (.45 + z);
        context.fillStyle = `rgba(68,70,62,${(1 - phase) * .25})`;
        context.beginPath(); context.arc(point.x, point.y, size, 0, Math.PI * 2); context.fill();
      }

      // Price/order-book ticks ripple down the line without restarting the scene.
      const pulseZ = (time * .36) % 1;
      const pulsePoint = project(frontAt(pulseZ), pulseZ, .04);
      context.beginPath();
      context.arc(pulsePoint.x, pulsePoint.y, 5 + pulseZ * 17, 0, Math.PI * 2);
      context.strokeStyle = pressure >= 0 ? "rgba(113,255,177,.75)" : "rgba(255,111,122,.75)";
      context.lineWidth = 2;
      context.shadowBlur = 15;
      context.shadowColor = context.strokeStyle;
      context.stroke();
      context.shadowBlur = 0;

      for (let i = 0; i < 4; i += 1) {
        const burst = (Math.sin(time * 2.1 + i * 2.7) + 1) / 2;
        if (burst < .82) continue;
        const z = .22 + i * .19;
        const point = project(frontAt(z) + Math.sin(i * 4.3) * .07, z, .08);
        const radius = (burst - .8) * (32 + z * 24);
        const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, Math.max(2, radius));
        glow.addColorStop(0, "rgba(255,245,185,.96)");
        glow.addColorStop(.35, "rgba(255,143,64,.7)");
        glow.addColorStop(1, "rgba(255,73,35,0)");
        context.fillStyle = glow;
        context.beginPath(); context.arc(point.x, point.y, Math.max(2, radius), 0, Math.PI * 2); context.fill();
      }

      // Clash sparks move down the front line and make the battle feel alive.
      for (let i = 0; i < 34; i += 1) {
        const z = ((i * .127 + time * .18) % .92) + .04;
        const side = i % 2 ? -1 : 1;
        const point = project(frontAt(z) + side * (Math.sin(time * 6 + i) * .025), z, .06 + Math.abs(Math.sin(time * 4 + i)) * .08);
        const radius = 1 + z * 2.1;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = side > 0 ? "rgba(104,255,173,.92)" : "rgba(255,104,115,.88)";
        context.shadowBlur = 10;
        context.shadowColor = context.fillStyle;
        context.fill();
      }
      context.shadowBlur = 0;
      context.restore();

      const vignette = context.createRadialGradient(width / 2, height / 2, width * 0.15, width / 2, height / 2, width * 0.75);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,.68)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);
      frame += 1;
      animation = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animation);
  }, []);

  return <canvas ref={canvasRef} className="battle-canvas" aria-label={`${stockName} 매수·매도 압력 시각화`} />;
}

export default function Home() {
  const [stockCode, setStockCode] = useState<StockCode>("000660");
  const [data, setData] = useState<MarketData>(fallbackDataByStock["000660"]);
  const [selected, setSelected] = useState("LIVE");
  const [now, setNow] = useState(new Date());
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const stock = STOCKS[stockCode];
  const fallbackData = fallbackDataByStock[stockCode];
  const fallbackSessions = fallbackData.sessions;

  const loadData = useCallback(async () => {
    try {
      const response = await fetch(`/api/market?symbol=${stockCode}`, { cache: "no-store" });
      if (!response.ok) throw new Error("market feed unavailable");
      const next = (await response.json()) as MarketData;
      if (next.sessions?.length) {
        setData({ ...next, orderBook: next.orderBook?.asks?.length && next.orderBook?.bids?.length ? next.orderBook : fallbackData.orderBook });
        setConnected(true);
        setLastUpdated(new Date());
      }
    } catch {
      setConnected(false);
    }
  }, [fallbackData.orderBook, stockCode]);

  const selectStock = useCallback((code: StockCode) => {
    if (code === stockCode) return;
    setStockCode(code);
    setData(fallbackDataByStock[code]);
    setSelected("LIVE");
    setReplayPlaying(false);
    setConnected(false);
  }, [stockCode]);

  useEffect(() => {
    loadData();
    const quoteTimer = window.setInterval(loadData, 10000);
    const clockTimer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearInterval(quoteTimer);
      window.clearInterval(clockTimer);
    };
  }, [loadData]);

  const sessions = useMemo(() => data.sessions.slice(-7), [data.sessions]);
  const session = useMemo(() => {
    if (selected === "LIVE") return sessions.at(-1) ?? fallbackSessions.at(-1)!;
    return sessions.find((item) => item.date === selected) ?? sessions.at(-1) ?? fallbackSessions.at(-1)!;
  }, [selected, sessions]);
  const live = selected === "LIVE";
  useEffect(() => {
    if (!live) {
      setReplayIndex(Math.max(0, session.points.length - 1));
      setReplayPlaying(false);
    }
  }, [live, selected, session.points.length]);

  useEffect(() => {
    if (live || !replayPlaying) return;
    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        if (current >= session.points.length - 1) {
          setReplayPlaying(false);
          return current;
        }
        return Math.min(session.points.length - 1, current + .25);
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [live, replayPlaying, session.points.length]);

  const replaySession = useMemo(() => {
    if (live || !session.points.length) return session;
    const cursor = Math.min(replayIndex, session.points.length - 1);
    const end = Math.floor(cursor);
    const fraction = cursor - end;
    const points = session.points.slice(0, end + 1);
    const current = session.points[end];
    const next = session.points[Math.min(end + 1, session.points.length - 1)];
    if (fraction > 0 && current && next) {
      points.push({
        time: current.time + (next.time - current.time) * fraction,
        price: current.price + (next.price - current.price) * fraction,
        volume: next.volume * fraction,
      });
    }
    const prices = points.map((point) => point.price);
    const close = prices.at(-1) ?? session.open;
    return {
      ...session,
      high: Math.max(...prices),
      low: Math.min(...prices),
      close,
      change: session.open ? ((close - session.open) / session.open) * 100 : 0,
      volume: points.reduce((sum, point) => sum + point.volume, 0),
      points,
    };
  }, [live, replayIndex, session]);
  const activeSession = live ? session : replaySession;
  const replayPoint = activeSession.points.at(-1);
  const quotePrice = live ? data.quote.price : activeSession.close;
  const changeRate = live ? data.quote.changeRate : activeSession.change;
  const replayBook = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const pulse = .65 + Math.abs(Math.sin((replayPoint?.time ?? 0) / 470000 + index * 1.37));
    const baseQuantity = Math.max(200, (replayPoint?.volume ?? 10000) / 7);
    return {
      ask: { price: quotePrice + (index + 1) * stock.tick, quantity: Math.round(baseQuantity * pulse * (1 - changeRate / 18)) },
      bid: { price: quotePrice - (index + 1) * stock.tick, quantity: Math.round(baseQuantity * (1.8 - pulse / 2) * (1 + changeRate / 18)) },
    };
  }), [changeRate, quotePrice, replayPoint?.time, replayPoint?.volume, stock.tick]);
  const bookLevels = live
    ? Array.from({ length: 5 }, (_, index) => ({ ask: data.orderBook.asks[index], bid: data.orderBook.bids[index] })).filter((level) => level.ask && level.bid)
    : replayBook;
  const askTotal = bookLevels.reduce((sum, level) => sum + level.ask.quantity, 0);
  const bidTotal = bookLevels.reduce((sum, level) => sum + level.bid.quantity, 0);
  const buyPressure = live && askTotal + bidTotal > 0 ? Math.max(12, Math.min(88, bidTotal / (askTotal + bidTotal) * 100)) : Math.max(18, Math.min(82, 50 + changeRate * 5.4));
  const sellPressure = 100 - buyPressure;
  const bookPressure = Math.max(-1, Math.min(1, (buyPressure - 50) / 34));
  const maxBookQuantity = Math.max(1, ...bookLevels.flatMap((level) => [level.ask.quantity, level.bid.quantity]));
  const bestAsk = bookLevels[0]?.ask.price ?? quotePrice + stock.tick;
  const bestBid = bookLevels[0]?.bid.price ?? quotePrice - stock.tick;
  const refreshIn = Math.max(0, 10 - Math.floor((now.getTime() - lastUpdated.getTime()) / 1000));
  const pressureLabel = Math.abs(changeRate) < 0.35 ? "팽팽한 공방" : changeRate > 0 ? "매수 우위" : "매도 우위";
  const forceTier = activeSession.volume > 2800000 ? "총력전 · 공중전력 투입" : activeSession.volume > 1500000 ? "대규모 기계화 증원" : activeSession.volume > 600000 ? "장갑·보급 부대 투입" : "초기 보병 교전";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><i /><i /></span><strong>stockhedge</strong><em>KOREA DATA</em></div>
        <div className="only-view"><span /> {stock.name} BATTLEFIELD</div>
        <div className="connection"><i className={connected ? "online" : ""} /> {connected ? "10 SEC LIVE FEED" : "CONNECTING"}<b>KOSPI · {stock.symbol} · {refreshIn}s</b></div>
      </header>

      <aside className="sidebar">
        <p className="side-title">CURRENT VIEW</p>
        <div className="side-link selected"><span>◩</span><div><b>{stock.shortName} Battlefield</b><small>실시간 매수·매도 전선</small></div></div>
        <div className="side-explain"><span>RED</span><p>매도 세력 · 전진 시 주가 압박</p><span>GREEN</span><p>매수 세력 · 전진 시 주가 상승 압력</p><span>WHITE LINE</span><p>두 세력이 충돌하는 현재 가격 전선</p></div>
        <div className="side-footer"><span>DATA FEED</span><b>{connected ? "CONNECTED" : "FALLBACK"}</b><small>10초마다 시세 갱신 · 전투는 실시간 렌더링</small></div>
      </aside>

      <main className="content" id="battlefield">
        <section className="heading-row">
          <div><div className="eyebrow"><span className="ticker-dot" /> {stock.symbol} · KOSPI</div><h1>{stock.name} Battlefield</h1><p>호가벽, 거래량, 가격 압력을 하나의 시장 전장으로 시각화합니다.</p></div>
          <div className="stock-switcher" role="group" aria-label="종목 선택">
            {(Object.values(STOCKS) as Array<(typeof STOCKS)[StockCode]>).map((item) => <button key={item.symbol} className={stockCode === item.symbol ? "selected" : ""} onClick={() => selectStock(item.symbol)}><span>{item.symbol}</span><b>{item.name}</b></button>)}
          </div>
        </section>

        <div className="date-switcher" role="group" aria-label="조회 일자">
          <button className={live ? "selected live" : ""} onClick={() => setSelected("LIVE")}><span /> LIVE</button>
          {sessions.map((item) => <button key={item.date} className={selected === item.date ? "selected" : ""} onClick={() => setSelected(item.date)}>{formatDate(item.date)}<small>{item.change >= 0 ? "+" : ""}{item.change.toFixed(2)}%</small></button>)}
        </div>

        {!live && <div className="replay-control">
          <button className={replayPlaying ? "playing" : ""} onClick={() => {
            if (replayIndex >= session.points.length - 1) setReplayIndex(0);
            setReplayPlaying((value) => !value);
          }} aria-label={replayPlaying ? "리플레이 일시정지" : "리플레이 재생"}>{replayPlaying ? "Ⅱ" : "▶"}</button>
          <div className="replay-time"><small>INTRADAY REPLAY</small><strong>{replayPoint ? new Date(replayPoint.time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "09:00"}</strong></div>
          <span>09:00</span>
          <input aria-label="장중 리플레이 시점" type="range" min="0" max={Math.max(0, session.points.length - 1)} step="0.01" value={Math.min(replayIndex, Math.max(0, session.points.length - 1))} onChange={(event) => { setReplayPlaying(false); setReplayIndex(Number(event.target.value)); }} />
          <span>15:30</span>
          <b>{Math.floor(replayIndex) + 1} / {session.points.length}</b>
        </div>}

        <section className="battlefield" aria-label={`${stock.name} 시장 전장`}>
          <MarketScene session={activeSession} live={live} bookPressure={bookPressure} depthProfile={{ asks: bookLevels.map((level) => level.ask.quantity / maxBookQuantity), bids: bookLevels.map((level) => level.bid.quantity / maxBookQuantity) }} priceLevels={{ current: quotePrice, asks: bookLevels.map((level) => level.ask), bids: bookLevels.map((level) => level.bid) }} stockName={stock.name} />
          <div className="scene-grid" />
          <div className="scene-top-left"><b>KST {live ? now.toLocaleTimeString("ko-KR", { hour12: false }) : replayPoint ? new Date(replayPoint.time).toLocaleTimeString("ko-KR", { hour12: false }) : "09:00:00"}</b><span>{live ? "실시간 전장" : `${session.date} 장중 리플레이`}</span></div>
          <div className="scene-price"><small>{stock.englishName} · {live ? "LIVE" : "REPLAY"}</small><strong>{won(quotePrice)}</strong><b className={changeRate >= 0 ? "up" : "down"}>{changeRate >= 0 ? "▲" : "▼"} {Math.abs(changeRate).toFixed(2)}%</b></div>
          <div className="scene-pressure"><small>MARKET PRESSURE</small><strong>{pressureLabel}</strong><span>{forceTier}</span></div>
          <div className="wall-label sell"><small>SELL WALL</small><strong>{sellPressure.toFixed(1)}%</strong><span>매도 압력</span></div>
          <div className="wall-label buy"><small>BUY WALL</small><strong>{buyPressure.toFixed(1)}%</strong><span>매수 압력</span></div>
          <div className="front-quote-strip"><span className="ask">매도 1호가 <b>{won(bestAsk)}</b></span><strong>현재 전선 <em>{won(quotePrice)}</em></strong><span className="bid">매수 1호가 <b>{won(bestBid)}</b></span></div>
          <div className="live-badge"><span /> {live ? (data.quote.marketStatus === "OPEN" ? "LIVE MARKET" : "LATEST CLOSE") : "HISTORICAL"}</div>
        </section>

          <section className="floating-panels" aria-label="호가 및 체결 정보">
            <article className="glass-panel order-depth" id="depth">
              <div className="panel-heading"><div><small>ORDER BOOK DEPTH</small><strong>5단계 호가 잔량</strong></div><span className="source-pill">{live ? "실제 호가 · 20분 지연" : "장중 추정"}</span></div>
              <div className="depth-scale"><span>SELL {compact(askTotal)}</span><i /><span>BUY {compact(bidTotal)}</span></div>
              {bookLevels.map((level, index) => <div className="depth-row" key={index}><b className="ask-price">{won(level.ask.price)}</b><div title={`매도 ${level.ask.quantity.toLocaleString()}주 · 매수 ${level.bid.quantity.toLocaleString()}주`}><i className="sell-bar" style={{ width: `${level.ask.quantity / maxBookQuantity * 50}%` }} /><i className="buy-bar" style={{ width: `${level.bid.quantity / maxBookQuantity * 50}%` }} /></div><span className="bid-price">{won(level.bid.price)}</span></div>)}
            </article>

            <article className="glass-panel market-feed" id="feed">
              <div className="panel-heading"><div><small>MARKET FEED</small><strong>시장 체결 흐름</strong></div><span className="feed-live"><i /> {live ? "LIVE" : session.date}</span></div>
              <div className="feed-list">
                {activeSession.points.slice(-5).reverse().map((point, index) => {
                  const previous = activeSession.points[Math.max(0, activeSession.points.length - 2 - index)]?.price ?? point.price;
                  const isUp = point.price >= previous;
                  return <div className="feed-row" key={`${point.time}-${index}`}><time>{new Date(point.time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}</time><span className={isUp ? "trade-dot buy-dot" : "trade-dot sell-dot"} /> <b>{isUp ? "매수 체결" : "매도 체결"}</b><strong>{won(point.price)}</strong><em>{compact(point.volume)}주</em></div>;
                })}
              </div>
            </article>
          </section>

        <section className="stat-strip">
          <div><small>시가</small><strong>{won(live ? data.quote.open : session.open)}</strong></div>
          <div><small>고가</small><strong className="up">{won(live ? data.quote.high : activeSession.high)}</strong></div>
          <div><small>저가</small><strong className="down">{won(live ? data.quote.low : activeSession.low)}</strong></div>
          <div><small>거래량</small><strong>{compact(live ? data.quote.volume : activeSession.volume)}주</strong></div>
          <div><small>데이터 소스</small><strong>{connected ? data.source : "연결 대기 중"}</strong></div>
        </section>
        <p className="disclaimer">본 화면은 정보 제공용 시각화이며 투자 권유가 아닙니다. 실시간 시세는 제공처 사정에 따라 지연될 수 있습니다.</p>
      </main>
    </div>
  );
}
