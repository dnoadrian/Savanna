// Rang-Abzeichen als SVG (Lobby, Ergebnis, Statistik): Schild in Rangfarbe mit römischer Stufe,
// Diamant als Edelstein, Elite/Champion mit Flügeln, Unreal als leuchtender lila Stern.
import { RANKS, UNREAL } from '../../shared/ranks.js';
import { t } from '../i18n.js';

const ROMAN = ['I', 'II', 'III'];

export function rankName(i) {
  const r = RANKS[Math.max(0, Math.min(UNREAL, i | 0))];
  return t('rank_' + r.tier.id) + (r.tier.divs > 1 ? ' ' + ROMAN[r.div] : '');
}

export function rankColor(i) {
  return RANKS[Math.max(0, Math.min(UNREAL, i | 0))].tier.color;
}

let uid = 0;
export function rankBadge(i, size = 56) {
  const r = RANKS[Math.max(0, Math.min(UNREAL, i | 0))];
  const { color: c, dark: d, id } = r.tier;
  const g = 'rk' + uid++;
  const grad = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".18" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>`;
  let body;
  if (id === 'unreal') {
    body = `<circle cx="32" cy="32" r="30" fill="${c}" opacity=".25"/><path d="M32 3l7.5 17.5L58 22 44 35l4.5 19L32 44 15.5 54 20 35 6 22l18.5-1.5z" fill="url(#${g})" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><circle cx="32" cy="31" r="6" fill="#fff" opacity=".9"/>`;
  } else if (id === 'diamond') {
    body = `<path d="M32 4l24 20-24 36L8 24z" fill="url(#${g})" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M8 24h48M20 24l12 36 12-36M20 24l12-20 12 20" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>`;
  } else {
    const wings = id === 'elite' || id === 'champion'
      ? `<path d="M14 18L2 12l4 14-4 6 10-2zM50 18l12-6-4 14 4 6-10-2z" fill="${c}" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>` : '';
    body = `${wings}<path d="M32 4l20 7v17c0 15-9 26-20 32C21 54 12 43 12 28V11z" fill="url(#${g})" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><path d="M32 12l12 4v12c0 10-6 17-12 21-6-4-12-11-12-21V16z" fill="${d}" opacity=".35"/>`;
    if (id === 'champion') body += '<path d="M24 8l4 6 4-7 4 7 4-6-2 9H26z" fill="#fff"/>';
  }
  const label = r.tier.divs > 1 ? `<text x="32" y="${id === 'diamond' ? 33 : 37}" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="900" font-size="${ROMAN[r.div].length > 2 ? 17 : 20}" fill="#fff" stroke="${d}" stroke-width="3" paint-order="stroke">${ROMAN[r.div]}</text>` : '';
  return `<svg class="rank-badge rk-${id}" width="${size}" height="${size}" viewBox="0 0 64 64">${grad}${body}${label}</svg>`;
}
