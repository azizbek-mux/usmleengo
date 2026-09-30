// The words of the guide, in both languages, and which part of which screen
// each note points at. A page is one of:
//   A  one big phone, its notes in the two columns beside it, with arrows
//   B  two phones, a numbered badge and an arrow at each spot, notes below
//   steps / facts / closing: pages with no screenshot
// `m` names a mark recorded by cap.mjs (the on-screen position of that part).
const L = (en, uz) => ({ en, uz });

export const BOT = "@usmleengo_bot";

export const pages = [
  { kind: "cover" },

  // 1 ── open the app
  {
    kind: "steps",
    section: L("Start here", "Boshlash"),
    title: L("Start in thirty seconds", "O'ttiz soniyada boshlang"),
    intro: L(
      "usmleengo is a Telegram Mini App: there is nothing to install, and your progress is saved in your Telegram account.",
      "usmleengo — Telegram Mini App: hech narsa o'rnatish shart emas, natijalaringiz Telegram akkauntingizda saqlanadi.",
    ),
    steps: [
      [L("Find the bot", "Botni toping"), L("In Telegram, search for @usmleengo_bot and open the chat.", "Telegramda @usmleengo_bot ni qidiring va chatni oching.")],
      [L("Tap Start", "Start ni bosing"), L("The bot says hello and puts an Open usmleengo button under its message.", "Bot sizni kutib oladi va xabari ostida «usmleengoni ochish» tugmasini chiqaradi.")],
      [L("Open the app", "Ilovani oching"), L("Tap Open usmleengo, or the usmleengo menu button beside the message box. The app opens inside Telegram.", "«usmleengoni ochish» yoki xabar yozish maydoni yonidagi «usmleengo» menyu tugmasini bosing. Ilova Telegram ichida ochiladi.")],
      [L("Choose your language", "Tilni tanlang"), L("Me → Language switches the whole app, and every question, between English and Uzbek.", "Profil → Til: butun ilova va barcha savollar ingliz yoki o'zbek tiliga o'tadi.")],
    ],
    facts: [
      L("Works on your phone and in Telegram Desktop.", "Telefonda ham, Telegram Desktopda ham ishlaydi."),
      L("Your progress follows your Telegram account from one device to another.", "Natijalaringiz Telegram akkauntingiz bilan bir qurilmadan boshqasiga o'tadi."),
      L("Two Telegram accounts on one phone keep separate progress.", "Bir telefondagi ikkita Telegram akkaunti alohida hisoblanadi."),
    ],
    chat: {
      welcome: L(
        "usmleengo 🩺\n6,600+ USMLE quizzes, Medical English flashcards, live games with friends, and classrooms.",
        "usmleengo 🩺\n6 600+ USMLE savoli, Tibbiy ingliz tili kartochkalari, do'stlar bilan jonli o'yinlar va guruhlar.",
      ),
      open: L("Open usmleengo", "usmleengoni ochish"),
      menu: L("usmleengo", "usmleengo"),
      draw: L("Illustration of the Telegram chat", "Telegram chatining tasviri"),
    },
  },

  // 2 ── the six tabs
  {
    kind: "A", shot: "home", width: 320,
    section: L("The app at a glance", "Ilova bir qarashda"),
    title: L("Six tabs, one app", "Oltita bo'lim, bitta ilova"),
    intro: L(
      "The bar at the bottom is always there. Tap a tab to switch; what you were doing is kept.",
      "Pastdagi panel doim ko'rinib turadi. Bo'limni almashtirish uchun ustiga bosing — nima qilayotganingiz saqlanadi.",
    ),
    notes: [
      { m: "streak", side: "R", t: L("Day streak", "Kunlik intizom"), d: L("Grows by one for every day you answer at least one question.", "Har kuni kamida bitta savolga javob bersangiz, bir kunga oshadi.") },
      { m: "tab2", entry: "top", side: "L", y: 470, t: L("Play", "O'yin"), d: L("Live games: race friends on the same questions.", "Jonli o'yinlar: do'stlar bilan bir xil savollarda bellashing.") },
      { m: "tab1", entry: "top", side: "L", y: 550, t: L("English", "Ingliz tili"), d: L("Medical English: 8,000 clinical terms as flashcards.", "Tibbiy ingliz tili: 8 000 ta klinik atama kartochkalarda.") },
      { m: "tab0", entry: "top", side: "L", y: 630, t: L("Quiz", "Testlar"), d: L("6,600+ USMLE questions. Study by system or subject.", "6 600+ USMLE savoli. Tizim yoki fan bo'yicha o'rganing.") },
      { m: "tab3", entry: "top", side: "R", y: 470, t: L("Class", "Guruh"), d: L("Join your teacher's class, or run one of your own.", "O'qituvchingiz guruhiga qo'shiling yoki o'zingiz guruh yarating.") },
      { m: "tab4", entry: "top", side: "R", y: 550, t: L("Rating", "Reyting"), d: L("Everyone who plays, ranked by points.", "Barcha o'yinchilar ball bo'yicha.") },
      { m: "tab5", entry: "top", side: "R", y: 630, t: L("Me", "Profil"), d: L("Your points, numbers, language and help.", "Ballaringiz, ko'rsatkichlar, til va yordam.") },
    ],
    tip: L(
      "The Quiz tab is where you start: tap Random and you are answering in two seconds.",
      "Boshlash uchun Testlar bo'limi: «Tasodifiy» ni bosing — ikki soniyadan so'ng savolga javob berasiz.",
    ),
  },

  // 3 ── the quiz home
  {
    kind: "A", shot: "home", width: 336,
    section: L("Quiz", "Testlar"),
    title: L("The Quiz tab", "Testlar bo'limi"),
    intro: L(
      "Everything you need to choose what to study is on one screen. With nothing chosen, Random mixes the whole bank.",
      "O'rganadigan narsani tanlash uchun hamma narsa bitta ekranda. Hech narsa tanlanmasa, «Tasodifiy» butun bazadan aralashtiradi.",
    ),
    notes: [
      { m: "search", side: "L", t: L("Search", "Qidiruv"), d: L("Type any topic — addison, niacin, murmur — and quiz on it. Works in English and Uzbek.", "Istalgan mavzuni yozing — addison, niatsin, shovqin — va shu bo'yicha test yeching. Ingliz va o'zbek tilida ishlaydi.") },
      { m: "streak", side: "R", t: L("Day streak", "Kunlik intizom"), d: L("Study a little every day to keep it.", "Saqlab qolish uchun har kuni ozgina o'rganing.") },
      { m: "flask", side: "R", t: L("NBME lab values", "NBME me'yorlari"), d: L("The reference table, one tap away.", "Laboratoriya me'yorlari jadvali — bir bosishda.") },
      { m: "review", side: "R", t: L("Review", "Takrorlash"), d: L("Mistakes: questions you last got wrong. Saved: the ones you bookmarked. Weak topics: where you are weakest.", "Xatolar: oxirgi javobingiz noto'g'ri bo'lgan savollar. Saqlangan: belgilab qo'ygan savollaringiz. Zaif mavzular: eng zaif joylaringiz.") },
      { m: "rows", above: "count", side: "L", t: L("Systems and subjects", "Tizimlar va fanlar"), d: L("Tick what you want. Nothing ticked means everything.", "Kerakligini belgilang. Hech narsa belgilanmasa — hammasi.") },
      { m: "count", side: "L", t: L("How many", "Nechta savol"), d: L("Questions in one round.", "Bir raunddagi savollar soni.") },
      { m: "type", side: "R", t: L("What kind", "Qanday turda"), d: L("Two-option, typed, or a mix.", "Test, yozma yoki aralash.") },
      { m: "start", side: "R", t: L("Random / Start", "Tasodifiy / Boshlash"), d: L("Begins the round.", "Raundni boshlaydi.") },
    ],
  },

  // 4 ── narrowing it down
  {
    kind: "B",
    section: L("Quiz", "Testlar"),
    title: L("Narrow it down", "Mavzuni toraytiring"),
    intro: L(
      "Two lists organise the whole bank: 26 systems (the organ a question is about) and 13 subjects (the discipline). They work together.",
      "Butun baza ikkita ro'yxat bo'yicha tartiblangan: 26 tizim (savol qaysi a'zo haqida) va 13 fan. Ular birga ishlaydi.",
    ),
    phones: [
      { shot: "select", cap: L("Tick a system", "Tizimni belgilang"), items: [
        { m: "row", side: "L", t: L("Tick", "Belgilash"), d: L("Tap a row to choose it, tap again to untick. The number is how many questions it holds.", "Tanlash uchun qatorga bosing, bekor qilish uchun yana bosing. Raqam — undagi savollar soni.") },
        { m: "clear", side: "R", t: L("Clear", "Tozalash"), d: L("Shows Clear when something is ticked, Select all when nothing is.", "Biror narsa belgilangan bo'lsa «Tozalash», bo'lmasa «Hammasini tanlash» turadi.") },
        { m: "start", side: "L", t: L("Start", "Boshlash"), d: L("Says Start once you chose something, and how many questions it covers.", "Nimadir tanlasangiz «Boshlash» deb yozadi va nechta savol borligini ko'rsatadi.") },
      ] },
      { shot: "home-lower", cap: L("Then a subject", "So'ng fan"), items: [
        { m: "rows", above: "count", side: "R", t: L("Subjects", "Fanlar"), d: L("The second list. Cardiovascular + Pharmacology gives heart drugs and nothing else.", "Ikkinchi ro'yxat. Yurak-qon tomir + Farmakologiya faqat yurak dorilarini beradi.") },
        { m: "count", side: "L", t: L("Round size", "Raund hajmi"), d: L("How many questions in one round.", "Bir raundda nechta savol.") },
        { m: "type", side: "R", t: L("Question kind", "Savol turi"), d: L("What to be asked: taps, typing, or both.", "Nima so'raladi: test, yozma yoki ikkalasi.") },
      ] },
    ],
    tip: L(
      "Not sure where to start? Tap Weak topics: it lists the systems where your answers are weakest.",
      "Nimadan boshlashni bilmayapsizmi? «Zaif mavzular» ni bosing: javoblaringiz eng zaif bo'lgan tizimlar shu yerda.",
    ),
  },

  // 5 ── how many, what kind
  {
    kind: "B",
    section: L("Quiz", "Testlar"),
    title: L("How many, and what kind", "Nechta va qanday turda"),
    intro: L(
      "Two small buttons beside Start open these choices. The app remembers them for next time.",
      "Boshlash tugmasi ustidagi ikkita kichik tugma shu tanlovlarni ochadi. Ilova ularni keyingi safar uchun eslab qoladi.",
    ),
    phones: [
      { shot: "count-sheet", cap: L("Questions per round", "Raunddagi savollar"), items: [
        { m: "sheet", side: "L", t: L("2 to 100", "2 dan 100 gacha"), d: L("Pick a size: 2, 5, 10, 20, 50 or 100. Short rounds fit a queue; long ones fit an evening.", "Hajmni tanlang: 2, 5, 10, 20, 50 yoki 100. Qisqa raund navbatda kutish uchun, uzun raund kechqurun uchun.") },
      ] },
      { shot: "type-sheet", cap: L("Question type", "Savol turi"), items: [
        { m: "sheet", side: "R", t: L("Three kinds", "Uch xil tur"), d: L("Mix of both; Multiple choice only (two options, one tap); Fill the gap only (you type the answer).", "Aralash; Faqat test (ikki variant, bitta bosish); Faqat yozma (javobni o'zingiz yozasiz).") },
      ] },
    ],
    tip: L(
      "Typed answers are harder, so a right one earns 1.5 times the points of a tapped one.",
      "Yozma javoblar qiyinroq, shuning uchun to'g'risi test javobiga qaraganda 1,5 baravar ko'p ball beradi.",
    ),
  },

  // 6 ── answering
  {
    kind: "A", shot: "quiz-question", width: 336,
    section: L("Quiz", "Testlar"),
    title: L("Answering a question", "Savolga javob berish"),
    intro: L(
      "A two-option question: read it, tap an answer. You are graded the moment you tap — there is no separate Submit.",
      "Ikki variantli savol: o'qing, javobni bosing. Bosgan zahotingiz baholanasiz — alohida «Yuborish» yo'q.",
    ),
    notes: [
      { m: "close", side: "L", t: L("Leave", "Chiqish"), d: L("Stops the round. The answers you gave are kept.", "Raundni to'xtatadi. Bergan javoblaringiz saqlanadi.") },
      { m: "bar", side: "L", t: L("Progress", "Jarayon"), d: L("Fills as you work through the round.", "Raund davomida to'lib boradi.") },
      { m: "flask", side: "R", t: L("Lab values", "Me'yorlar"), d: L("Opens the NBME table over the question.", "Savol ustida NBME jadvalini ochadi.") },
      { m: "bookmark", side: "R", t: L("Save", "Saqlash"), d: L("Bookmarks the question; find it later under Saved.", "Savolni belgilab qo'yadi; keyin «Saqlangan» dan topasiz.") },
      { m: "question", side: "L", t: L("The question", "Savol"), d: L("Some questions hide their topic label until you answer, so it never gives the answer away.", "Ba'zi savollarda mavzu nomi javob bermaguningizcha yashirin turadi — u javobni oshkor qilmaydi.") },
      { m: ["optA", "optB"], side: "R", t: L("Two options", "Ikki variant"), d: L("Tap the one you think is right. The faster you are right, the more points you earn.", "To'g'ri deb o'ylagan variantni bosing. Qanchalik tez to'g'ri javob bersangiz, shuncha ko'p ball olasiz.") },
    ],
    tip: L(
      "The clock runs from the moment the question appears until you tap. Reading the explanation afterwards is not timed.",
      "Soat savol chiqqanda boshlanib, siz bosganda to'xtaydi. Keyin izohni o'qish vaqtga kirmaydi.",
    ),
  },

  // 7 ── feedback
  {
    kind: "B",
    section: L("Quiz", "Testlar"),
    title: L("Right or wrong, you learn", "To'g'ri yoki noto'g'ri — baribir o'rganasiz"),
    intro: L(
      "After every answer the app shows what was right and why. Take a moment: the explanation is the point.",
      "Har bir javobdan keyin ilova nima to'g'ri va nima uchun ekanini ko'rsatadi. Bir daqiqa ajrating: asosiy foyda — izohda.",
    ),
    phones: [
      { shot: "quiz-right", cap: L("A right answer", "To'g'ri javob"), items: [
        { m: "topic", side: "L", t: L("Topic", "Mavzu"), d: L("What the question was about.", "Savol nima haqida edi.") },
        { m: "feedback", side: "L", t: L("Correct", "To'g'ri"), d: L("A one-line reason it is right.", "Nima uchun to'g'riligining bir qatorli izohi.") },
        { m: "cont", side: "R", t: L("Continue", "Davom etish"), d: L("Next question.", "Keyingi savol.") },
      ] },
      { shot: "quiz-wrong", cap: L("A wrong answer", "Noto'g'ri javob"), items: [
        { m: "mine", side: "R", t: L("Your pick", "Sizning javobingiz"), d: L("Turns red.", "Qizil bo'ladi.") },
        { m: "correct", side: "L", t: L("The answer", "To'g'ri javob"), d: L("Turns green.", "Yashil bo'ladi.") },
        { m: "report", side: "R", t: L("Something wrong?", "Xato bormi?"), d: L("Tap it to message the developer about this question, with its id filled in.", "Shu savol haqida dasturchiga yozish uchun bosing — savol raqami o'zi qo'shiladi.") },
      ] },
    ],
    tip: L(
      "A wrong answer goes to Mistakes and waits there until you answer it right.",
      "Noto'g'ri javob «Xatolar» ga tushadi va to'g'ri javob bermaguningizcha shu yerda turadi.",
    ),
  },

  // 8 ── typed and pictures
  {
    kind: "B",
    section: L("Quiz", "Testlar"),
    title: L("Typed and picture questions", "Yozma va rasmli savollar"),
    intro: L(
      "Two more kinds of question: fill the gap yourself, and identify what is in a picture.",
      "Yana ikki xil savol: bo'sh joyni o'zingiz to'ldirasiz va rasmda nima borligini topasiz.",
    ),
    phones: [
      { shot: "typed-filled", cap: L("Fill the gap", "Bo'sh joyni to'ldiring"), items: [
        { m: "blank", side: "L", t: L("The gap", "Bo'sh joy"), d: L("The missing word or term.", "Tushib qolgan so'z yoki atama.") },
        { m: "input", side: "L", t: L("Type it", "Yozing"), d: L("Small typos are forgiven in longer words; short answers like B3 must match exactly.", "Uzun so'zlardagi kichik xatolar kechiriladi; «B3» kabi qisqa javoblar aynan mos kelishi kerak.") },
        { m: "check", side: "R", t: L("Check", "Tekshirish"), d: L("Grades your answer. A wrong typed answer costs no points.", "Javobingizni baholaydi. Noto'g'ri yozma javob ball ayirmaydi.") },
      ] },
      { shot: "picture-question", cap: L("Name the picture", "Rasmni aniqlang"), items: [
        { m: "image", side: "L", t: L("The picture", "Rasm"), d: L("Skin, smears, slides and more: 377 picture questions.", "Teri, surtmalar, preparatlar va boshqalar: 377 ta rasmli savol.") },
        { m: "hint", side: "R", t: L("Zoom", "Kattalashtirish"), d: L("Tap the picture to enlarge it.", "Kattalashtirish uchun rasmga bosing.") },
        { m: "bookmark", side: "R", t: L("Saved", "Saqlangan"), d: L("Filled in: this one is bookmarked.", "To'ldirilgan: bu savol saqlab qo'yilgan.") },
      ] },
    ],
  },

  // 9 ── result
  {
    kind: "A", shot: "result", width: 336,
    section: L("Quiz", "Testlar"),
    title: L("Your result", "Natijangiz"),
    intro: L(
      "At the end of a round you see how it went, what it earned, and what to look at again.",
      "Raund oxirida qanday o'tgani, nima yutganingiz va nimani qayta ko'rish kerakligini ko'rasiz.",
    ),
    notes: [
      { m: "ring", side: "L", t: L("Accuracy", "Aniqlik"), d: L("The share of this round you got right.", "Shu raundda to'g'ri javoblaringiz ulushi.") },
      { m: "points", side: "L", t: L("Points", "Ball"), d: L("What the round earned. A wrong answer costs 8, so the total can be lower than it looks.", "Raund keltirgan ball. Noto'g'ri javob 8 ball ayiradi, shuning uchun yig'indi kutilganidan kam bo'lishi mumkin.") },
      { m: "score", side: "R", t: L("Score", "Natija"), d: L("Right answers out of the total.", "To'g'ri javoblar umumiy sondan.") },
      { m: "streak", side: "R", t: L("Streak", "Intizom"), d: L("Your day streak.", "Kunlik intizomingiz.") },
      { m: "missed", side: "L", t: L("What you missed", "Xato qilganlaringiz"), d: L("The right answers. The flag saves one for later; they also wait in Mistakes.", "To'g'ri javoblar. Belgi savolni keyinga saqlaydi; ular «Xatolar» da ham turadi.") },
      { m: "again", side: "R", t: L("Another round", "Yana bir marta"), d: L("Same setup, new questions.", "Xuddi shu sozlama, yangi savollar.") },
      { m: "share", side: "R", t: L("Share score", "Natijani ulashish"), d: L("Send your result to a friend or a group.", "Natijani do'stingizga yoki guruhga yuboring.") },
    ],
  },

  // 10 ── weak topics
  {
    kind: "A", shot: "weak", width: 336,
    section: L("Quiz", "Testlar"),
    title: L("Weak topics", "Zaif mavzular"),
    intro: L(
      "See where you are weakest and go straight there. Mistakes and Saved sit beside it on the Quiz tab.",
      "Qayerda zaifligingizni ko'ring va to'g'ri o'sha yerga boring. «Xatolar» va «Saqlangan» Testlar bo'limida uning yonida turadi.",
    ),
    notes: [
      { m: "back", side: "L", t: L("Back", "Orqaga"), d: L("Returns to the Quiz tab.", "Testlar bo'limiga qaytaradi.") },
      { m: "period", side: "R", t: L("Systems or subjects", "Tizimlar yoki fanlar"), d: L("Look at your progress by organ system, or by discipline.", "Progressni a'zolar tizimi yoki fan bo'yicha ko'ring.") },
      { m: "row", side: "L", t: L("One row", "Bitta qator"), d: L("The name, the % you got right, and how many you have seen and answered. Tap it to practise it.", "Nomi, to'g'ri javoblar foizi, nechta ko'rgan va javob berganingiz. Mashq qilish uchun bosing.") },
      { m: "list", side: "R", t: L("Weakest first", "Eng zaifi birinchi"), d: L("Red is under 60%, amber 60–79%, green 80% or more. A row is judged after five answers.", "Qizil — 60% dan past, sariq — 60–79%, yashil — 80% va undan yuqori. Qator beshta javobdan keyin baholanadi.") },
    ],
    tip: L(
      "A topic with few answers is not judged yet: answer five and it gets a colour.",
      "Javoblari kam mavzu hali baholanmaydi: beshta javob bering — u rangga kiradi.",
    ),
  },

  // 11 ── lab values
  {
    kind: "A", shot: "labs", width: 336,
    section: L("Quiz", "Testlar"),
    title: L("NBME lab values", "NBME laboratoriya me'yorlari"),
    intro: L(
      "The NBME's own Laboratory Values page, in the app: 114 tests, in the NBME's order. Open it from the flask beside the search, or from the top of any question.",
      "NBME ning o'zining Laboratory Values sahifasi ilovada: 114 ta tahlil, NBME tartibida. Qidiruv yonidagi kolbadan yoki istalgan savol tepasidan oching.",
    ),
    notes: [
      { m: "search", side: "L", t: L("Find a test", "Tahlilni toping"), d: L("Type sodium, TSH, ferritin… or a section such as Lipids.", "sodium, TSH, ferritin… yoki «Lipidlar» kabi bo'lim nomini yozing.") },
      { m: "units", side: "R", t: L("Two unit systems", "Ikki xil birlik"), d: L("Conventional units or SI, as on the NBME page.", "Odatiy birliklar yoki SI — NBME sahifasidagidek.") },
      { m: "list", side: "L", t: L("The values", "Qiymatlar"), d: L("Test names stay in English, as on the exam. Sex-specific ranges are listed apart.", "Tahlil nomlari imtihondagidek inglizcha qoladi. Jinsga bog'liq me'yorlar alohida yozilgan.") },
      { m: "close", side: "R", t: L("Close", "Yopish"), d: L("Back to your question.", "Savolingizga qaytadi.") },
    ],
    tip: L(
      "Laboratories differ a little. On the ward, use your own lab's ranges.",
      "Laboratoriyalar orasida ozgina farq bo'ladi. Amaliyotda o'z laboratoriyangiz me'yorlaridan foydalaning.",
    ),
  },

  // 12 ── Medical English (1)
  {
    kind: "B",
    section: L("English", "Ingliz tili"),
    title: L("Medical English", "Tibbiy ingliz tili"),
    intro: L(
      "8,000 clinical terms as flashcards, with the Uzbek meaning. The app schedules each card for you.",
      "8 000 ta klinik atama kartochkalarda, o'zbekcha ma'nosi bilan. Har bir kartochkaning navbatini ilova o'zi belgilaydi.",
    ),
    phones: [
      { shot: "english-setup", cap: L("The first time", "Birinchi marta"), items: [
        { m: "input", side: "L", t: L("New cards a day", "Kuniga yangi kartochka"), d: L("Type any number. Each new word comes back several times, so 20 new is about 60 cards of work.", "Istalgan sonni yozing. Har bir yangi so'z bir necha marta qaytadi, shuning uchun 20 ta yangi — taxminan 60 ta kartochka ishi.") },
        { m: "start", side: "R", t: L("Start studying", "O'qishni boshlash"), d: L("You can change the number later under the gear.", "Sonni keyin tishli g'ildirak ostida o'zgartirish mumkin.") },
      ] },
      { shot: "english-deck", cap: L("Your deck", "Sizning to'plamingiz"), items: [
        { m: "stats", side: "L", t: L("New · Learning · To review", "Yangi · O'rganilmoqda · Takrorlash"), d: L("Today's cards, by kind.", "Bugungi kartochkalar turlari bo'yicha.") },
        { m: "gear", side: "R", t: L("Settings", "Sozlamalar"), d: L("New cards a day, high-yield terms only.", "Kuniga yangi kartochka, faqat eng muhim atamalar.") },
        { m: "search", side: "L", t: L("Look up a word", "So'zni qidiring"), d: L("Search the glossary in English or Uzbek.", "Lug'atdan inglizcha yoki o'zbekcha qidiring.") },
        { m: "study", side: "R", t: L("Study now", "Hozir o'qish"), d: L("Starts today's cards.", "Bugungi kartochkalarni boshlaydi.") },
      ] },
    ],
  },

  // 13 ── Medical English (2)
  {
    kind: "B",
    section: L("English", "Ingliz tili"),
    title: L("A flashcard, front and back", "Kartochka: old va orqa tomoni"),
    intro: L(
      "Look at the term, try to recall the meaning, then check. Be honest with the buttons: they decide when you see the card again.",
      "Atamaga qarang, ma'nosini eslashga urinib ko'ring, so'ng tekshiring. Tugmalarni halol bosing: ular kartochka qachon qaytishini belgilaydi.",
    ),
    phones: [
      { shot: "english-front", cap: L("The front", "Old tomoni"), items: [
        { m: "term", side: "L", t: L("Term and sound", "Atama va talaffuz"), d: L("The English term, with its pronunciation.", "Inglizcha atama va uning talaffuzi.") },
        { m: "tags", side: "L", t: L("High yield", "Muhim"), d: L("Marks the terms that matter most for the exam.", "Imtihon uchun eng muhim atamalarni belgilaydi.") },
        { m: "show", side: "R", t: L("Show meaning", "Ma'nosini ko'rsatish"), d: L("Tap once you have tried to recall it.", "Eslashga urinib ko'rgach bosing.") },
      ] },
      { shot: "english-back", cap: L("The back", "Orqa tomoni"), items: [
        { m: "face", side: "R", t: L("The meaning", "Ma'nosi"), d: L("The Uzbek meaning and a short explanation.", "O'zbekcha ma'nosi va qisqa izoh.") },
        { m: "again", side: "L", t: L("Again", "Qayta"), d: L("Missed it: back in a minute.", "Eslay olmadim: bir daqiqadan so'ng.") },
        { m: "easy", side: "R", t: L("Easy", "Oson"), d: L("Knew it at once: days away.", "Darrov esladim: bir necha kundan so'ng.") },
      ] },
    ],
    tip: L(
      "The time above each button is when the card returns. The more often you know it, the further away it goes.",
      "Har bir tugma ustidagi vaqt — kartochka qachon qaytishi. Qancha ko'p eslasangiz, u shuncha uzoqqa ketadi.",
    ),
  },

  // 14 ── Play (1)
  {
    kind: "B",
    section: L("Play", "O'yin"),
    title: L("Play live with friends", "Do'stlar bilan jonli o'ynang"),
    intro: L(
      "Everyone gets the same question at the same moment. Right and fast wins. Nothing here changes your points or streak.",
      "Hamma bir vaqtda bir xil savol oladi. To'g'ri va tez javob yutadi. Bu yerda nima bo'lsa ham, ballaringiz va kunlik intizomingiz o'zgarmaydi.",
    ),
    phones: [
      { shot: "play-menu", cap: L("Create or join", "Yaratish yoki qo'shilish"), items: [
        { m: "name", side: "L", t: L("Your name", "Ismingiz"), d: L("How friends will see you. In Telegram it comes from your profile.", "Do'stlar sizni shunday ko'radi. Telegramda u profilingizdan olinadi.") },
        { m: "create", side: "L", t: L("Create a game", "O'yin yaratish"), d: L("You become the host.", "Siz boshlovchi bo'lasiz.") },
        { m: "code", side: "R", t: L("Join with a code", "Kod bilan qo'shilish"), d: L("Type the six digits a friend sent you.", "Do'stingiz yuborgan olti xonali kodni yozing.") },
      ] },
      { shot: "play-setup", cap: L("Set the game up", "O'yinni sozlang"), items: [
        { m: "type", side: "R", t: L("Question type", "Savol turi"), d: L("Tap, Typed or Mixed.", "Test, yozma yoki aralash.") },
        { m: "count", side: "R", t: L("Questions", "Savollar"), d: L("5 to 30 in a game.", "O'yinda 5 dan 30 gacha.") },
        { m: "secs", side: "R", t: L("Time each", "Har biriga vaqt"), d: L("5 to 30 seconds.", "5 dan 30 soniyagacha.") },
        { m: "systems", side: "R", t: L("Categories", "Yo'nalishlar"), d: L("Pick systems and subjects, or leave all.", "Tizim va fanlarni tanlang yoki hammasini qoldiring.") },
      ] },
    ],
    tip: L(
      "Questions are picked at random, and friends who read different languages can play the same game.",
      "Savollar tasodifiy tanlanadi, turli tilda o'qiydigan do'stlar bir o'yinda o'ynay oladi.",
    ),
  },

  // 15 ── Play (2)
  {
    kind: "B",
    section: L("Play", "O'yin"),
    title: L("The lobby and the question", "Kutish xonasi va savol"),
    intro: L(
      "Share the code, wait for friends, start. Each question has a countdown; the sooner you are right, the more you score.",
      "Kodni ulashing, do'stlarni kuting, boshlang. Har bir savolda teskari sanoq bor; qanchalik erta to'g'ri javob bersangiz, shuncha ko'p ball.",
    ),
    phones: [
      { shot: "game-lobby", cap: L("The lobby", "Kutish xonasi"), items: [
        { m: "code", side: "L", t: L("Game code", "O'yin kodi"), d: L("Six digits. Friends type it on the Play tab.", "Olti xona. Do'stlar uni «O'yin» bo'limida yozadi.") },
        { m: "share", side: "L", t: L("Share invite", "Taklifni ulashish"), d: L("Sends a Telegram link that opens the game.", "O'yinni ochadigan Telegram havolasini yuboradi.") },
        { m: "players", side: "L", t: L("Players", "O'yinchilar"), d: L("Up to 50. The host is marked.", "50 tagacha. Boshlovchi belgilangan.") },
        { m: "start", side: "R", t: L("Start game", "O'yinni boshlash"), d: L("Only the host, and with two or more players.", "Faqat boshlovchi, kamida ikki o'yinchi bo'lganda.") },
      ] },
      { shot: "game-question", cap: L("A question", "Savol"), items: [
        { m: "timer", side: "R", t: L("Countdown", "Teskari sanoq"), d: L("The bar and the seconds left.", "Chiziq va qolgan soniyalar.") },
        { m: "score", side: "R", t: L("Your points", "Ballaringiz"), d: L("This game only.", "Faqat shu o'yin uchun.") },
        { m: "optA", side: "R", t: L("Tap once", "Bir marta bosing"), d: L("You cannot change it. Faster is worth more.", "O'zgartirib bo'lmaydi. Tezroq — ko'proq ball.") },
        { m: "who", side: "R", t: L("Who answered", "Kim javob berdi"), d: L("How many players are done.", "Nechta o'yinchi tugatgan.") },
      ] },
    ],
  },

  // 16 ── Play (3)
  {
    kind: "B",
    section: L("Play", "O'yin"),
    title: L("After each question, and the end", "Har savoldan keyin va yakunda"),
    intro: L(
      "You see what you earned, how everyone answered, and the scoreboard. At the end, the podium.",
      "Nima yutganingizni, hamma qanday javob berganini va natijalar jadvalini ko'rasiz. Oxirida — sovrinli o'rinlar.",
    ),
    phones: [
      { shot: "game-reveal", cap: L("The reveal", "Javob ochilishi"), items: [
        { m: "result", side: "L", t: L("What you earned", "Yutganingiz"), d: L("500 to 1,000 for a right answer, more the faster you were.", "To'g'ri javob uchun 500 dan 1 000 gacha, qanchalik tez bo'lsangiz, shuncha ko'p.") },
        { m: "streak", side: "L", t: L("Streak bonus", "Ketma-ket bonusi"), d: L("Right answers in a row add up to 500.", "Ketma-ket to'g'ri javoblar 500 gacha bonus qo'shadi.") },
        { m: "tally", side: "R", t: L("How everyone answered", "Hamma qanday javob berdi"), d: L("The right one is highlighted.", "To'g'risi ajratib ko'rsatilgan.") },
        { m: "board", side: "R", t: L("Scoreboard", "Natijalar jadvali"), d: L("Points this question, and the total.", "Shu savoldagi ball va jami.") },
      ] },
      { shot: "game-final", cap: L("The end", "Yakun"), items: [
        { m: "podium", side: "R", t: L("Podium", "Sovrinli o'rinlar"), d: L("The top three.", "Dastlabki uchtasi.") },
        { m: "mine", side: "R", t: L("Your place", "Sizning o'rningiz"), d: L("Place, points and how many you got right.", "O'rin, ball va nechta to'g'ri javob.") },
        { m: "again", side: "R", t: L("New round", "Yangi raund"), d: L("The host can play again with new questions.", "Boshlovchi yangi savollar bilan qayta o'ynashi mumkin.") },
      ] },
    ],
    tip: L(
      "Game points are Kahoot-style and count only inside the game: they never touch your rating.",
      "O'yin ballari Kahoot uslubida va faqat o'yin ichida hisoblanadi: ular reytingingizga ta'sir qilmaydi.",
    ),
  },

  // 17 ── Class (student)
  {
    kind: "B",
    section: L("Class", "Guruh"),
    title: L("Join your teacher's class", "O'qituvchingiz guruhiga qo'shiling"),
    intro: L(
      "Your teacher gives you a six-digit code. They approve you, and you see the class ranking and your homework.",
      "O'qituvchingiz sizga olti xonali kod beradi. U sizni tasdiqlaydi va siz guruh reytingi hamda uy vazifangizni ko'rasiz.",
    ),
    phones: [
      { shot: "class-home", cap: L("The Class tab", "Guruh bo'limi"), items: [
        { m: "join", side: "L", t: L("Enter the code", "Kodni kiriting"), d: L("Six digits from your teacher.", "O'qituvchingizdan olingan olti xonali kod.") },
        { m: "learning", side: "L", t: L("Your classes", "Guruhlaringiz"), d: L("The classes you are in.", "Siz a'zo bo'lgan guruhlar.") },
        { m: "teaching", side: "R", t: L("Classes you teach", "Dars beradigan guruhlar"), d: L("If you are a teacher, they appear here.", "Agar o'qituvchi bo'lsangiz, ular shu yerda ko'rinadi.") },
        { m: "create", side: "R", t: L("Create a classroom", "Guruh yaratish"), d: L("Start your own.", "O'zingizniki.") },
      ] },
      { shot: "class-student", cap: L("Inside a class", "Guruh ichida"), items: [
        { m: "place", side: "L", t: L("Your place", "O'rningiz"), d: L("Among the class, by points.", "Guruh ichida, ball bo'yicha.") },
        { m: "board", side: "R", t: L("Class ranking", "Guruh reytingi"), d: L("Points earned in usmleengo.", "usmleengoda to'plangan ballar.") },
        { m: "homework", side: "R", t: L("Homework", "Uy vazifasi"), d: L("Start it before the due date. Class questions never change your rating.", "Muddatdan oldin boshlang. Guruh savollari reytingingizga ta'sir qilmaydi.") },
        { m: "leave", side: "R", t: L("Leave", "Chiqish"), d: L("Two taps, so it is never by accident.", "Ikki marta bosiladi — tasodifan bo'lmaydi.") },
      ] },
    ],
    tip: L(
      "Your teacher sees your points, streak, accuracy, weak topics and average time — never your saved questions.",
      "O'qituvchingiz ballaringizni, kunlik intizomingizni, aniqligingizni, zaif mavzularingizni va o'rtacha vaqtingizni ko'radi — saqlangan savollaringizni hech qachon.",
    ),
  },

  // 18 ── Class (teacher)
  {
    kind: "B",
    section: L("Class", "Guruh"),
    title: L("Run a class", "Guruhni boshqaring"),
    intro: L(
      "Create a class, share the code, let students in, then give them question packages and homework.",
      "Guruh yarating, kodni ulashing, talabalarni qabul qiling, so'ng ularga savollar to'plami va uy vazifasi bering.",
    ),
    phones: [
      { shot: "class-teacher", cap: L("Your class", "Guruhingiz"), items: [
        { m: "code", side: "L", t: L("Class code", "Guruh kodi"), d: L("Give it to students.", "Talabalarga bering.") },
        { m: "share", side: "L", t: L("Share invite", "Taklifni ulashish"), d: L("A link that opens the class.", "Guruhni ochadigan havola.") },
        { m: "requests", side: "L", t: L("Waiting to join", "Qo'shilishni kutmoqda"), d: L("Let in, or Decline.", "Qabul qiling yoki rad eting.") },
        { m: "students", side: "R", t: L("Students", "Talabalar"), d: L("By points; tap one for their numbers and weak topics.", "Ball bo'yicha; ko'rsatkichlari va zaif mavzulari uchun bosing.") },
      ] },
      { shot: "class-teacher-lower", cap: L("Packages and homework", "To'plamlar va uy vazifasi"), items: [
        { m: "packages", side: "R", t: L("Question packages", "Savollar to'plamlari"), d: L("Write questions, pick from the bank, or send a file to the bot.", "Savollarni yozing, bazadan tanlang yoki botga fayl yuboring.") },
        { m: "newPackage", side: "R", t: L("New package", "Yangi to'plam"), d: L("Only this class sees it.", "Uni faqat shu guruh ko'radi.") },
        { m: "homework", side: "R", t: L("Homework", "Uy vazifasi"), d: L("Set a package with a due date; see who handed in.", "To'plamni muddat bilan bering; kim topshirganini ko'ring.") },
      ] },
    ],
    tip: L(
      "Teachers: send the bot a Word, PDF or text file (or forward quizzes) and it turns them into a package. Send /format to see how to write questions.",
      "O'qituvchilar: botga Word, PDF yoki matn fayl yuboring (yoki viktorinalarni yo'naltiring) — u ularni to'plamga aylantiradi. Savollar qanday yozilishini ko'rish uchun /format yuboring.",
    ),
  },

  // 19 ── Rating
  {
    kind: "A", shot: "rating", width: 336,
    section: L("Rating", "Reyting"),
    title: L("The rating", "Reyting"),
    intro: L(
      "Everyone who plays is ranked by points. The top ten are shown by their Telegram name; everyone else sees only their own place.",
      "Barcha o'yinchilar ball bo'yicha tartiblanadi. Eng yaxshi o'ntalik Telegramdagi ismi bilan ko'rsatiladi; qolganlar faqat o'z o'rnini ko'radi.",
    ),
    notes: [
      { m: "period", side: "R", t: L("All time or this week", "Barcha vaqt yoki shu hafta"), d: L("This week starts level for everyone every Monday.", "Shu hafta har dushanba hamma uchun noldan boshlanadi.") },
      { m: "place", side: "L", t: L("Your rank", "O'rningiz"), d: L("Your place out of everyone, and your points.", "Hamma ichidagi o'rningiz va ballaringiz.") },
      { m: "filter", side: "L", t: L("Day streak filter", "Kunlik intizom saralashi"), d: L("Lists who has the longest streak. It is a filter, not a rank.", "Eng uzun kunlik intizomi borlarni ko'rsatadi. Bu saralash, reyting emas.") },
      { m: "board", side: "R", t: L("Top ten", "Eng yaxshi o'ntalik"), d: L("Place, name and points. Gold, silver and bronze for the first three.", "O'rin, ism va ball. Dastlabki uchtasi oltin, kumush va bronza.") },
      { m: "me", side: "L", t: L("You", "Siz"), d: L("Outside the top ten, your row appears after a gap.", "O'ntalikdan tashqarida bo'lsangiz, qatoringiz bo'shliqdan keyin chiqadi.") },
      { m: "how", side: "L", t: L("How points are counted", "Ballar qanday to'planadi"), d: L("Tap to open the rules.", "Qoidalarni ochish uchun bosing.") },
    ],
  },

  // 20 ── Rating (2)
  {
    kind: "B",
    section: L("Rating", "Reyting"),
    title: L("This week, and how points work", "Shu hafta va ballar qanday ishlaydi"),
    intro: L(
      "A week is fair to newcomers: it counts only what you earned since Monday. The rules are short.",
      "Hafta yangi kelganlar uchun adolatli: unda faqat dushanbadan beri yig'ganingiz hisoblanadi. Qoidalar qisqa.",
    ),
    phones: [
      { shot: "rating-week", cap: L("This week", "Shu hafta"), items: [
        { m: "place", side: "L", t: L("Your week", "Haftangiz"), d: L("Your place this week and the points earned since Monday.", "Shu haftadagi o'rningiz va dushanbadan beri yig'gan ballaringiz.") },
        { m: "board", side: "R", t: L("Weekly top ten", "Haftalik o'ntalik"), d: L("Resets every Monday, 00:00 UTC.", "Har dushanba 00:00 (UTC) da yangilanadi.") },
      ] },
      { shot: "rating-how", cap: L("How points are counted", "Ballar qanday to'planadi"), items: [
        { m: "rules", side: "R", t: L("Three rules", "Uchta qoida"), d: L("Right, wrong and typed. Points never go below 0.", "To'g'ri, noto'g'ri va yozma javob. Ball hech qachon 0 dan pastga tushmaydi.") },
      ] },
    ],
    tip: L(
      "More answers earn more points, so the rating rewards showing up every day.",
      "Javoblar ko'p bo'lsa, ball ham ko'p: reyting har kuni shug'ullanishni rag'batlantiradi.",
    ),
  },

  // 21 ── Me
  {
    kind: "B",
    section: L("Me", "Profil"),
    title: L("Me: progress and settings", "Profil: natijalar va sozlamalar"),
    intro: L(
      "Your points and rank, three numbers just for you, and the settings.",
      "Ballaringiz va o'rningiz, faqat siz uchun uchta ko'rsatkich va sozlamalar.",
    ),
    phones: [
      { shot: "me", cap: L("Your progress", "Natijalaringiz"), items: [
        { m: "points", side: "L", t: L("Points and rank", "Ball va o'rin"), d: L("Tap it to open the rating.", "Reytingni ochish uchun bosing.") },
        { m: "how", side: "L", t: L("How points are counted", "Ballar qanday to'planadi"), d: L("The rules, in three lines.", "Qoidalar — uch qatorda.") },
        { m: "numbers", side: "R", t: L("Just for you", "Faqat siz uchun"), d: L("Day streak, accuracy, questions used. They add no points.", "Kunlik intizom, aniqlik, ishlatilgan savollar. Ular ball qo'shmaydi.") },
      ] },
      { shot: "me-lower", cap: L("Settings and help", "Sozlamalar va yordam"), items: [
        { m: "language", side: "R", t: L("Language", "Til"), d: L("English or Uzbek, for the whole app and every question.", "Butun ilova va barcha savollar uchun ingliz yoki o'zbek tili.") },
        { m: "theme", side: "R", t: L("Appearance", "Ko'rinish"), d: L("Light or dark.", "Yorug' yoki qorong'i.") },
        { m: "reset", side: "R", t: L("Reset", "Tozalash"), d: L("Clears all progress. Two taps.", "Barcha natijalarni o'chiradi. Ikki marta bosiladi.") },
        { m: "tour", side: "L", t: L("How to use", "Qanday foydalanish"), d: L("A quick tour of every tab.", "Har bir bo'limga qisqa sayohat.") },
        { m: "report", side: "L", t: L("Report a problem", "Muammo haqida xabar"), d: L("Opens a chat with the developer.", "Dasturchi bilan chatni ochadi.") },
      ] },
    ],
  },

  { kind: "reference" },
  { kind: "faq" },
  { kind: "closing" },
];

// The rating and game rules, and the answers to what people ask most.
export const rules = {
  title: L("The rules on one page", "Qoidalar bir sahifada"),
  section: L("Reference", "Ma'lumotnoma"),
  rating: {
    head: L("Rating points", "Reyting ballari"),
    rows: [
      [L("Right, tapped", "To'g'ri, test"), L("5 points, plus up to 15 for speed: 20 if instant, 15 at 3 s, 9 at 10 s.", "5 ball va tezlik uchun 15 gacha: bir zumda 20, 3 soniyada 15, 10 soniyada 9.")],
      [L("Wrong, tapped", "Noto'g'ri, test"), L("−8 points.", "−8 ball.")],
      [L("Right, typed", "To'g'ri, yozma"), L("1.5 times a tapped answer at the same speed.", "Shu tezlikdagi test javobidan 1,5 baravar ko'p.")],
      [L("Wrong, typed", "Noto'g'ri, yozma"), L("0 points: nothing is taken away.", "0 ball: hech narsa ayirilmaydi.")],
      [L("Never below zero", "Noldan past emas"), L("Your points cannot go negative.", "Ballaringiz manfiy bo'lmaydi.")],
      [L("The clock", "Vaqt"), L("Starts when the question appears, stops when you answer. Reading the explanation is not counted.", "Savol chiqqanda boshlanadi, javob berganingizda to'xtaydi. Izohni o'qish hisoblanmaydi.")],
      [L("The same question again", "Xuddi shu savol qayta"), L("Each further right answer is worth half as much as the last.", "Har bir keyingi to'g'ri javob avvalgisidan ikki baravar kam ball beradi.")],
    ],
  },
  game: {
    head: L("Game points (Play tab)", "O'yin ballari (O'yin bo'limi)"),
    rows: [
      [L("Right", "To'g'ri"), L("500 to 1,000 points: the faster, the more.", "500 dan 1 000 gacha: qanchalik tez, shuncha ko'p.")],
      [L("Wrong or no answer", "Noto'g'ri yoki javobsiz"), L("0 points.", "0 ball.")],
      [L("Streak bonus", "Ketma-ket bonusi"), L("100 for the 2nd right answer in a row, then 100 more each time, up to 500.", "Ketma-ket 2-to'g'ri javobga 100, keyin har safar yana 100, 500 gacha.")],
      [L("Your rating", "Reytingingiz"), L("Game points never change it.", "O'yin ballari unga ta'sir qilmaydi.")],
    ],
  },
  streak: {
    head: L("Day streak", "Kunlik intizom"),
    text: L(
      "One day counts when you answer at least one question or study a flashcard. Miss a day and it starts again from one. It is shown for interest and adds no points.",
      "Kamida bitta savolga javob bersangiz yoki kartochka o'rgansangiz, kun hisoblanadi. Bir kun o'tkazib yuborsangiz, qaytadan boshlanadi. U faqat ma'lumot uchun ko'rsatiladi va ball qo'shmaydi.",
    ),
  },
};

export const faq = {
  title: L("Questions people ask", "Ko'p so'raladigan savollar"),
  section: L("Help", "Yordam"),
  items: [
    [L("Where is my progress saved?", "Natijalarim qayerda saqlanadi?"), L("In your Telegram account, so it is there on any device where you open usmleengo. Two Telegram accounts on one phone keep separate progress.", "Telegram akkauntingizda — usmleengoni istalgan qurilmada ochsangiz, u yerda bo'ladi. Bir telefondagi ikkita Telegram akkaunti alohida hisoblanadi.")],
    [L("I opened the app in a browser. Why no rating?", "Ilovani brauzerda ochdim. Nega reyting yo'q?"), L("The rating and classes need Telegram to know who you are. Open the app from @usmleengo_bot.", "Reyting va guruhlar sizni tanish uchun Telegramni talab qiladi. Ilovani @usmleengo_bot orqali oching.")],
    [L("A question looks wrong or is badly translated.", "Savol xato yoki yomon tarjima qilingan."), L("Tap Something wrong with this question? Tell me under the explanation. It opens a chat with the developer with the question's id already filled in.", "Izoh ostidagi «Savolda xato bormi? Menga yozing» ni bosing. Savol raqami yozib qo'yilgan holda dasturchi bilan chat ochiladi.")],
    [L("How do I change the language?", "Tilni qanday o'zgartiraman?"), L("Me → Language. The whole app and every question switch. Test names in the lab table stay in English, as on the exam.", "Profil → Til. Butun ilova va barcha savollar o'zgaradi. Laboratoriya jadvalidagi tahlil nomlari imtihondagidek inglizcha qoladi.")],
    [L("How do I start over?", "Qanday qilib boshidan boshlayman?"), L("Me → Reset all progress. It needs two taps and clears points, streak, question history and the flashcard deck.", "Profil → Barcha natijalarni o'chirish. Ikki marta bosiladi va ball, kunlik intizom, savollar tarixi hamda kartochkalarni tozalaydi.")],
    [L("Why did my points go down?", "Nega ballarim kamaydi?"), L("A wrong tapped answer costs 8 points. Wrong typed answers cost nothing.", "Noto'g'ri test javobi 8 ball ayiradi. Noto'g'ri yozma javob ball ayirmaydi.")],
    [L("Does it need internet?", "Internet kerakmi?"), L("Yes: the questions, games, classes and the rating all come over the internet.", "Ha: savollar, o'yinlar, guruhlar va reyting internet orqali keladi.")],
    [L("Something is broken.", "Nimadir ishlamayapti."), L("Me → Report a problem, or write to the developer in Telegram. Say what you were doing and what you saw.", "Profil → Muammo haqida xabar berish yoki dasturchiga Telegramda yozing. Nima qilayotganingizni va nimani ko'rganingizni yozing.")],
  ],
};
