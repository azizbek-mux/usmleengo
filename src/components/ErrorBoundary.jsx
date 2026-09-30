import { Component } from "react";
import { t } from "../lib/i18n.js";
import { reportProblem } from "../lib/report.js";

/**
 * If a screen ever fails to draw, say so and offer a way out, instead of
 * leaving a blank page that only closing the app clears. Progress is saved as
 * it is made, so reloading loses nothing.
 */
export default class ErrorBoundary extends Component {
  state = { failed: null };

  static getDerivedStateFromError(error) {
    return { failed: error };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const what = String(this.state.failed?.message || this.state.failed).slice(0, 160);
    return (
      <div className="screen">
        <div className="empty" style={{ marginTop: 60 }}>
          <div className="empty-big">⚠️</div>
          <div className="game-err-t">{t("Something went wrong", "Nimadir xato ketdi")}</div>
          <div className="sub" style={{ marginTop: 6 }}>
            {t("Your progress is saved. Reload the app and carry on.", "Natijalaringiz saqlangan. Ilovani qayta yuklab, davom eting.")}
          </div>
        </div>
        <div className="result-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>{t("Reload", "Qayta yuklash")}</button>
          <button className="btn btn-ghost" onClick={() => reportProblem(what)}>{t("Tell the developer", "Dasturchiga yozish")}</button>
        </div>
      </div>
    );
  }
}
