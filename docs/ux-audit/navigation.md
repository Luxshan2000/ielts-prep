# A2 — Navigation & information architecture

Audited against the running app (localhost:5273) at 1280, 1024 and 820 px. Read-only pass;
no product files were touched. Every finding names a file.

---

## 1. The ten screens

| Screen | What it is for | Obvious in 3s? | Primary action |
|---|---|---|---|
| Home `/` | Today's plan + where the bands stand | Yes | **Set up my plan** (no plan) / start the first block |
| Speaking `/speaking` | Live examiner call, band feedback after | Yes | Ambiguous — three competing mock entries, see §3.1 |
| Writing `/writing` | Pick a prompt, write, get it marked | Yes | **Start** on a prompt card |
| Reading `/reading` | Test / passage / drill library | Yes, but the H1 is pushed below a nav strip | **Start test** |
| Listening `/listening` | Four-part tests, audio generated locally | Yes | **Start under exam conditions** |
| Vocabulary `/vocab` | The card bank and what is due | Yes | **Review 20** — rendered twice, see §3.5 |
| Grammar `/grammar` | Ordered syllabus + reference | Yes | **Start the first lesson** |
| Pronunciation `/pronunciation` | Hear a contrast, then say it | Yes | **Play** on a minimal pair |
| Progress `/progress` | Band trajectory, mocks, readiness | Yes | None — every panel is empty and none offers a way out (§2.1) |
| Settings `/settings` | Model, voice, appearance, data | Yes | **Use my computer** / **Check** |

Empty states read well everywhere except Progress, which is four empty panels with no exit.

---

## 2. Findings, worst first

### 2.1 The exam date is unreachable, and two screens tell the learner to go and set it
`features/home/components/SideTiles.tsx:82` — "Add a date in Settings and the plan regenerates
around it." `features/progress/components/ReadinessChecklist.tsx:206` — "Add your exam date to
unlock the checklist", with **no action button**. But `features/settings/page.tsx:17-23` has five
tabs (Providers, Voice, Appearance, Data, About) and none of them holds an exam date, a target
band, a weekly budget, study days or a daily goal. The only editor in the build is
`features/onboarding/components/steps.tsx:186`, reachable only by typing `#/onboarding`.
`SideTiles.tsx:48` has the same problem ("Rest days you configured" — configured where?).

This is the app's worst dead end: the product tells the learner to do something and then hides
the control.

### 2.2 Home promises 151 cards and delivers 20
`features/home/components/SideTiles.tsx:134,161` renders "Due today **151**" and
"Review **151** cards". The sidebar badge (`components/shell/Sidebar.tsx:68`) and the Vocabulary
screen both say **20**. Cause: `sidecar/bandready/server/routes/progress.py:95-131` counts every
card with `due_at <= now`, ignoring the `new_per_day: 10` cap that `/api/v1/vocab/stats` applies.
Two numbers for the same thing, one screen apart.

### 2.3 A whole screen no one can reach
`features/reading/route.tsx:64` mounts `DrillPractice` at `/reading/drills`. Nothing in the app
links to it — the launcher strip offers only coach and mock, and the reachable drills are a tab
(`features/reading/components/ReadingBrowser.tsx:255`, `/reading?tab=drills`). Either link it or
delete it; two different drill screens under near-identical names is worse than one.

### 2.4 The "Minimal pairs" plan block sends you to the wrong room
`sidecar/bandready/curriculum/plan.py:78` maps the pronunciation criterion to
`("speaking", "minimal_pairs")`. `features/home/blocks.ts:110` routes on module only, so the block
opens `/speaking` — a room with no minimal pairs in it. The screen that has them is
`/pronunciation`. `blocks.ts:26-32` also has no entry for `grammar` or `pron` at all, so any future
block for either would claim "has no screen in this build yet" about two shipped screens.

### 2.5 Raw codes reaching the learner
- `features/home/blocks.ts:149` → **"Focus: GRA"**, **"Focus: MINIMAL"**. The value comes from
  `sidecar/bandready/curriculum/plan.py:291` (`drill[1].split("_")[0].upper()`).
- `features/listening/page.tsx:188` renders `test.source` verbatim → **"40 questions across 4 parts · pack"**.
- `features/progress/components/MockHistory.tsx:126` → "the **sidecar** has no reading
  **attempt-history route**".
- `features/writing/components/PromptBrowser.tsx:65` falls back to the raw `task_type`
  (`ac_task1`) when `TASK_SHORT` has no entry.
- `App.tsx:58` → "That **route** does not exist in BandReady."

### 2.6 Jargon a learner should not need
- `features/vocab/page.tsx:68` — "scheduled by **FSRS**".
- `features/vocab/components/ReviewOverview.tsx:90-91` and `StatsPanel.tsx:104-105` — **Young** /
  **Mature** tiles (Anki vocabulary; the hint under them does the work the label should).
- `features/writing/store.ts:269-270` — **AC Task 1** / **GT Task 1** with no expansion anywhere on
  the screen.
- `features/grammar/components/PathScreen.tsx:188` — a bare CEFR code, "· **A1**".
- `features/pron/components/MinimalPairDrill.tsx:141` — an IPA chip (`ɪ–iː`) repeated on every row
  with no legend.
- `features/reading/components/ReadingBrowser.tsx:94` — `formatDuration(3600)` prints **1:00:00**
  for a fixed 60-minute paper; that is a stopwatch, not a duration.

None of these blocks navigation on its own, but each one is a place where the screen stops being
written for the learner.

---

## 3. Consistency across screens

### 3.1 The mock lives in four different places
| Screen | Where the mock is |
|---|---|
| Speaking | A banner card **and** a radio in "Choose a session" **and** the primary button (`features/speaking/page.tsx:81-237`) |
| Writing | A header action, "Sit the 60-minute paper" (`features/writing/page.tsx:67`) |
| Reading | A launcher strip **above** the page title (`features/reading/page.tsx:33`) |
| Listening | A body card **plus** an "Exam conditions" tab that means something else (`features/listening/page.tsx:133`, `:78`) |

Speaking is the worst of the four: "Full mock" is the default-selected mode, so the primary button
under the mic meter reads "Set up the mock test" and just navigates to the same room the banner
above already offers. Reading and Listening are the second worst: "Full tests · 40 questions ·
1:00:00" and "Mock paper · 40 questions · 60 minutes" read as the same thing to a learner.

### 3.2 The coach lives in four different places too
Writing = a tab (`features/writing/page.tsx:73`); Reading = the launcher strip
(`features/reading/page.tsx:29`); Listening = a body card (`features/listening/page.tsx:115`);
Speaking = a body card near the bottom (`features/speaking/page.tsx:226`).

### 3.3 Back links differ in label, icon and slot
`features/speaking/components/teaching/CoachPicker.tsx:73` — ghost button, ArrowLeft icon,
"Back to Speaking". `features/reading/components/coach/CoachPicker.tsx:67` — same slot, no icon,
"Reading library". `features/listening/components/coach/CoachPicker.tsx:105` — "Listening library".
Elsewhere: "Back to Reading", "Back to the reading library", "Back to the path", "Back to drills",
"Back to the mock room". The app has no consistent up-navigation, and in Electron there is no
browser back button to fall back on.

### 3.4 The header-right slot means four different things
Primary action (`vocab/page.tsx:71`, `grammar/page.tsx:89`), a refresh (`home/page.tsx:80`,
`listening/page.tsx:73`, `progress/page.tsx:111`), a status badge (`speaking/page.tsx:85`,
`writing/page.tsx:62`), or nothing (`pron/page.tsx`, `settings/page.tsx`). A learner cannot learn
where the button is.

### 3.5 Vocabulary renders its primary action twice
`features/vocab/page.tsx:71` ("Review 20") and `features/vocab/components/ReviewOverview.tsx`
("Review 20 cards") are both on screen at once, 200 px apart.

### 3.6 Tab state is deep-linkable on four screens and not on two
Synced to `?tab=`: vocab (`page.tsx:24`), grammar (`page.tsx:50`), pron (`page.tsx:98`), reading
browser (`ReadingBrowser.tsx:149`). Local state only: settings (`page.tsx:26`) and writing
(`page.tsx:34`). This is why §2.1 cannot be fixed with a link alone — nothing can point at
"Settings → the tab with your exam date".

### 3.7 Nav label ≠ page title
Sidebar says "Grammar" (`features/grammar/route.tsx:12`); the H1 says "Grammar & Usage"
(`features/grammar/page.tsx:85`). Every other screen matches.

### 3.8 "Progress" means two things
The sidebar item `/progress` and Grammar's third tab (`features/grammar/page.tsx:107`) share the
name and show unrelated data.

### 3.9 The due badge is hardcoded to one route
`components/shell/Sidebar.tsx:67` — `path.startsWith("/vocab")`. Grammar computes a due count and
shows a header button for it (`features/grammar/page.tsx:88`) but gets no badge. The file's own
comment says nav is never hand-edited; this is a hand-edited exception.

### 3.10 Tab panels announce a slug
`components/ui/Tabs.tsx:96` uses `value` as the panel's accessible name, so screen readers say
"review", "listen", "speak". `ReadingBrowser.tsx:376` works around it by passing the label as the
value.

---

## 4. Is ten sidebar items the right shape?

Ten is not too many; **flat** is the problem. What a learner does daily splits cleanly in two, and
the sidebar renders both as one undifferentiated list:

- **The exam** — Speaking, Writing, Reading, Listening. Scored, mock-able, feeds the band estimate.
- **The groundwork** — Vocabulary, Grammar, Pronunciation. Never scored, done in ten-minute pieces
  around a session.

Speaking's header even labels this ("Counts toward your band"), but the nav does not. A learner
choosing between "Listening" and "Pronunciation" today has nothing telling them one is a 30-minute
scored paper and the other is a five-minute ear drill.

**Recommendation: two labelled groups, no nesting, nothing removed.** Nesting Pronunciation under
Speaking would bury the one module that helps a Tamil or Sinhala speaker most; merging Grammar into
Writing would hide a 154-lesson syllabus behind an essay screen. Keep Home at the top, Progress at
the bottom of the list, Settings pinned where it is.

Two items deserve scrutiny but should stay:
- **Progress** duplicates Home's band block almost exactly (`features/home/components/EstimateTiles.tsx`
  vs `features/progress/page.tsx:25` SkillTile). Home should show one line and a link, not a second
  copy of the four tiles — that also fixes the 1024 crowding in §5.
- **Pronunciation** is the lowest-frequency room, but it is also the only unscored, unjudged one,
  and demoting it would contradict the accent rule's whole posture.

Nothing should be demoted out of the sidebar.

---

## 5. Widths

**1280** — all ten screens fine.

**1024** — Home breaks. `features/home/page.tsx:175` flips to `lg:grid-cols-3` at exactly 1024;
minus the 224 px sidebar that is ~250 px per column, so "Estimated band — not a guarantee" wraps
onto three lines and the overall-estimate sentence becomes a nine-line ribbon beside a single dash.
Use `xl:grid-cols-3` (or `lg:grid-cols-2` + `xl:grid-cols-3`).

**820** — Reading breaks. `features/reading/page.tsx:75` truncates the launcher detail, so the strip
reads "Study one passage — the map, th…" and "Three passages, 40 questions, 6…" — the entire
distinction between the two rooms is in the truncated half. Stack them (or drop the detail line)
below `lg`. Everything else holds; no page scrolls sideways at any of the three widths
(`document.scrollWidth === clientWidth` confirmed at 820).

**Below 768** (outside the brief, but adjacent): `App.tsx:157` places the drawer button at
`absolute left-2 top-2`, directly on top of the `PageShell` H1. At 760 px the hamburger is drawn
over the first letter of "Reading coach".

---

## 6. Changes, ordered by how much they hurt

1. Add a **Study plan** tab to `features/settings/page.tsx` (TABS, line 17) with a new
   `features/settings/components/PlanTab.tsx`: exam date, format, target band, weekly minutes,
   study days, daily goal, rest days. Then make `features/home/components/SideTiles.tsx:82` and
   `:48` true, and give `features/progress/components/ReadinessChecklist.tsx:206` an `action`
   button that goes there.
2. Fix the due count in `sidecar/bandready/server/routes/progress.py:95-131` — apply the same
   `new_per_day` cap `/api/v1/vocab/stats` uses, so `features/home/components/SideTiles.tsx:134,161`
   stops promising 151.
3. Reachability for `/reading/drills`: either add a third `LauncherLink` in
   `features/reading/page.tsx` or delete the route from `features/reading/route.tsx:64` and its
   `components/drills/DrillPractice` entry point.
4. In `features/home/blocks.ts`, resolve micro-drill blocks by `activity` before `module`, and map
   `minimal_pairs → /pronunciation`; add `grammar` and `pron` to `MODULE_ROUTES` (lines 26-32).
5. Replace the criterion code in `features/home/blocks.ts:149` with a label map
   (`GRA → "grammar range and accuracy"`, …) — or emit a phrase from
   `sidecar/bandready/curriculum/plan.py:291`.
6. One mock entry point per skill, in the same slot. Header action is the right slot (Writing
   already does it): move `features/reading/page.tsx:33` and `features/listening/page.tsx:133` into
   their `PageShell actions`, and delete the duplicate mock banner in `features/speaking/page.tsx`
   (keep the "Full mock" mode, which is the one a learner actually chooses from).
7. One coach entry point per skill, same slot as above:
   `features/reading/page.tsx:29`, `features/listening/page.tsx:115`, `features/speaking/page.tsx:226`,
   `features/writing/page.tsx:73`.
8. One back-link component. Add it to `components/ui/` (or a `PageShell back` prop in
   `components/shell/PageShell.tsx`) with a fixed shape — ArrowLeft + "Back to <room>", top-left of
   the header — and use it in `reading/components/coach/CoachPicker.tsx:67`,
   `listening/components/coach/CoachPicker.tsx:105`,
   `speaking/components/teaching/CoachPicker.tsx:73` and the eleven other sites listed in §3.3.
9. Sync the tab to `?tab=` in `features/settings/page.tsx:26` and `features/writing/page.tsx:34`, so
   every screen behaves the same and Settings sub-pages become linkable.
10. Group the sidebar: add `group?: "skills" | "foundations"` to `lib/featureRoute.ts`, set it in
    each `features/*/route.tsx`, and render the group headings in `components/shell/Sidebar.tsx`
    (still derived from the glob — no hand-written nav list).
11. Move the due badge into the route contract: `badge?: () => ReactNode` in `lib/featureRoute.ts`,
    replacing the `/vocab` special case at `components/shell/Sidebar.tsx:67`, and give Grammar one.
12. `features/home/page.tsx:24,175` — `lg:grid-cols-3` → `xl:grid-cols-3`.
13. `features/reading/page.tsx:64-77` — stack the launcher links below `lg` and drop `truncate`.
14. De-jargon: `features/vocab/page.tsx:68` (FSRS), `vocab/components/ReviewOverview.tsx:90-91` and
    `StatsPanel.tsx:104-105` (Young/Mature), `features/writing/store.ts:269-270` (AC/GT),
    `features/grammar/components/PathScreen.tsx:188` (CEFR), `features/listening/page.tsx:188`
    (`test.source`), `features/progress/components/MockHistory.tsx:126` (sidecar/route),
    `App.tsx:58` (route), `features/reading/components/ReadingBrowser.tsx:94` (1:00:00),
    `features/pron/components/MinimalPairDrill.tsx:141` (IPA legend).
15. Rename to match the sidebar: `features/grammar/page.tsx:85` "Grammar & Usage" → "Grammar", and
    rename Grammar's "Progress" tab (`:107`) to "Your points" so it stops colliding with `/progress`.
16. Drop the second "Review" button — `features/vocab/page.tsx:71` or the one in
    `components/ReviewOverview.tsx`, not both.
17. `components/ui/Tabs.tsx:96` — add an explicit `label` prop to `TabPanel` instead of using
    `value` as the accessible name; update the eight call sites.
18. `App.tsx:157` — move the drawer button into `PageShell`'s header row (or pad the H1 at `<md`)
    so it stops covering the title below 768.
19. Onboarding renders inside the shell with the full sidebar live
    (`features/onboarding/route.tsx` + `App.tsx`), so a learner can click "Reading" mid-wizard;
    Home then bounces them back to `/onboarding` (`features/home/page.tsx:68`) while every other
    item still works. Either dim the nav during the wizard or make the escape explicit — the
    "Skip setup for now" button already exists for that purpose.
