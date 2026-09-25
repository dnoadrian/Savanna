// Namensregeln, Zufallsnamen und Bot-Namen (Server + Client).

const NAME_RE = /^[\p{L}0-9_-]+$/u;

// Einfacher Filter für Beleidigungen / verbotene Wörter (normalisiert, inkl. Leetspeak).
const BANNED = [
  'arsch', 'fick', 'fuck', 'shit', 'scheiss', 'scheis', 'hure', 'nutte', 'wichs', 'fotze', 'votze',
  'bitch', 'cunt', 'cock', 'pussy', 'penis', 'vagina', 'nazi', 'hitler', 'siegheil', 'nigg', 'neger',
  'faggot', 'schwuchtel', 'spast', 'missgeburt', 'hurensohn', 'bastard', 'asshole', 'whore',
  'retard', 'slut', 'porn', 'porno', 'sex', 'kacke', 'pimmel', 'schlampe', 'kanake', 'rape', 'vergewalt',
  'idiot', 'wixer', 'wixxer', 'admin', 'moderator', 'system',
];

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[_-]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

// Liefert null wenn gültig, sonst einen Fehlercode (wird im Client übersetzt).
export function validateName(name) {
  if (typeof name !== 'string' || name.length === 0) return 'empty';
  if (name !== name.trim()) return 'spaces';
  if (/\s/.test(name)) return 'spaces';
  const len = [...name].length;
  if (len < 3) return 'short';
  if (len > 16) return 'long';
  if (!NAME_RE.test(name)) return 'chars';
  const n = normalize(name);
  if (n.includes('bot') || name.toLowerCase().includes('bot')) return 'bot';
  for (const w of BANNED) {
    if (n.includes(w)) return 'banned';
  }
  return null;
}

export function nameKey(name) {
  return String(name).toLowerCase();
}

const ADJ_DE = ['Wilde', 'Flinke', 'Staubige', 'Goldene', 'Mutige', 'Listige', 'Schnelle', 'Stille', 'Tapfere', 'Lustige', 'Heisse', 'Kühne', 'Sandige', 'Freche', 'Coole'];
const NOUN_DE = ['Giraffe', 'Hyäne', 'Gazelle', 'Antilope', 'Katze', 'Echse', 'Eule', 'Schlange', 'Zebra', 'Kobra', 'Löwin', 'Ziege', 'Möwe', 'Maus'];
const ADJ_EN = ['Dusty', 'Sunny', 'Rusty', 'Sandy', 'Wild', 'Lucky', 'Sneaky', 'Brave', 'Swift', 'Golden', 'Crazy', 'Silent', 'Salty', 'Fuzzy', 'Mighty'];
const NOUN_EN = ['Cactus', 'Lion', 'Rhino', 'Hippo', 'Meerkat', 'Eagle', 'Gecko', 'Jackal', 'Baobab', 'Acacia', 'Warthog', 'Falcon', 'Coyote', 'Tumbleweed'];

export function randomName(rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let base;
  if (rnd() < 0.5) {
    const adj = pick(ADJ_DE);
    const noun = pick(NOUN_DE);
    base = adj + noun;
  } else {
    base = pick(ADJ_EN) + pick(NOUN_EN);
  }
  const num = Math.floor(rnd() * 99) + 1;
  let name = base + num;
  if ([...name].length > 16) name = [...name].slice(0, 14).join('') + num % 10;
  return name;
}

export function suggestAlternatives(name, isTaken, count = 3, rnd = Math.random) {
  const out = [];
  const base = [...name.replace(/[^\p{L}0-9_-]/gu, '')].slice(0, 12).join('') || 'Spieler';
  let tries = 0;
  while (out.length < count && tries < 200) {
    tries++;
    let cand;
    if (tries <= 60 && [...base].length >= 3) {
      const suffix = tries < 20 ? String(Math.floor(rnd() * 99) + 1) : String(Math.floor(rnd() * 9999));
      cand = [...(base + suffix)].slice(0, 16).join('');
      if (tries % 4 === 0) cand = [...(base + '_' + suffix)].slice(0, 16).join('');
    } else {
      cand = randomName(rnd);
    }
    if (validateName(cand) === null && !isTaken(cand) && !out.includes(cand)) out.push(cand);
  }
  return out;
}

// Lustige Bot-Namen – im Scoreboard mit [BOT] gekennzeichnet.
export const BOT_NAMES = [
  'Sir Hopsalot', 'Kaktus Karl', 'Zebra Zoe', 'Captain Dust', 'Gnu Gustav', 'Mampfi', 'Nashorn Norbert',
  'Tante Tumbleweed', 'Löwe Lothar', 'Hyänen Hans', 'Pixel Paul', 'Dr. Dünenhüpfer', 'Sandsturm Sabine',
  'Onkel Oase', 'Gazellen Gabi', 'Rostiger Rudi', 'Baobab Bernd', 'Wüstenfuchs Willi', 'Mister Meerkat',
  'Flinke Frieda', 'Termiten Tom', 'Safari Sam', 'Kojote Kevin', 'Geier Günther', 'Warzenschwein Wanda',
  'Heuballen Horst', 'Lady Lasso', 'Nuggets Nina', 'Staubkorn Steffi', 'Paddel Pete', 'Brummbär Bruno',
  'Schakal Schorsch', 'Knochen Knut', 'Lagerfeuer Lisa', 'Pfannkuchen Pia', 'Turbo Tobi', 'Wirbelwind Wolle',
  'Käpt\'n Kiesel', 'Oma Ocelot', 'Sprinter Sven',
];
