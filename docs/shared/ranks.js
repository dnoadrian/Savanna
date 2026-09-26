// Ranked-System (statt Level): Bronze I–III → Silber I–III → Gold I–III → Diamant I–III →
// Elite → Champion → Unreal. Fortschritt 0–100 % pro Stufe aus Platzierung und Kills; höhere
// Ränge bringen weniger, ab Diamant kostet frühes Ausscheiden Fortschritt. Kein Abstieg.
export const RANK_TIERS = [
  { id: 'bronze', divs: 3, color: '#d08a4e', dark: '#6b3a17', mult: 1.3, loss: 0 },
  { id: 'silver', divs: 3, color: '#d3dbe6', dark: '#56637a', mult: 1.0, loss: 0 },
  { id: 'gold', divs: 3, color: '#ffd24a', dark: '#8a5a00', mult: 0.8, loss: 0 },
  { id: 'diamond', divs: 3, color: '#6fe0ff', dark: '#0d5a85', mult: 0.6, loss: 8 },
  { id: 'elite', divs: 1, color: '#aeb7c9', dark: '#171b24', mult: 0.4, loss: 12 },
  { id: 'champion', divs: 1, color: '#ff8a3d', dark: '#7a2100', mult: 0.3, loss: 15 },
  { id: 'unreal', divs: 1, color: '#d08bff', dark: '#3b0a70', mult: 0, loss: 0 },
];

// flache Liste aller Stufen: { tier, t (Rang-Index), div (0 = I) }
export const RANKS = RANK_TIERS.flatMap((tier, t) => Array.from({ length: tier.divs }, (_, div) => ({ tier, t, div })));
export const UNREAL = RANKS.length - 1;

const PLACE_PTS = [40, 28, 22, 18, 15, 12, 9, 7, 5, 3, 2, 1];
const KILL_PTS = 6;

export function clampRank(r) {
  const i = Number.isFinite(r?.i) ? Math.max(0, Math.min(UNREAL, Math.round(r.i))) : 0;
  const p = i === UNREAL ? 0 : Number.isFinite(r?.p) ? Math.max(0, Math.min(99.9, r.p)) : 0;
  return { i, p };
}

// Fortschritt eines Matches in Prozent (kann ab Diamant negativ sein)
export function rankGain(i, placement, kills) {
  const tier = RANKS[Math.max(0, Math.min(UNREAL, i))].tier;
  const place = Math.max(1, Math.min(12, placement || 12));
  const parts = [];
  if (!tier.mult) return { parts, total: 0 };
  const pp = Math.round(PLACE_PTS[place - 1] * tier.mult);
  parts.push({ key: 'rkPlacement', v: pp });
  const kp = Math.round(Math.min(10, kills || 0) * KILL_PTS * tier.mult);
  if (kp) parts.push({ key: 'rkKills', v: kp });
  if (tier.loss && place >= 9) parts.push({ key: 'rkEarly', v: -tier.loss });
  return { parts, total: parts.reduce((s, x) => s + x.v, 0) };
}

// Ergebnis anwenden: { before, after, gain, promoted (Anzahl Aufstiege) }
export function applyRankResult(state, placement, kills) {
  const before = clampRank(state);
  const gain = rankGain(before.i, placement, kills);
  let i = before.i, p = before.p + gain.total, promoted = 0;
  while (p >= 100 && i < UNREAL) { p -= 100; i++; promoted++; }
  if (i === UNREAL) p = 0;
  p = Math.max(0, p);
  return { before, after: { i, p: Math.round(p * 10) / 10 }, gain, promoted };
}
