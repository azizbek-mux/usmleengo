import React from "react";
import { SCORE, tappedPoints } from "../lib/rating.js";
import { t } from "../lib/i18n.js";

/**
 * How points are earned, in as few words as it can be said: what a right
 * answer, a wrong one and a typed one do, and the few rules that keep it
 * honest. The numbers are read from the rating itself, so this can never say
 * something the rating does not do.
 *
 * One place, shown wherever points are explained.
 */
export default function PointsRules() {
  const top = SCORE.base + SCORE.bonus;
  const at = (seconds) => Math.round(tappedPoints(seconds));

  return (
    <div className="points-rules">
      <div className="pr-row">
        <span className="pr-mark ok">✓</span>
        <span>
          {t(
            <><b>Right answer:</b> {SCORE.base} points, plus up to {SCORE.bonus} for speed. {top} if instant, {at(3)} at 3 seconds, {at(10)} at 10 seconds — never less than {SCORE.base}.</>,
            <><b>To'g'ri javob:</b> {SCORE.base} ball, tezlik uchun yana {SCORE.bonus} ballgacha. Bir zumda bo'lsa {top}, 3 soniyada {at(3)}, 10 soniyada {at(10)} ball — hech qachon {SCORE.base} dan kam emas.</>,
          )}
        </span>
      </div>
      <div className="pr-row">
        <span className="pr-mark">✗</span>
        <span>
          {t(
            <><b>Wrong answer:</b> −{SCORE.wrongTap} points.</>,
            <><b>Noto'g'ri javob:</b> −{SCORE.wrongTap} ball.</>,
          )}
        </span>
      </div>
      <div className="pr-row">
        <span className="pr-mark ok">Aa</span>
        <span>
          {t(
            <><b>Typed answer:</b> a right one is worth {SCORE.typed} times a tapped one at the same speed. A wrong one costs nothing.</>,
            <><b>Yozma javob:</b> to'g'risi shu tezlikdagi test javobidan {String(SCORE.typed).replace(".", ",")} baravar ko'p. Noto'g'risi hech narsa olmaydi.</>,
          )}
        </span>
      </div>
      <p className="pr-note">
        {t(
          "Your points never go below 0. The clock stops when you answer, so reading the explanation isn't counted. The same question again counts half as much, and an answer too fast to read the question earns nothing.",
          "Ballaringiz hech qachon 0 dan pastga tushmaydi. Vaqt javob bergan zahotingiz to'xtaydi, izohni o'qish hisoblanmaydi. Bir xil savol qayta chiqsa, har safar yarmiga kam ball beradi, savolni o'qishga ulgurmay berilgan javob esa hech narsa bermaydi.",
        )}
      </p>
    </div>
  );
}
