"use client";

import type { RefObject } from "react";
import type { ShareCardAspect, ShareCardData, ShareFields } from "../lib/shareCards";

type Props = { card: ShareCardData; fields: ShareFields; aspect: ShareCardAspect; svgRef?: RefObject<SVGSVGElement | null> };

function wrapped(value: string, length: number) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > length && line) { lines.push(line); line = word; } else line = next;
  });
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

export function ShareCard({ card, fields, aspect, svgRef }: Props) {
  const height = aspect === "square" ? 1080 : 1350;
  const titleLines = wrapped(card.title, 24);
  const campaignLines = card.campaign ? wrapped(card.campaign, 30) : [];
  const visibleMetrics = card.metrics.filter((metric) => (metric.label.includes("XP") ? fields.xp : metric.label === "Focused" ? fields.focus : metric.label === "Boss Projects" ? fields.bosses : true)).slice(0, 4);
  const progressPercent = card.progress ? Math.max(0, Math.min(100, card.progress.current / Math.max(1, card.progress.total) * 100)) : 0;
  const footerY = height - 96;

  return <svg ref={svgRef} viewBox={`0 0 1080 ${height}`} role="img" aria-label={`${card.label} progress card`} xmlns="http://www.w3.org/2000/svg" className="h-auto w-full rounded-2xl border border-slate-700 shadow-2xl shadow-black/30">
    <rect width="1080" height={height} fill="#081521" />
    <rect x="48" y="48" width="984" height={height - 96} rx="34" fill="#101c2a" stroke="#243448" strokeWidth="2" />
    <rect x="48" y="48" width="12" height={height - 96} rx="6" fill="#2dd4bf" />
    <text x="100" y="124" fill="#2dd4bf" fontFamily="Arial, Helvetica, sans-serif" fontSize="34" fontWeight="700" letterSpacing="9">FORGE</text>
    <text x="100" y="181" fill="#94a3b8" fontFamily="Arial, Helvetica, sans-serif" fontSize="25" fontWeight="700" letterSpacing="3">{card.label.toUpperCase()}</text>
    {fields.username && card.username ? <text x="980" y="124" fill="#cbd5e1" textAnchor="end" fontFamily="Arial, Helvetica, sans-serif" fontSize="25">{card.username}</text> : null}
    {fields.level ? <text x="980" y="181" fill="#ccfbf1" textAnchor="end" fontFamily="Arial, Helvetica, sans-serif" fontSize="27" fontWeight="700">Level {card.level}</text> : null}
    {campaignLines.length && fields.campaign ? <g>{campaignLines.map((line, index) => <text key={line} x="100" y={250 + index * 43} fill="#cbd5e1" fontFamily="Arial, Helvetica, sans-serif" fontSize="30" fontWeight="600">{line}</text>)}</g> : null}
    {titleLines.map((line, index) => <text key={line} x="100" y={campaignLines.length && fields.campaign ? 365 + index * 72 : 286 + index * 72} fill="#f8fafc" fontFamily="Arial, Helvetica, sans-serif" fontSize="64" fontWeight="700">{line}</text>)}
    {card.subtitle ? <text x="100" y={campaignLines.length && fields.campaign ? 365 + titleLines.length * 72 + 10 : 286 + titleLines.length * 72 + 10} fill="#94a3b8" fontFamily="Arial, Helvetica, sans-serif" fontSize="28">{card.subtitle}</text> : null}
    <line x1="100" y1={campaignLines.length && fields.campaign ? 560 : 470} x2="980" y2={campaignLines.length && fields.campaign ? 560 : 470} stroke="#243448" strokeWidth="2" />
    <g transform={`translate(100 ${campaignLines.length && fields.campaign ? 620 : 530})`}>
      {visibleMetrics.map((metric, index) => <g key={metric.label} transform={`translate(${index % 2 ? 450 : 0} ${Math.floor(index / 2) * 146})`}><text x="0" y="0" fill="#94a3b8" fontFamily="Arial, Helvetica, sans-serif" fontSize="25">{metric.label}</text><text x="0" y="58" fill="#f8fafc" fontFamily="Arial, Helvetica, sans-serif" fontSize="44" fontWeight="700">{metric.value}</text></g>)}
    </g>
    {fields.topStat && card.stat ? <g transform={`translate(100 ${height - 205})`}><text x="0" y="0" fill="#94a3b8" fontFamily="Arial, Helvetica, sans-serif" fontSize="25">TOP GROWTH</text><text x="0" y="52" fill="#ccfbf1" fontFamily="Arial, Helvetica, sans-serif" fontSize="39" fontWeight="700">{card.stat.name} +{card.stat.gain}</text></g> : null}
    {fields.streak && card.type === "weekly" && card.progress ? <text x="980" y={height - 233} fill="#ccfbf1" textAnchor="end" fontFamily="Arial, Helvetica, sans-serif" fontSize="28">{card.progress.current} day streak</text> : null}
    {card.progress && (card.type !== "weekly" || fields.streak) ? <g transform={`translate(100 ${footerY - 28})`}><text x="0" y="0" fill="#94a3b8" fontFamily="Arial, Helvetica, sans-serif" fontSize="22">{card.progress.label}</text><text x="880" y="0" fill="#cbd5e1" textAnchor="end" fontFamily="Arial, Helvetica, sans-serif" fontSize="22">{card.progress.current}{card.progress.total !== 1 ? `/${card.progress.total}` : ""}</text><rect x="0" y="22" width="880" height="10" rx="5" fill="#243448" /><rect x="0" y="22" width={880 * progressPercent / 100} height="10" rx="5" fill="#2dd4bf" /></g> : null}
    <text x="100" y={height - 72} fill="#64748b" fontFamily="Arial, Helvetica, sans-serif" fontSize="19" letterSpacing="2">FORGE · REAL PROGRESS</text>
    {card.date ? <text x="980" y={height - 72} fill="#64748b" textAnchor="end" fontFamily="Arial, Helvetica, sans-serif" fontSize="19">{card.date}</text> : null}
  </svg>;
}
