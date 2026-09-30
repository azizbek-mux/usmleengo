import React, { useCallback, useEffect, useState } from "react";
import { classCall, classInviteParam, fetchBotFile } from "../lib/classApi.js";
import { AssignScreen, AssignmentResults, PackageEditor } from "./ClassPackages.jsx";
import { dayText, t } from "../lib/i18n.js";
import { formatPace } from "../lib/rating.js";
import { setClassSharing } from "../lib/ratingApi.js";
import { classInviteMessage } from "../lib/shareText.js";
import { tagLabel } from "../lib/tags.js";
import { APP_LINK, haptic, initData, share } from "../lib/telegram.js";
import { BackBar, ScreenHead } from "./Chrome.jsx";
import { PlaceMark } from "./Rating.jsx";

// The Class tab. Teachers create classrooms and see every student's numbers;
// students join with a code or an invite link, once the teacher lets them in,
// and see the class ranking. See worker/src/classroom.js for the rules.

const reasons = () => ({
  telegram: t("Classes work inside Telegram. Open usmleengo from @usmleengo_bot.",
    "Guruhlar faqat Telegram ichida ishlaydi. usmleengoni @usmleengo_bot orqali oching."),
  offline: t("Couldn’t reach the server. Check your internet and try again.",
    "Serverga ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring."),
  "no-class": t("No class with that code. Check it with your teacher.", "Bunday kodli guruh yo'q. Kodni o'qituvchingizdan so'rang."),
  "own-class": t("That’s a class you teach.", "Bu siz dars beradigan guruh."),
  full: t("That class is full.", "Bu guruh to'lgan."),
  "too-many-classes": t("That’s the most classes one person can have.", "Bir kishida bundan ortiq guruh bo'lishi mumkin emas."),
  name: t("Give the class a name.", "Guruhga nom bering."),
  "not-member": t("You’re not in this class any more.", "Siz endi bu guruhda emassiz."),
  "not-teacher": t("Only the teacher can do that.", "Buni faqat o'qituvchi qila oladi."),
  "not-yours": t("That file was sent to the bot by someone else.", "Bu faylni botga boshqa kishi yuborgan."),
  "no-file": t("That link has expired. Send the file to @usmleengo_bot again.",
    "Havolaning muddati tugagan. Faylni @usmleengo_bot ga qayta yuboring."),
  "telegram-file": t("Telegram didn’t hand the file over. Send it to the bot again.", "Telegram faylni bermadi. Uni botga qayta yuboring."),
});
const reasonOf = (err) => reasons()[err?.code] || t("Something went wrong. Try again.", "Nimadir xato ketdi. Qayta urinib ko'ring.");
const studentsText = (n) => t(`${n} student${n === 1 ? "" : "s"}`, `${n} ta talaba`);
const questionsText = (n) => t(`${n} question${n === 1 ? "" : "s"}`, `${n} ta savol`);

const pct = (n) => (n === null || n === undefined ? "—" : `${n}%`);
const signed = (n) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

/** Load something from the server, again whenever the app comes back to the front. */
function useServer(load, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const run = useCallback(() => {
    load().then((d) => { setData(d); setError(null); }).catch((e) => setError(e));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    run();
    const onVisible = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [run]);
  return { data, error, reload: run };
}

/**
 * A button that needs a second tap within four seconds. It turns red when
 * armed; `danger` has it red from the start, for what cannot be undone.
 */
function TwoTap({ label, confirm, onConfirm, danger = false }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      className={`btn ${armed || danger ? "btn-danger" : "btn-ghost"} class-two-tap`}
      onClick={() => {
        haptic(armed ? "warning" : "light");
        if (armed) { setArmed(false); onConfirm(); } else setArmed(true);
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}

// Where the tab was, kept while the app is open: a round started from a
// class returns to that class, not to the list of classes.
let lastRoute = { name: "home" };

export default function Classroom({ state, invite, botFile, onFocus, onStartClass }) {
  const [route, setRouteState] = useState(() =>
    botFile ? { name: "fromBot", token: botFile } : invite ? { name: "home" } : lastRoute);
  const setRoute = (r) => { lastRoute = r; setRouteState(r); };
  // Everything but the list of classes is a screen of its own, and wants the
  // whole of it.
  useEffect(() => {
    onFocus?.(route.name !== "home");
    return () => onFocus?.(false);
  }, [route.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!initData()) {
    return (
      <div className="screen">
        <ScreenHead title={t("Class", "Guruh")} sub={t("Learn with your teacher", "O'qituvchingiz bilan o'rganing")} />
        <div className="empty">
          <div className="empty-big">🏫</div>
          <div>{reasons().telegram}</div>
        </div>
      </div>
    );
  }

  const home = () => setRoute({ name: "home" });
  if (route.name === "create") {
    return <CreateClass onBack={home} onCreated={(id) => setRoute({ name: "class", id })} />;
  }
  const toClass = () => setRoute({ name: "class", id: route.id });
  if (route.name === "class") {
    return (
      <ClassView
        key={route.id}
        state={state}
        id={route.id}
        onBack={home}
        onStudent={(student) => setRoute({ name: "student", id: route.id, student })}
        onGo={(r) => setRoute({ ...r, id: route.id })}
        onStartClass={onStartClass}
      />
    );
  }
  if (route.name === "package") {
    return (
      <PackageEditor classId={route.id} packageId={route.packageId} incomingFile={route.file || null} onBack={toClass} onSaved={toClass} />
    );
  }
  if (route.name === "fromBot") {
    return (
      <FromBot
        state={state}
        token={route.token}
        onBack={home}
        onCreate={() => setRoute({ name: "create" })}
        onPick={(classId, file) => setRoute({ name: "package", id: classId, file })}
      />
    );
  }
  if (route.name === "assign") return <AssignScreen packages={route.packages} onBack={toClass} onDone={toClass} />;
  if (route.name === "results") return <AssignmentResults assignmentId={route.assignmentId} onBack={toClass} />;
  if (route.name === "student") {
    return (
      <StudentDetail
        classId={route.id}
        student={route.student}
        onBack={() => setRoute({ name: "class", id: route.id })}
      />
    );
  }
  return (
    <ClassHome
      state={state}
      invite={invite}
      onOpen={(id) => setRoute({ name: "class", id })}
      onCreate={() => setRoute({ name: "create" })}
    />
  );
}

/* ── a question file sent to the bot ─────────────────────────────────── */

/**
 * The bot's link lands here: the file is fetched from Telegram, and the
 * teacher picks which of their classes it is for. It then opens as a new
 * package, with the questions in the file shown before anything is kept.
 */
function FromBot({ state, token, onBack, onCreate, onPick }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const { data } = useServer(() => classCall("mine", {}, state), []);
  useEffect(() => {
    fetchBotFile(token).then(setFile).catch((err) => setError(reasonOf(err)));
  }, [token]);

  return (
    <div className="screen">
      <BackBar title={t("Add questions", "Savollar qo'shish")} onBack={onBack} />
      {error ? (
        <div className="game-warn">{error}</div>
      ) : !file ? (
        <div className="empty">{t("Fetching your file…", "Faylingiz olinmoqda…")}</div>
      ) : (
        <>
          <div className="class-note" style={{ marginTop: 0 }}>
            <b>{file.name}</b>
            {t(" — which class is it for? It becomes a new package there; you’ll see the questions in it before anything is kept.",
              " — qaysi guruh uchun? U o'sha guruhda yangi savollar to'plamiga aylanadi; hech narsa saqlanishidan oldin ichidagi savollarni ko'rasiz.")}
          </div>
          {data?.teaching.length ? (
            <div className="class-list" style={{ marginTop: 12 }}>
              {data.teaching.map((c) => (
                <button key={c.id} className="class-card" onClick={() => { haptic("medium"); onPick(c.id, file); }}>
                  <span className="class-card-main">
                    <span className="class-card-t">{c.name}</span>
                    <span className="class-card-n">{studentsText(c.students)}</span>
                  </span>
                  <span className="class-go">›</span>
                </button>
              ))}
            </div>
          ) : data ? (
            <>
              <div className="class-note">
                {t("You don’t teach a class yet. Create one, then send the file to the bot again.",
                  "Sizda hali guruh yo'q. Guruh yarating, so'ng faylni botga qayta yuboring.")}
              </div>
              <button className="btn btn-primary class-create" onClick={onCreate}>{t("Create a classroom", "Guruh yaratish")}</button>
            </>
          ) : (
            <div className="empty">{t("Loading your classes…", "Guruhlaringiz yuklanmoqda…")}</div>
          )}
        </>
      )}
    </div>
  );
}

/* ── the list of classes, and joining one ────────────────────────────── */

function ClassHome({ state, invite, onOpen, onCreate }) {
  const [code, setCode] = useState(invite || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const { data, error, reload } = useServer(() => classCall("mine", {}, state), []);

  // Sharing accuracy and weak topics follows membership: on while the player
  // belongs to (or has asked to join) any class, off once they have none.
  useEffect(() => {
    if (data) setClassSharing(data.learning.length > 0);
  }, [data]);

  async function join(e) {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code) || busy) return;
    haptic("medium");
    setBusy(true);
    setNote(null);
    try {
      const r = await classCall("join", { code }, state);
      setClassSharing(true);
      setNote({
        ok: true,
        text: r.status === "active"
          ? t(`You’re already in ${r.class.name}.`, `Siz allaqachon «${r.class.name}» guruhidasiz.`)
          : t(`Asked to join ${r.class.name}. You’re in as soon as ${r.class.teacher_name} lets you in.`,
            `«${r.class.name}» guruhiga qo'shilish so'rovi yuborildi. ${r.class.teacher_name} tasdiqlashi bilan guruhga qo'shilasiz.`),
      });
      setCode("");
      reload();
    } catch (err) {
      setNote({ ok: false, text: reasonOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <ScreenHead title={t("Class", "Guruh")} sub={t("Learn with your teacher", "O'qituvchingiz bilan o'rganing")} />

      <form className={`class-join${invite ? " invited" : ""}`} onSubmit={join}>
        <div className="section-label" style={{ marginTop: 0 }}>{invite ? t("You’re invited", "Sizni taklif qilishdi") : t("Join a class", "Guruhga qo'shilish")}</div>
        <div className="game-join">
          <input
            className="gap-input game-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={t("6-digit code", "6 xonali kod")}
            inputMode="numeric"
            autoComplete="off"
            aria-label={t("Class code", "Guruh kodi")}
          />
          <button className="btn btn-primary game-join-btn" disabled={!/^\d{6}$/.test(code) || busy}>{t("Join", "Qo'shilish")}</button>
        </div>
        <div className="class-note">
          {t("Your teacher will see your points, day streak, XP, accuracy, weak topics and average time — never your saved questions. You can leave any time.",
            "O'qituvchingiz ballaringiz, kunlik intizomingiz, XP, to'g'ri javoblar foizi, yaxshi o'zlashtirilmagan mavzularingiz va o'rtacha vaqtingizni ko'radi — saqlangan savollaringizni hech qachon ko'rmaydi. Istalgan vaqtda chiqib ketishingiz mumkin.")}
        </div>
        {note && <div className={note.ok ? "class-ok" : "game-warn"}>{note.text}</div>}
      </form>

      {error && !data && <div className="game-warn">{reasonOf(error)}</div>}

      {data?.learning.length > 0 && (
        <>
          <div className="section-label">{t("Your classes", "Guruhlaringiz")}</div>
          <div className="class-list">
            {data.learning.map((c) => (
              <button key={c.id} className="class-card" onClick={() => { haptic("light"); onOpen(c.id); }}>
                <span className="class-card-main">
                  <span className="class-card-t">{c.name}</span>
                  <span className="class-card-n">{c.teacher_name}</span>
                </span>
                {c.status === "pending"
                  ? <span className="class-pill">{t("Waiting", "Kutilmoqda")}</span>
                  : <span className="class-go">›</span>}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-label">{t("Classes you teach", "Siz dars beradigan guruhlar")}</div>
      {data?.teaching.length > 0 && (
        <div className="class-list">
          {data.teaching.map((c) => (
            <button key={c.id} className="class-card" onClick={() => { haptic("light"); onOpen(c.id); }}>
              <span className="class-card-main">
                <span className="class-card-t">{c.name}</span>
                <span className="class-card-n">
                  {studentsText(c.students)} · {t("code", "kod")} {c.code}
                </span>
              </span>
              {c.waiting > 0 ? <span className="class-pill on">{t(`${c.waiting} waiting`, `${c.waiting} ta kutmoqda`)}</span> : <span className="class-go">›</span>}
            </button>
          ))}
        </div>
      )}
      <button className="btn btn-ghost class-create" onClick={() => { haptic("light"); onCreate(); }}>
        {t("Create a classroom", "Guruh yaratish")}
      </button>
    </div>
  );
}

function CreateClass({ onBack, onCreated }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function create(e) {
    e?.preventDefault();
    if (!name.trim() || busy) return;
    haptic("medium");
    setBusy(true);
    setError(null);
    try {
      const r = await classCall("create", { name });
      onCreated(r.class.id);
    } catch (err) {
      setError(reasonOf(err));
      setBusy(false);
    }
  }

  return (
    <form className="screen" onSubmit={create}>
      <BackBar title={t("New classroom", "Yangi guruh")} onBack={onBack} />
      <label className="game-field">
        <span className="section-label">{t("Class name", "Guruh nomi")}</span>
        <input
          className="gap-input"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("Cardio group, Step 1 — spring…", "Kardiologiya guruhi, Step 1 — bahor…")}
          autoFocus
        />
      </label>
      <div className="class-note">
        {t("Students join with a code or an invite link, and you let each one in. You’ll see their points, day streak, XP, accuracy, weak topics and average time — all-time and since they joined.",
          "Talabalar kod yoki taklif havolasi orqali qo'shiladi, har birini siz tasdiqlaysiz. Ularning ballari, kunlik intizomi, XP, to'g'ri javoblar foizi, yaxshi o'zlashtirilmagan mavzulari va o'rtacha vaqtini ko'rasiz — barcha vaqt uchun va qo'shilgandan beri.")}
      </div>
      {error && <div className="game-warn">{error}</div>}
      <div className="home-cta">
        <button className="btn btn-primary" disabled={!name.trim() || busy}>{busy ? t("Creating…", "Yaratilmoqda…") : t("Create classroom", "Guruhni yaratish")}</button>
      </div>
    </form>
  );
}

/* ── one class ───────────────────────────────────────────────────────── */

function ClassView({ state, id, onBack, onStudent, onGo, onStartClass }) {
  const { data, error, reload } = useServer(() => classCall("view", { classId: id }, state), [id]);

  if (!data) {
    return (
      <div className="screen">
        <BackBar title={t("Class", "Guruh")} onBack={onBack} />
        <div className="empty">{error ? reasonOf(error) : t("Loading…", "Yuklanmoqda…")}</div>
      </div>
    );
  }
  if (data.role === "teacher") return <TeacherView data={data} onBack={onBack} onStudent={onStudent} reload={reload} onGo={onGo} />;
  return <StudentView data={data} onBack={onBack} onStartClass={onStartClass} />;
}

function Period({ value, onChange }) {
  return (
    <div className="period" role="tablist" aria-label={t("Period", "Davr")}>
      {[["all", t("All time", "Barcha vaqt")], ["since", t("Since joining", "Qo'shilgandan beri")]].map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          className={`period-opt${value === key ? " on" : ""}`}
          onClick={() => { if (value !== key) { haptic("light"); onChange(key); } }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TeacherView({ data, onBack, onStudent, reload, onGo }) {
  const [period, setPeriod] = useState("all");
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(data.class.name);
  const [error, setError] = useState(null);
  const cls = data.class;
  const link = `${APP_LINK}?startapp=${classInviteParam(cls.code)}`;

  async function act(action, body) {
    setError(null);
    try {
      await classCall(action, { classId: cls.id, ...body });
      return true;
    } catch (err) {
      setError(reasonOf(err));
      return false;
    }
  }

  return (
    <div className="screen rating">
      <BackBar title={cls.name} onBack={onBack} />

      <div className="game-code-card">
        <span className="perf-points-l">{t("Class code", "Guruh kodi")}</span>
        <span className="game-code">{cls.code.slice(0, 3)} {cls.code.slice(3)}</span>
        <span className="game-code-about">
          {t(`${data.students.length} of ${data.limits.students} students`, `${data.students.length} / ${data.limits.students} talaba`)}
        </span>
        <button
          className="btn btn-primary game-share"
          onClick={() => { haptic("medium"); share(classInviteMessage({ name: cls.name, code: cls.code, link })); }}
        >
          {t("Share invite", "Taklifni ulashish")}
        </button>
      </div>

      {error && <div className="game-warn" style={{ marginTop: 12 }}>{error}</div>}

      {data.requests.length > 0 && (
        <>
          <div className="section-label">{t("Waiting to join", "Qo'shilishni kutmoqda")} · {data.requests.length}</div>
          <div className="board">
            {data.requests.map((r) => (
              <div key={r.player} className="board-row">
                <span className="board-who">
                  <span className="board-name">{r.name}</span>
                  {r.username && <span className="board-user">@{r.username}</span>}
                </span>
                <span className="req-actions">
                  <button className="set-btn" onClick={async () => { haptic("light"); if (await act("approve", { player: r.player, accept: false })) reload(); }}>
                    {t("Decline", "Rad etish")}
                  </button>
                  <button className="set-btn yes" onClick={async () => { haptic("success"); if (await act("approve", { player: r.player, accept: true })) reload(); }}>
                    {t("Let in", "Qabul qilish")}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>{t("Students", "Talabalar")}</span>
        <span className="game-count">{t("By points", "Ball bo'yicha")}</span>
      </div>
      <Period value={period} onChange={setPeriod} />
      {data.students.length ? (
        <div className="board">
          {data.students.map((s, i) => {
            const n = period === "since" ? s.since : s.all;
            return (
              <button key={s.player} className="board-row student-row" onClick={() => { haptic("light"); onStudent(s); }}>
                <span className="board-place"><PlaceMark place={i + 1} /></span>
                <span className="board-who">
                  <span className="board-name">{s.name}</span>
                  <span className="board-user">
                    {n
                      ? period === "since"
                        ? t(`+${n.xp.toLocaleString()} XP · ${n.answered} answered · ${pct(n.accuracy)} · ${formatPace(n.pace)}`,
                          `+${n.xp.toLocaleString()} XP · ${n.answered} ta javob · ${pct(n.accuracy)} · ${formatPace(n.pace)}`)
                        : `🔥 ${n.streak} · ${n.xp.toLocaleString()} XP · ${pct(n.accuracy)} · ${formatPace(n.pace)}`
                      : t("Joined before this was kept", "Bu ma'lumot saqlanishidan oldin qo'shilgan")}
                  </span>
                </span>
                <span className="board-value">{n ? (period === "since" ? signed(n.points) : n.points) : "—"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="board">
          <div className="board-empty">
            {t("No students yet. Share the invite, then let them in here.", "Hali talabalar yo'q. Taklifni ulashing, keyin ularni shu yerda qabul qiling.")}
          </div>
        </div>
      )}

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>{t("Question packages", "Savollar to'plamlari")}</span>
        <span className="game-count">{data.packages.length}</span>
      </div>
      {data.packages.length ? (
        <div className="class-list">
          {data.packages.map((p) => (
            <button key={p.id} className="class-card" onClick={() => { haptic("light"); onGo({ name: "package", packageId: p.id }); }}>
              <span className="class-card-main">
                <span className="class-card-t">{p.name}</span>
                <span className="class-card-n">{questionsText(p.count)}</span>
              </span>
              <span className="class-go">›</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="class-note">
          {t("Your own sets of questions: write them, or pick them from usmleengo’s bank. Only this class sees them.",
            "O'zingizning savollar to'plamlaringiz: ularni yozing yoki usmleengo bazasidan tanlang. Ularni faqat shu guruh ko'radi.")}
        </div>
      )}
      <button className="btn btn-ghost class-create" onClick={() => { haptic("light"); onGo({ name: "package" }); }}>{t("New package", "Yangi to'plam")}</button>

      <div className="section-label">{t("Homework", "Uy vazifasi")}</div>
      {data.assignments.length ? (
        <div className="class-list">
          {data.assignments.map((a) => (
            <button key={a.id} className="class-card" onClick={() => { haptic("light"); onGo({ name: "results", assignmentId: a.id }); }}>
              <span className="class-card-main">
                <span className="class-card-t">{a.title}</span>
                <span className="class-card-n">
                  {t(`Due ${dayText(a.dueAt)} · ${a.done} of ${data.students.length} handed in`,
                    `Muddati: ${dayText(a.dueAt)} · ${data.students.length} tadan ${a.done} tasi topshirdi`)}
                </span>
              </span>
              <span className="class-go">›</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="class-note">
          {t("Set a package as homework with a due date, and see each student’s score and each question’s.",
            "To'plamni muddat bilan uy vazifasi qilib bering va har bir talaba hamda har bir savol natijasini ko'ring.")}
        </div>
      )}
      <button
        className="btn btn-ghost class-create"
        disabled={!data.packages.length}
        onClick={() => { haptic("light"); onGo({ name: "assign", packages: data.packages }); }}
      >
        {t("Set homework", "Uy vazifasi berish")}
      </button>

      <div className="section-label">{t("This class", "Ushbu guruh")}</div>
      {renaming ? (
        <form
          className="game-join"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            if (await act("rename", { name: newName })) { setRenaming(false); reload(); }
          }}
        >
          <input className="gap-input" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <button className="btn btn-primary game-join-btn" disabled={!newName.trim()}>{t("Save", "Saqlash")}</button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => { haptic("light"); setRenaming(true); }}>{t("Rename", "Nomini o'zgartirish")}</button>
      )}
      <TwoTap
        danger
        label={t("Close this class", "Guruhni yopish")}
        confirm={t("Tap again: close it for everyone", "Yana bosing: guruh hamma uchun yopiladi")}
        onConfirm={async () => { if (await act("close")) onBack(); }}
      />
    </div>
  );
}

function StudentDetail({ classId, student, onBack }) {
  const [period, setPeriod] = useState("all");
  const [error, setError] = useState(null);
  const n = period === "since" ? student.since : student.all;

  const tiles = n ? [
    {
      label: period === "since" ? t("Points gained", "Qo'shilgan ball") : t("Points", "Ball"),
      value: period === "since" ? signed(n.points) : n.points,
      sub: period === "all" ? t(`Rank #${n.rank}`, `O'rin #${n.rank}`) : t("since joining", "qo'shilgandan beri"),
    },
    { label: t("Day streak", "Kunlik intizom"), value: n.streak, sub: t(n.streak === 1 ? "day" : "days", "kun") },
    { label: "XP", value: n.xp.toLocaleString(), sub: t(`${n.answered.toLocaleString()} answered`, `${n.answered.toLocaleString()} ta javob`) },
    { label: t("Accuracy", "To'g'ri javoblar"), value: pct(n.accuracy), sub: t("right answers", "barcha javoblardan") },
    { label: t("Average time", "O'rtacha vaqt"), value: formatPace(n.pace), sub: t("per right answer", "har bir to'g'ri javobga") },
  ] : [];

  return (
    <div className="screen rating">
      <BackBar title={student.name} onBack={onBack} />
      {student.username && <div className="sub class-user">@{student.username}</div>}
      <Period value={period} onChange={setPeriod} />

      {n ? (
        <>
          <div className="class-tiles">
            {tiles.map((tile) => (
              <div key={tile.label} className="class-tile">
                <span className="perf-label">{tile.label}</span>
                <span className="class-tile-v">{tile.value}</span>
                <span className="perf-detail">{tile.sub}</span>
              </div>
            ))}
          </div>

          <div className="section-label">{t("Weak topics", "Yaxshi o'zlashtirilmagan mavzular")}</div>
          {n.weak.length ? (
            <div className="weak-list">
              {n.weak.map((w) => (
                <div key={w.tag} className="weak-row">
                  <span className="weak-name">
                    {tagLabel(w.tag)}
                    <small>{t(`${w.answered} answered`, `${w.answered} ta javob`)}</small>
                  </span>
                  <span className="weak-bar">
                    <span className={`weak-fill${w.pct < 60 ? " low" : w.pct < 80 ? " mid" : ""}`} style={{ width: `${w.pct}%` }} />
                  </span>
                  <span className={`weak-pct${w.pct < 60 ? " low" : w.pct < 80 ? " mid" : ""}`}>{w.pct}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="class-note">
              {t("Not enough answers in any category yet — five are needed to judge one.",
                "Hali hech bir fan bo'yicha javoblar yetarli emas — baholash uchun kamida beshta kerak.")}
            </div>
          )}
        </>
      ) : (
        <div className="empty">{t("Nothing to show since joining yet.", "Qo'shilgandan beri hali ko'rsatadigan narsa yo'q.")}</div>
      )}

      {error && <div className="game-warn" style={{ marginTop: 12 }}>{error}</div>}
      <div className="home-cta">
        <TwoTap
          label={t("Remove from class", "Guruhdan chiqarish")}
          confirm={t(`Tap again to remove ${student.name}`, `Yana bosing: ${student.name} guruhdan chiqariladi`)}
          onConfirm={async () => {
            try { await classCall("remove", { classId, player: student.player }); onBack(); }
            catch (err) { setError(reasonOf(err)); }
          }}
        />
      </div>
    </div>
  );
}

function StudentView({ data, onBack, onStartClass }) {
  const [error, setError] = useState(null);
  const [opening, setOpening] = useState(null);
  const cls = data.class;

  /** Fetch a package and play it: as homework the first time, as practice after. */
  async function play(packageId, title, assignmentId) {
    if (opening) return;
    haptic("medium");
    setOpening(packageId);
    setError(null);
    try {
      const r = await classCall("package", { packageId });
      onStartClass({ questions: r.package.questions, label: title, assignmentId });
    } catch (err) {
      setError(reasonOf(err));
    } finally {
      setOpening(null);
    }
  }

  async function leave() {
    try {
      await classCall("remove", { classId: cls.id });
      onBack();
    } catch (err) {
      setError(reasonOf(err));
    }
  }

  if (data.status === "pending") {
    return (
      <div className="screen">
        <BackBar title={cls.name} onBack={onBack} />
        <div className="empty">
          <div className="empty-big">⏳</div>
          <div>{t(`Waiting for ${cls.teacherName} to let you in.`, `${cls.teacherName} sizni qabul qilishini kutyapmiz.`)}</div>
        </div>
        {error && <div className="game-warn">{error}</div>}
        <div className="home-cta">
          <TwoTap label={t("Cancel my request", "So'rovimni bekor qilish")} confirm={t("Tap again to cancel", "Bekor qilish uchun yana bosing")} onConfirm={leave} />
        </div>
      </div>
    );
  }

  const top = data.ranking.top;
  const me = data.ranking.me;
  const meBelow = me && me.place > 10 ? { place: me.place, points: me.points } : null;
  return (
    <div className="screen rating">
      <BackBar title={cls.name} onBack={onBack} />
      <div className="sub class-user">
        {t("Teacher:", "O'qituvchi:")} {cls.teacherName}{cls.teacherUsername ? ` · @${cls.teacherUsername}` : ""} · {studentsText(data.students)}
      </div>

      {me && (
        <div className="rating-place">
          <span className="rating-rank">{t("Your place in class", "Guruhdagi o'rningiz")} <b>#{me.place} / {me.total}</b></span>
          <b>{me.points} <small>{t("pts", "ball")}</small></b>
        </div>
      )}

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>{t("Class ranking · by points", "Guruh reytingi · ball bo'yicha")}</span>
      </div>
      <div className="board">
        <div className="board-head">
          <span className="board-place">{t("Rank", "O'rin")}</span>
          <span className="board-who">{t("Name", "Ism")}</span>
          <span className="board-value">{t("Points", "Ball")}</span>
        </div>
        {top.map((r) => (
          <div key={`${r.place}-${r.name}`} className={`board-row${r.isMe ? " me" : ""}${r.place <= 3 ? ` p${r.place}` : ""}`}>
            <span className="board-place"><PlaceMark place={r.place} /></span>
            <span className="board-who">
              <span className="board-name">{r.isMe ? t("You", "Siz") : r.name}</span>
              {!r.isMe && r.username && <span className="board-user">@{r.username}</span>}
            </span>
            <span className="board-value">{r.points}</span>
          </div>
        ))}
        {meBelow && (
          <>
            <div className="board-gap" aria-hidden="true">⋯</div>
            <div className="board-row me">
              <span className="board-place">{meBelow.place}</span>
              <span className="board-who"><span className="board-name">{t("You", "Siz")}</span></span>
              <span className="board-value">{meBelow.points}</span>
            </div>
          </>
        )}
      </div>

      <div className="section-label">{t("Homework", "Uy vazifasi")}</div>
      {data.assignments.length ? (
        <div className="class-list">
          {data.assignments.map((a) => {
            const overdue = !a.mine && a.dueAt < Date.now();
            return (
              <button key={a.id} className="class-card" onClick={() => play(a.packageId, a.title, a.mine ? null : a.id)}>
                <span className="class-card-main">
                  <span className="class-card-t">{a.title}</span>
                  <span className="class-card-n">
                    {a.mine
                      ? t(`Handed in · ${a.mine.score}/${a.mine.total}${a.mine.late ? " · late" : ""}`,
                        `Topshirildi · ${a.mine.score}/${a.mine.total}${a.mine.late ? " · kechikib" : ""}`)
                      : t(`Due ${dayText(a.dueAt)}${overdue ? " · overdue" : ""}`,
                        `Muddati: ${dayText(a.dueAt)}${overdue ? " · muddati o'tgan" : ""}`)}
                  </span>
                </span>
                <span className={`class-pill${a.mine ? "" : " on"}`}>{a.mine ? t("Practise", "Mashq") : t("Start", "Boshlash")}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="class-note">{t("No homework yet.", "Hali uy vazifasi yo'q.")}</div>
      )}

      {data.packages.length > 0 && (
        <>
          <div className="section-label">{t("Practice", "Mashq")}</div>
          <div className="class-list">
            {data.packages.map((p) => (
              <button key={p.id} className="class-card" onClick={() => play(p.id, p.name, null)}>
                <span className="class-card-main">
                  <span className="class-card-t">{p.name}</span>
                  <span className="class-card-n">{questionsText(p.count)} · {t("not counted anywhere", "hech qayerda hisoblanmaydi")}</span>
                </span>
                <span className="class-go">{opening === p.id ? "…" : "›"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {error && <div className="game-warn" style={{ marginTop: 12 }}>{error}</div>}
      <div className="home-cta">
        <TwoTap label={t("Leave this class", "Guruhdan chiqish")} confirm={t("Tap again to leave", "Chiqish uchun yana bosing")} onConfirm={leave} />
      </div>
    </div>
  );
}

