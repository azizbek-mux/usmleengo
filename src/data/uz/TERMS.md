# Uzbek terms — agreed with the owner (2026-09-28)

Every Uzbek string in the app and the question bank uses these forms, so the
same thing reads the same way everywhere. Reference for anything not listed:
`src/data/clinical-english-glossary.csv` (the `term_uz` column). A term with
no sure Uzbek form, or several candidates, is asked, not guessed.

Script: Latin, with the ASCII apostrophe — o' g' (never ‘ ’ ʻ). Medical terms
fully in Uzbek (no English in brackets, no English terms kept).

## App words
| English | Uzbek |
|---|---|
| Quiz (tab) | Testlar |
| English (tab) | Ingliz tili |
| Play | O'yin |
| Class | Sinf (owner, 2026-09-30 - was Guruh; the bot already said sinf) |
| Rating | Reyting |
| Me | Profil |
| points | ball |
| day streak | kunlik intizom |
| XP | XP |
| Mistakes | Xatolar |
| Saved | Saqlangan |
| Weak topics | Yaxshi o'zlashtirilmagan mavzular |
| Homework | Uy vazifasi |
| question package | savollar to'plami |
| teacher / student | o'qituvchi / talaba |
| typed / tapped answer | Yozma javob / Test |

## Category chips
pharm farma · endo endo · micro mikro · neuro nevro · cardio kardio ·
gi gastro · renal nefro · gen gen · resp pulmo · onco onko · immuno immun ·
peds pediatr · histo gisto · radio radio

## Abbreviations (Russian-style, as Uzbek clinics write them)
| English | Uzbek |
|---|---|
| ACTH, TSH, ADH, PTH, LH, FSH | AKTG, TTG, ADG, PTG, LG, FSG |
| HIV, AIDS, DNA, RNA, ATP | OIV, OITS, DNK, RNK, ATF |
| ECG, CT, MRI | EKG, KT, MRT |
| ESR, GFR, BMI, LDL / HDL | EChT, KFT, TVI, ZPLP / ZYuLP |
| COPD, ARDS, DIC, NSAIDs | O'SOK, O'RDS, DVS-sindrom, NYaQV |
| CMV, HSV, HPV, TNF | SMV, OGV, OPV, O'NO |
| CSF, BP, IV | likvor, arterial bosim, vena ichiga |
| T3/T4, B12, CD4, IL-6, HLA, MHC, QT, FEV1 | unchanged |
| G6PD | **G6FD** (owner, 2026-09-30), by the ATP -> ATF pattern |

## Names
- Drugs in Uzbek spelling: furosemid, gidroxlorotiazid, spironolakton,
  varfarin, geparin.
- Eponyms transliterated: Kushing sindromi, Addison kasalligi, Kron
  kasalligi, Uoterxaus-Frideriksen sindromi.
- Microbes keep their Latin names: Staphylococcus aureus, E. coli.
- Genes and proteins unchanged: BRCA1, p53, JAK2.

## Phrases
| English | Uzbek |
|---|---|
| most likely diagnosis | eng ehtimoliy tashxis |
| first-line treatment | birlamchi davo |
| drug of choice | birlamchi preparat |
| drug (in general) | preparat; dori in plain speech |
| mechanism of action | ta'sir mexanizmi |
| side effect | nojo'ya ta'sir |
| risk factor | xavf omili |
| deficiency | yetishmovchiligi |
| presents with… | …bilan murojaat qildi |
- Brand + suffix: write it joined — usmleengoda, usmleengoga, usmleengodan (never usmleengo'da: o' is a letter).

## Decided 2026-09-29 (owner's answers)
| English | Uzbek |
|---|---|
| PT / INR / PTT (aPTT) | PV / MNO / AChTV — Russian-style lab abbreviations |
| IGF-1 | IFR-1 (insulinsimon o'sish omili-1) |
| Reed-Sternberg cells | Berezovskiy-Shternberg hujayralari |
| eponyms | as Russian textbooks spell them: Горнер → Gorner, Гейнц (Heinz) → Geyns; Хашимото → Xashimoto, Ходжкин → Xodjkin (Russian uses Х there) |
| unconjugated / conjugated bilirubin | bilvosita / bevosita bilirubin |
| CNS / PNS | markaziy nerv sistemasi (MNS) / periferik nerv sistemasi |
| acetaminophen | atsetaminofen (the glossary's form) |
| epinephrine / norepinephrine | epinefrin / norepinefrin (the glossary's form) |
| rate-limiting enzyme | tezlikni cheklovchi ferment |
| NADPH / NADH / FAD | NADFN / NADN / FAD |
| PPD (tuberculin skin test) | Mantu sinamasi |
| Negri bodies | Babesh-Negri tanachalari |

## Glossary spellings to follow (checked in clinical-english-glossary.csv)
- -emia after a consonant: giperkaliemiya, gipokaliemiya, giponatriemiya, gipokalsiemiya, giperkalsiemiya, gipoalbuminemiya; but gipoglikemiya.
- antibody → antitelo (antitelolar); antigen → antigen.
- preload / afterload → oldingi yuklama / keyingi yuklama.
- anion gap → anion farq ("yuqori anion farqli metabolik atsidoz").
- murmur → shovqin; crescendo-decrescendo → kuchayib-susayuvchi; holosystolic → golosistolik; opening snap → ochilish qarsillashi.
- gram-positive / gram-negative → gram-musbat / gram-manfiy; coagulase-negative → koagulaza-manfiy; acid-fast → kislotaga chidamli; India ink → tush bo'yog'i.
- BUN → mochevina azoti; ESR → eritrotsitlar cho'kish tezligi (EChT).
- SIADH → antidiuretik gormonning noadekvat sekretsiyasi sindromi; euvolemic → evovolemik.
- loop of Henle → Genle halqasi; loop diuretic → halqali diuretik; ACE → AFF (angiotenzinga aylantiruvchi ferment), ACE inhibitors → AFF ingibitorlari.
- multiple sclerosis → tarqalgan skleroz; Guillain-Barré → Giyen-Barre sindromi; Lewy bodies → Levi tanachalari; Philadelphia chromosome → Filadelfiya xromosomasi.
- atrial fibrillation → bo'lmachalar fibrillatsiyasi; angina pectoris → stenokardiya; ectopic pregnancy → bachadondan tashqari homiladorlik.
- caseous necrosis → tvorogsimon nekroz; goblet cells → qadahsimon hujayralar; mast cells → semiz hujayralar; epithelioid → epiteliosimon.
- type I hypersensitivity → I turdagi o'ta yuqori sezuvchanlik; celiac disease → seliakiya; sickle cell anemia → o'roqsimon hujayrali anemiya.
- upper motor neuron → yuqori motor neyron; demyelination → demielinizatsiya; night blindness → shabko'rlik; basophilic stippling → bazofil punktuatsiya.
- overdose → dozasini oshirib yuborish; cross-match → qonning mosligini tekshirish (kross-match); edema → shish.

## Answer words used everywhere
Yes/No → Ha/Yo'q · True/False → To'g'ri/Noto'g'ri · Increased/Decreased → Oshgan/Kamaygan (as a verb: Oshiradi/Kamaytiradi) · High/Low → Yuqori/Past · Normal → Normada · Positive/Negative → Musbat/Manfiy · Present/Absent → Bor/Yo'q · Louder/Softer → Kuchayadi/Susayadi.

## Confirmed by the owner 2026-09-29 (second round)
- ARB → angiotenzin retseptor blokatorlari (the full form, never "sartanlar") — owner, 2026-09-29
- VLDL → ZJPLP (zichligi juda past lipoproteinlar), by the ZPLP pattern
- cAMP / cGMP → sAMF / sGMF (like ATP → ATF)
- LDH → LDG; CK → KFK
- S3 / S4 heart sounds → S3 toni / S4 toni (the glossary writes "S2 tonining")
- SA node → sinus tuguni; AV node → AV tugun
- GPA → poliangiitli granulyomatoz; SLE → tizimli qizil yuguruk (TQY)
- Nutcracker syndrome → «Yong'oqchaqar» sindromi; Prinzmetal → Prinsmetal
- acetaminophen etc. as decided; granuloma → granulyoma (Russian гранулёма)
- GABA → GAMK (Russian ГАМК); REM sleep → REM uyqusi
- HGPRT → GGFRT; HSV → OGV (as agreed); tabes dorsalis → orqa miya quruqshog'i; shingles → o'rab oluvchi temiratki

## Settled while finishing the bank, 2026-09-30
Chosen to match what the already-translated files use, so nothing reads two
ways. Anything genuinely open was left for the owner (see the bottom of this
file).

| English | Uzbek |
|---|---|
| zinc | rux (not "ruh") |
| valve | qopqoq — mitral qopqoq prolapsi, o'pka qopqog'i |
| mitral valve prolapse | mitral qopqoq prolapsi |
| tricuspid regurgitation | trikuspidal regurgitatsiya |
| cor pulmonale | o'pka yuragi |
| PCWP / wedge pressure | PCWP; o'pka kapillyarlarining tiqilma bosimi |
| berry (saccular) aneurysm | xaltasimon anevrizma |
| bundle branch block | tutam blokadasi (o'ng / chap tutam blokadasi) |
| ASD / VSD / PDA / PFO | bo'lmachalararo / qorinchalararo to'siq nuqsoni; ochiq arterial oqim yo'li; ochiq oval teshik |
| dumping syndrome | Demping-sindrom |
| duodenum | o'n ikki barmoqli ichak |
| mesenteric artery | tutqich arteriyasi (yuqori / pastki) |
| ileocolic artery | yonbosh-chambar arteriyasi |
| sigmoid colon | sigmasimon ichak |
| urinary casts | silindrlar (loyqa-jigarrang donador silindrlar) |
| ureter | siydik nayi |
| Bowman capsule | Boumen kapsulasi |
| mismatch repair | mos kelmaslikni tuzatish |
| HNPCC | Linch sindromi |
| Wilms tumour | Vilms o'smasi |
| Duchenne | Dyushen |
| putamen / globus pallidus / caudate | po'stloq tanasi / oqargan shar / dumli yadro |
| basal ganglia | bazal yadrolar |
| anterior white commissure | oldingi oq bitishma |
| saltatory conduction | sakrovchi o'tkazish |
| locked-in syndrome | «Qamalgan odam» sindromi |
| uvula | tilcha |
| hypoglossal / vagus nerve | til osti nervi / adashgan nerv |
| subclavian steal | o'mrov osti o'g'irlash sindromi |
| vertebral artery | umurtqa arteriyasi |
| dissection | qatlamlanish |
| conduction aphasia | konduktiv afaziya |
| target cells / bite cells | nishon hujayralar / «tishlangan» hujayralar |
| Heinz bodies | Geyns tanachalari |
| thalassemia trait | talassemiya tashuvchiligi |
| polycythemia vera | haqiqiy politsitemiya |
| essential thrombocythemia | essensial trombotsitemiya |
| Waldenström | Valdenstrem |
| Peyer patches | Peyer pilakchalari |
| Reid index | Reyd indeksi |
| mesothelioma | mezotelioma |
| high-resolution CT | yuqori aniqlikdagi KT |
| ATPase / GTPase | ATFaza / GTFaza |
| percentile | sentil |
| median / mode | mediana / moda |
| odds ratio | shanslar nisbati |
| confidence interval | ishonch oralig'i |
| absolute risk reduction | mutlaq xavf kamayishi |
| null hypothesis | nol gipoteza |
| total parenteral nutrition | parenteral oziqlantirish |
| Jehovah's Witness | Yahova shohidi |
| ICU | reanimatsiya bo'limi |
| informed consent | xabardor rozilik |

## Answered by the owner, 2026-09-30
- **G6PD -> G6FD** everywhere, following ATP -> ATF. The bank was changed.
- **zinc -> rux** confirmed, as the glossary has it. Never `sink`.
- **Duchenne -> Dyushen**, one n, as the glossary has it. The bank spelled it
  `Dyushenn` in 19 places; all of them were changed (`Dyushennda` ->
  `Dyushenda`).
- **The bot's language order** stays as built: it replies in both and leads
  with the phone's Telegram language, so a phone set to Russian reads the
  English half first with the Uzbek under it.

## Workflow note
- Write at most ~40 questions per batch. A long unbroken block of microbiology (toxins, organisms) can trip a safety filter mid-write; smaller batches go through cleanly. Nothing is lost when one is stopped — the file on disk is untouched.
