/** Brand color pairs used to tint treemap tiles and allocation bars. */
const BRAND: Record<string, [string, string]> = {
  SPY: ["#001AFF", "#1F36FF"],
  NVDA: ["#77B900", "#9ACB42"],
  SPCX: ["#0B3550", "#A0B1BF"],
  AAPL: ["#000000", "#414141"],
  MU: ["#000000", "#8F8F8F"],
  SNDK: ["#E10600", "#E0807B"],
  GOOGL: ["#3086FF", "#FF4440"],
  TSLA: ["#E82127", "#F27F82"],
  INTC: ["#125AA9", "#739DCC"],
  SGOV: ["#00A9E0", "#000101"],
  PLTR: ["#000000", "#B1B1B1"],
  NFLX: ["#B0060F", "#000000"],
  META: ["#027FFB", "#0162E1"],
  RDDT: ["#FE4302", "#051114"],
  AMD: ["#000000", "#AFAFAF"],
  MSFT: ["#04A5F0", "#FFBA0A"],
  COIN: ["#0052FF", "#8EB2FF"],
  GME: ["#FE0000", "#000000"],
  USAR: ["#2B3D51", "#ACB4BC"],
  BABA: ["#FF5A00", "#FFAC7F"],
  AMZN: ["#FE6500", "#000000"],
  ORCL: ["#C64534", "#C64534"],
  RDW: ["#DD0000", "#000000"],
  USO: ["#000000", "#5E5E61"],
  RBLX: ["#000000", "#AFAFAF"],
  SHOP: ["#94BE46", "#000000"],
  MSTR: ["#FA660F", "#010000"],
  AAOI: ["#5C468F", "#9283B4"],
  BE: ["#76B96A", "#223343"],
  IREN: ["#0B354E", "#72DB81"],
  PENG: ["#0063B3", "#7EB4DA"],
  NNE: ["#53AE43", "#245B20"],
  AMAT: ["#0E91C8", "#7CC3E1"],
  CLSK: ["#16318A", "#A5AFD2"],
  CRWV: ["#233EE1", "#010101"],
  LLY: ["#D52B1E", "#ECA19C"],
  QQQ: ["#0000C7", "#A0A0EA"],
  APLD: ["#007BFF", "#60ADFF"],
  COST: ["#005DAA", "#E10E2E"],
  TTWO: ["#000000", "#404040"],
  TSM: ["#F30B1B", "#F6525D"],
  ASTS: ["#F99F2D", "#FBC581"],
  DELL: ["#007DB8", "#4BA3CD"],
  LITE: ["#C0C0C0", "#7E7E7E"],
  MXL: ["#FC4E4E", "#100F0F"],
  RKLB: ["#000000", "#000000"],
  ZM: ["#2D8CFF", "#509FFF"],
  QCOM: ["#3253DC", "#9FAFEF"],
  CELH: ["#FD7E0E", "#000000"],
  AVGO: ["#CC092F", "#D42E4F"],
  SMCI: ["#003A70", "#00923D"],
  XOM: ["#ED1B2D", "#F79DA5"],
  NBIS: ["#E0FF4F", "#062C42"],
  IONQ: ["#FE9F3E", "#969696"],
  SLV: ["#00A9E0", "#000101"],
  EWY: ["#00A9E0", "#000101"],
  DDOG: ["#4F1395", "#C2AEDA"],
  XLK: ["#001AFF", "#1F36FF"],
  F: ["#00095B", "#9FA2C1"],
  WDAY: ["#0165A7", "#EFA12C"],
  NOW: ["#8CC63F", "#005833"],
  ASML: ["#0F238C", "#505FAB"],
  MRVL: ["#000000", "#A3A3A3"],
  FLNC: ["#014FB3", "#447DC6"],
  QBTS: ["#1D2329", "#55595E"],
  TSEM: ["#0151A0", "#B0B0B0"],
  INOD: ["#0A436C", "#94ADBE"],
  UMC: ["#0057A6", "#72A2CD"],
  GLW: ["#000000", "#A0A0A0"],
  NVTS: ["#5DE0E6", "#000101"],
  LULU: ["#000000", "#9F9F9F"],
  POET: ["#8FBFE0", "#0F75BC"],
  LUNR: ["#0058A1", "#71A2CA"],
  RIVN: ["#FDB202", "#173430"],
  MDB: ["#001E2B", "#00ED64"],
  PR: ["#DFD0AB", "#DFD0AB"],
  NU: ["#820AD1", "#C185E8"],
  RGTI: ["#000000", "#A0A0A0"],
  ZS: ["#0076BE", "#82BCDF"],
  CCL: ["#D40000", "#2C5B95"],
  UPS: ["#301506", "#FEBD0A"],
  BA: ["#0033A1", "#9FB1DB"],
  QUBT: ["#5C4DA0", "#000000"],
  SPMO: ["#0000C7", "#A0A0EA"],
  SOXX: ["#00A9E0", "#000101"],
  CBRS: ["#FE622D", "#000000"],
  INTU: ["#355DBD", "#8EA4D9"],
  FUTU: ["#095ECB", "#8DB4DD"],
  ELF: ["#000000", "#A0A0A0"],
};

const OVERRIDES: Record<string, [string, string]> = {
  AMD: ["#ED1C24", "#000000"],
  SPCX: ["#000000", "#555555"],
};

const NEUTRAL = "var(--asset-color-neutral)";
const PAPER = [246, 245, 242];

type Rgb = number[];

function brandPair(symbol: string) {
  const key = symbol.trim().toUpperCase();
  return OVERRIDES[key] ?? BRAND[key] ?? null;
}

const mix = (rgb: Rgb, amount: number) => rgb.map((c, i) => c * amount + PAPER[i] * (1 - amount));

function contrast(rgb: Rgb, ink: "#000000" | "#FFFFFF") {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return ink === "#000000" ? (luminance + 0.05) / 0.05 : 1.05 / (luminance + 0.05);
}

function ensureContrast(rgb: Rgb, ink: "#000000" | "#FFFFFF") {
  const rounded = rgb.map(Math.round);
  if (contrast(rounded, ink) >= 4.5) return rounded;
  const target = ink === "#000000" ? 255 : 0;
  for (let i = 1; i <= 20; i += 1) {
    const t = 0.025 * i;
    const next = rgb.map((c) => Math.round(c * (1 - t) + target * t));
    if (contrast(next, ink) >= 4.5) return next;
  }
  return [target, target, target];
}

const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

export function assetColor(symbol: string) {
  return brandPair(symbol)?.[0] ?? NEUTRAL;
}

/** Soft brand gradient plus a legible ink color for a tile. */
export function assetSurface(symbol: string): { background: string; foreground: string; stops: string[] | null } {
  const pair = brandPair(symbol);
  const match = pair ? /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(pair[0]) : null;
  const base = match ? match.slice(1).map((h) => parseInt(h, 16)) : null;
  if (!base) return { background: NEUTRAL, foreground: "#000000", stops: null };

  const tints = [mix(base, 0.68), mix(base, 0.34)];
  const ink =
    Math.min(...tints.map((t) => contrast(t, "#000000"))) >= Math.min(...tints.map((t) => contrast(t, "#FFFFFF")))
      ? "#000000"
      : "#FFFFFF";
  const stops = tints.map((t) => toHex(ensureContrast(t, ink)));
  return { background: `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 100%)`, foreground: ink, stops };
}
