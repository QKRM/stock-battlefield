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
  source: string;
};

const fallbackSessions: Session[] = Array.from({ length: 7 }, (_, index) => {
  const day = new Date(Date.now() - (6 - index) * 86400000);
  const base = 1380000 + index * 6500 + Math.sin(index * 1.7) * 27000;
  const points = Array.from({ length: 48 }, (_, i) => ({
    time: day.setHours(9, i * 8, 0, 0),
    price: Math.round(base + Math.sin(i / 5) * 18000 + Math.cos(i / 2.8) * 6000),
    volume: Math.round(26000 + Math.abs(Math.sin(i / 7)) * 74000),
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

const fallbackData: MarketData = {
  quote: {
    price: fallbackSessions.at(-1)!.close,
    change: fallbackSessions.at(-1)!.close - fallbackSessions.at(-1)!.open,
    changeRate: fallbackSessions.at(-1)!.change,
    open: fallbackSessions.at(-1)!.open,
    high: fallbackSessions.at(-1)!.high,
    low: fallbackSessions.at(-1)!.low,
    volume: fallbackSessions.at(-1)!.volume,
    tradedAt: new Date().toISOString(),
    marketStatus: "CLOSE",
  },
  sessions: fallbackSessions,
  source: "DEMO FEED",
};

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const compact = (value: number) =>
  new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00+09:00`);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`;
}

function MarketScene({ session, live }: { session: Session; live: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animation = 0;
    let frame = 0;

    const draw = () => {
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
      const pressure = Math.max(-1, Math.min(1, session.change / 5));
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
        const s = (9.5 + z * 5) * base.scale;
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
        const s = (4.2 + z * 3.6) * base.scale;
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

      const field = context.createRadialGradient(width * (buyPower > .5 ? .65 : .35), horizon, 25, width * .5, height * .64, width * .76);
      field.addColorStop(0, buyPower > .5 ? "rgba(49,112,66,.92)" : "rgba(113,48,49,.86)");
      field.addColorStop(.42, "rgba(47,67,44,.96)");
      field.addColorStop(1, "rgba(11,17,13,.99)");
      context.fillStyle = field;
      context.fillRect(0, horizon, width, height - horizon);

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

      // The moving price front: real session direction controls which army advances.
      const frontAt = (z: number) => frontlineShift * (.28 + z * .72) + Math.sin(time * .72) * .065 * (1 - Math.abs(pressure) * .35) + Math.sin(z * 11 + time * 1.7) * .035;
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

      // Paired walls travel back and forth across the battlefield.
      for (let row = 0; row < 12; row += 1) {
        const z = .08 + row * .075;
        const front = frontAt(z);
        const clash = Math.sin(time * 2.5 + row * .8) * .018;
        const scale = 10 + z * 13;
        block(front - .085 - clash, z, scale, 20 + ((row * 7) % 18), "red", .86);
        block(front + .085 + clash, z, scale, 20 + ((row * 11) % 20), "green", .9);
      }

      const volumeLoad = Math.min(1.35, Math.max(.18, session.volume / 4000000));
      // The visible force grows with cumulative traded volume.
      for (let row = 0; row < 8; row += 1) {
        const z = .16 + row * .105;
        const front = frontAt(z);
        const unitCount = 3 + Math.floor(volumeLoad * 5);
        for (let unit = 0; unit < unitCount; unit += 1) {
          const depthPhase = (time * (.16 + (unit % 3) * .025) + row * .23 + unit * .31) % 1;
          const redHome = -.92 + unit * .105;
          const greenHome = .92 - unit * .105;
          const redAdvance = Math.min(front - .15, redHome + depthPhase * .34 * (1 - pressure * .45));
          const greenAdvance = Math.max(front + .15, greenHome - depthPhase * .34 * (1 + pressure * .45));
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

      const airCount = Math.floor(Math.max(0, volumeLoad - .36) * 7);
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
  }, [session, live]);

  return <canvas ref={canvasRef} className="battle-canvas" aria-label="SK하이닉스 매수·매도 압력 시각화" />;
}

export default function Home() {
  const [data, setData] = useState<MarketData>(fallbackData);
  const [selected, setSelected] = useState("LIVE");
  const [now, setNow] = useState(new Date());
  const [connected, setConnected] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch("/api/market", { cache: "no-store" });
      if (!response.ok) throw new Error("market feed unavailable");
      const next = (await response.json()) as MarketData;
      if (next.sessions?.length) {
        setData(next);
        setConnected(true);
      }
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const quoteTimer = window.setInterval(loadData, 30000);
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
        return current + 1;
      });
    }, 220);
    return () => window.clearInterval(timer);
  }, [live, replayPlaying, session.points.length]);

  const replaySession = useMemo(() => {
    if (live || !session.points.length) return session;
    const end = Math.min(replayIndex, session.points.length - 1);
    const points = session.points.slice(0, end + 1);
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
  const buyPressure = Math.max(18, Math.min(82, 50 + changeRate * 5.4));
  const sellPressure = 100 - buyPressure;
  const pressureLabel = Math.abs(changeRate) < 0.35 ? "팽팽한 공방" : changeRate > 0 ? "매수 우위" : "매도 우위";
  const forceTier = activeSession.volume > 2800000 ? "총력전 · 공중전력 투입" : activeSession.volume > 1500000 ? "대규모 기계화 증원" : activeSession.volume > 600000 ? "장갑·보급 부대 투입" : "초기 보병 교전";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><i /><i /></span><strong>stockhedge</strong><em>KOREA DATA</em></div>
        <div className="only-view"><span /> SK하이닉스 BATTLEFIELD</div>
        <div className="connection"><i className={connected ? "online" : ""} /> {connected ? "MARKET DATA CONNECTED" : "CONNECTING"}<b>KOSPI · 000660</b></div>
      </header>

      <aside className="sidebar">
        <p className="side-title">CURRENT VIEW</p>
        <div className="side-link selected"><span>◩</span><div><b>Hynix Battlefield</b><small>실시간 매수·매도 전선</small></div></div>
        <div className="side-explain"><span>RED</span><p>매도 세력 · 전진 시 주가 압박</p><span>GREEN</span><p>매수 세력 · 전진 시 주가 상승 압력</p><span>WHITE LINE</span><p>두 세력이 충돌하는 현재 가격 전선</p></div>
        <div className="side-footer"><span>DATA FEED</span><b>{connected ? "CONNECTED" : "FALLBACK"}</b><small>30초마다 갱신</small></div>
      </aside>

      <main className="content" id="battlefield">
        <section className="heading-row">
          <div><div className="eyebrow"><span className="ticker-dot" /> 000660 · KOSPI</div><h1>SK하이닉스 Battlefield</h1><p>호가벽, 거래량, 가격 압력을 하나의 시장 전장으로 시각화합니다.</p></div>
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
          <input aria-label="장중 리플레이 시점" type="range" min="0" max={Math.max(0, session.points.length - 1)} value={Math.min(replayIndex, Math.max(0, session.points.length - 1))} onChange={(event) => { setReplayPlaying(false); setReplayIndex(Number(event.target.value)); }} />
          <span>15:30</span>
          <b>{replayIndex + 1} / {session.points.length}</b>
        </div>}

        <section className="battlefield" aria-label="SK하이닉스 시장 전장">
          <MarketScene session={activeSession} live={live} />
          <div className="scene-grid" />
          <div className="scene-top-left"><b>KST {live ? now.toLocaleTimeString("ko-KR", { hour12: false }) : replayPoint ? new Date(replayPoint.time).toLocaleTimeString("ko-KR", { hour12: false }) : "09:00:00"}</b><span>{live ? "실시간 전장" : `${session.date} 장중 리플레이`}</span></div>
          <div className="scene-price"><small>SK HYNIX · {live ? "LIVE" : "REPLAY"}</small><strong>{won(quotePrice)}</strong><b className={changeRate >= 0 ? "up" : "down"}>{changeRate >= 0 ? "▲" : "▼"} {Math.abs(changeRate).toFixed(2)}%</b></div>
          <div className="scene-pressure"><small>MARKET PRESSURE</small><strong>{pressureLabel}</strong><span>{forceTier}</span></div>
          <div className="wall-label sell"><small>SELL WALL</small><strong>{sellPressure.toFixed(1)}%</strong><span>매도 압력</span></div>
          <div className="wall-label buy"><small>BUY WALL</small><strong>{buyPressure.toFixed(1)}%</strong><span>매수 압력</span></div>
          <div className="live-badge"><span /> {live ? (data.quote.marketStatus === "OPEN" ? "LIVE MARKET" : "LATEST CLOSE") : "HISTORICAL"}</div>

          <div className="floating-panels">
            <article className="glass-panel order-depth" id="depth">
              <div className="panel-heading"><div><small>ORDER BOOK DEPTH</small><strong>호가 잔량 분포</strong></div><span className="source-pill">KRX 통합</span></div>
              <div className="depth-scale"><span>SELL</span><i /><span>BUY</span></div>
              {[0.84, 0.63, 0.46, 0.72, 0.91].map((amount, index) => <div className="depth-row" key={index}><b>{won(quotePrice + (2 - index) * 1000)}</b><div><i className="sell-bar" style={{ width: `${amount * sellPressure}%` }} /><i className="buy-bar" style={{ width: `${amount * buyPressure}%` }} /></div><span>{compact(activeSession.volume * amount / 18)}</span></div>)}
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
          </div>
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
