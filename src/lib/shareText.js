// The message a player sends when they tap "Share score".
//
// It goes out through Telegram's share link, which carries plain text only,
// so real formatting cannot travel with it. The app's name is written in
// Unicode's bold sans-serif letters instead, which show as bold in every
// Telegram app on every platform. Only the name is set that way: the letters
// cannot be searched for or read aloud properly, so the rest stays plain.
//
// A Telegram sticker is a message of its own and cannot sit inside a text
// message, so the message leans on emoji instead.

/** "usmleengo" → "𝘂𝘀𝗺𝗹𝗲𝗲𝗻𝗴𝗼". Letters and digits only; anything else is left as is. */
export function boldText(s) {
  return [...String(s)].map((ch) => {
    const c = ch.codePointAt(0);
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d5ee + c - 97); // a-z
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d5d4 + c - 65); // A-Z
    if (c >= 48 && c <= 57) return String.fromCodePoint(0x1d7ec + c - 48); // 0-9
    return ch;
  }).join("");
}

// The picture categories have short tags; say them the way the chips do.
const TAG_NAMES = { histo: "histology", radio: "radiology" };

/**
 * Where the round came from, as the end of "…on usmleengo ___":
 *   "Random" or nothing  → "from all categories"
 *   "3 categories"       → "from 3 categories"
 *   "cardio", "histo"    → "in cardio", "in histology"
 *   a searched topic     → "in Addison disease"
 */
export function roundScope(label) {
  const l = String(label || "").trim();
  if (!l || /^random$/i.test(l)) return "from all categories";
  const many = l.match(/^(\d+) categories$/i);
  if (many) return `from ${many[1]} categories`;
  return `in ${TAG_NAMES[l.toLowerCase()] || l}`;
}

/** The opening emoji, by how the round went. */
function mood(pct) {
  if (pct === 100) return "💯";
  if (pct >= 80) return "🎯";
  if (pct >= 60) return "💪";
  return "📖";
}

/** The medal for a place on the board. */
function medal(place) {
  if (place === 1) return "👑";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return "🏆";
}

/**
 * The whole message.
 *
 *   correct, total — this round
 *   label          — the round's label (see roundScope)
 *   streak         — current day streak
 *   rank           — { place, total } on the overall board, or null
 *   bankSize       — questions in the bank
 *   link           — the Mini App's link, always the last line
 */
export function shareMessage({ correct, total, label, streak = 0, rank = null, bankSize = 0, link }) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const lines = [];

  const perfect = pct === 100 ? "Perfect round! " : "";
  lines.push(`${mood(pct)} ${perfect}I scored ${correct}/${total} — ${pct}% on ${boldText("usmleengo")} ${roundScope(label)}!`);

  // A place out of one is not a ranking worth sharing.
  if (rank?.place && rank.total >= 2) {
    lines.push(rank.place === 1
      ? `${medal(1)} I'm #1 of ${rank.total.toLocaleString("en-US")} on the leaderboard right now`
      : `${medal(rank.place)} I'm ranked #${rank.place} of ${rank.total.toLocaleString("en-US")} now`);
  }
  if (streak >= 2) lines.push(`🔥 ${streak}-day streak`);

  lines.push("");
  const bank = bankSize >= 100 ? `${Math.floor(bankSize / 100) * 100}+` : String(bankSize || "");
  lines.push(`🩺 ${bank ? `${bank} free` : "Free"} USMLE quizzes. You can try now 👇`);
  lines.push(link);
  return lines.join("\n");
}
