# 12 — Design system

> **Design intent as of 2026-07-25 — not a description of what exists.** This is a planning document, written before implementation began. Much of it shipped differently. For what actually ships, read `app/src/components/ui/` and `app/src/styles/`. Where this doc and the code disagree, the code is right.
>
> Kept because the reasoning behind each decision is not recorded anywhere else, and the `R2-*` rulings in [_context/decisions.md](_context/decisions.md) are cited from code comments.

_Status: draft v2 (2026-07-25)_

BandReady replicates OpenVoiceUI's proven design language — Inter Variable at 14px, a 240°-neutral HSL token palette with dark as the default theme, rounded-xl cards, shadcn-style CSS-custom-property tokens consumed through Tailwind — with one deliberate brand divergence: the primary shifts from OpenVoiceUI's indigo to a **teal at ~170°** so the two sibling apps are visually distinct at a glance. This doc pins every token value for both themes (verified against OpenVoiceUI's `index.css` / `tailwind.config.js` on 2026-07-25), specs the Electron window chrome, gives ASCII wireframes for the 9 core screens, inventories reused and new components (including a CVD-validated band-score color scale), and defines motion, interaction states, accessibility rules, voice-UI states, and copy tone. Architecture context: 01-architecture.md; the screens map to modules 04–10; provider forms follow 03-providers-and-settings.md.

## 1. Color tokens

Same 19-token structure as OpenVoiceUI (`packages/webui/src/index.css`), same Tailwind mapping (`hsl(var(--token))` so opacity modifiers like `bg-primary/25` work), `darkMode: ["class"]`, dark is the boot default (theme bootstraps before first paint, exactly like OpenVoiceUI's `bootstrapTheme().finally(mount)`).

**DECISION: teal primary.** BandReady keeps all 240°-hue neutrals verbatim but replaces indigo `243 75% 59%` with teal. Rationale: instant sibling-app differentiation; teal reads calm/growth (right for a study app); the chosen triples pass WCAG AA (light primary on white ≈ 4.6:1 with white text on it ≈ 4.6:1; dark primary with dark foreground ≈ 8.4:1). **Confirmed canonical by ruling R2-16 (resolving C17):** the exact HSL triples below are authoritative; `_context/decisions.md`'s UI-look bullet has been amended from "indigo" to "OpenVoiceUI's token system with BandReady's teal primary per 12-design-system.md", and 06 §9's stale "indigo" wording is corrected.

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 8%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 8%;
  --muted: 240 5% 96%;
  --muted-foreground: 240 4% 44%;
  --border: 240 6% 90%;
  --input: 240 6% 88%;
  --ring: 172 72% 30%;
  --primary: 172 72% 30%;          /* teal — was indigo 243 75% 59% in OpenVoiceUI */
  --primary-foreground: 0 0% 100%;
  --accent: 240 5% 96%;
  --accent-foreground: 240 10% 8%;
  --sidebar: 240 6% 98%;
  --sidebar-foreground: 240 10% 8%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 100%;
  --success: 142 71% 40%;
  --warning: 38 92% 50%;
}

.dark {
  --background: 240 6% 7%;
  --foreground: 0 0% 96%;
  --card: 240 5% 10%;
  --card-foreground: 0 0% 96%;
  --muted: 240 4% 15%;
  --muted-foreground: 240 5% 62%;
  --border: 240 4% 18%;
  --input: 240 4% 20%;
  --ring: 170 70% 45%;
  --primary: 170 70% 45%;          /* teal — was indigo 243 75% 66% */
  --primary-foreground: 240 10% 6%;
  --accent: 240 4% 15%;
  --accent-foreground: 0 0% 96%;
  --sidebar: 240 6% 5%;            /* sidebar darker than content — keep this OpenVoiceUI signature */
  --destructive: 0 63% 54%;
  --destructive-foreground: 0 0% 100%;
  --success: 142 60% 48%;
  --warning: 38 92% 55%;
}
```

### 1.1 BandReady extension tokens (new, same file)

```css
:root {
  /* band-score status buckets — validated (see §8.2) */
  --band-low: 0 72% 45%;        /* below 5.0 */
  --band-mid: 38 92% 44%;       /* 5.0–5.5 */
  --band-good: 217 80% 46%;     /* 6.0–6.5 */
  --band-strong: 170 85% 30%;   /* 7.0+ */
  --recording: 0 72% 51%;       /* mic-live dot; alias of destructive hue */
}
.dark {
  --band-low: 0 54% 49%;
  --band-mid: 39 73% 43%;
  --band-good: 220 82% 65%;
  --band-strong: 168 63% 40%;
  --recording: 0 63% 54%;
}
```

Rules: band colors are **status colors** — reserved for band semantics, never used as chart-series colors, never shown without the numeric band next to them (this is the required relief for the light-amber 2.7:1 contrast WARN). `success`/`warning`/`destructive` keep their OpenVoiceUI meanings (operation outcomes), so band buckets get their own tokens rather than overloading them.

## 2. Typography — verbatim from OpenVoiceUI

`@fontsource-variable/inter`; font stack `"Inter Variable", "Inter", system-ui, sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, monospace`.

```css
html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
body {
  font-size: 14px;
  line-height: 1.5;
  font-feature-settings: "cv11", "ss01";
  font-variation-settings: "opsz" 32;
  letter-spacing: -0.006em;
}
h1, h2, h3, h4 { font-weight: 600; letter-spacing: -0.02em; }
::selection { background: hsl(var(--primary) / 0.25); }
```

Scale (defaults, matching OpenVoiceUI usage): page title `text-lg` (18px) semibold; section heading `text-sm` semibold + `text-muted-foreground` uppercase variant for group labels; body `text-sm` (14px); the deliberate odd small sizes are kept: **`text-[13px]`** for secondary rows/buttons-sm, **`text-[11px]`** for meta/badges/timestamps. Reading passages and Writing editor use `text-[15px] leading-7` (new, reading comfort) with a user-adjustable 14/15/17px setting. Band numerals in BandScore use `font-semibold tabular-nums`.

## 3. Shape, elevation, focus, scrollbars

- Radii (tailwind.config.js): `lg: 0.75rem`, `md: 0.5rem`, `sm: 0.375rem`. Cards `rounded-xl`, buttons `rounded-lg`, badges `rounded-md`, inputs `rounded-lg`.
- Borders: global `* { @apply border-border }`; cards are `border bg-card` — elevation comes from borders + subtle `shadow-sm` on interactive surfaces, not heavy shadows. Modals/Drawers: `shadow-xl` + `bg-black/40` overlay.
- Focus: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background` on every interactive element. Never remove without replacement.
- Scrollbars: `.scrollbar-thin` utility verbatim from OpenVoiceUI (8px, `hsl(var(--border))` thumb, transparent track, `border-radius: 9999px`). Applied to passage panes, transcripts, answer sheets.

## 4. Motion

Reused keyframes (tailwind.config.js): `fade-in` (opacity 0→1, translateY 4px→0, 0.2s ease-out — applied to page mounts and cards) and `shimmer` (`100% { transform: translateX(100%) }` — skeleton sweep).

New keyframes:

```js
"timer-pulse": {                       // CircularTimer when ≤ 60s (writing) / ≤ 10s (speaking prep)
  "0%, 100%": { transform: "scale(1)" },
  "50%": { transform: "scale(1.04)" },
},                                     // animation: "timer-pulse 1s ease-in-out infinite"; color also shifts to warning
"band-reveal": {                       // feedback report score entrance
  from: { opacity: "0", transform: "scale(0.85)" },
  to:   { opacity: "1", transform: "scale(1)" },
},                                     // "band-reveal 0.5s cubic-bezier(0.16, 1, 0.3, 1)"
```

Band-reveal composite spec: badge scales in per keyframe above; the numeral counts up 0.0 → score over 900ms (rAF, easeOutCubic, one decimal); the circular ring sweeps via `stroke-dashoffset` transition 900ms with the same easing; sub-scores stagger in 80ms apart with `fade-in`. Under `prefers-reduced-motion: reduce` all of the above render instantly at final state; `timer-pulse` degrades to the color shift only. Global rule: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`.

## 5. Electron window chrome

**DECISION:** macOS uses `titleBarStyle: 'hiddenInset'` (native traffic lights inset over our sidebar, `trafficLightPosition: { x: 16, y: 12 }`); Windows/Linux use `frame: false` with a custom titlebar. One React `<TitleBar/>` renders per-platform (platform injected via preload `window.bandready.platform`).

```
Windows/Linux (height 36px, bg sidebar token):
┌────────────────────────────────────────────────────────┐
│ ◈ BandReady          [drag region]         ─  ▢  ✕    │
└────────────────────────────────────────────────────────┘
macOS: no bar; a 36px draggable strip tops the sidebar; content pads left of traffic lights.
```

```tsx
// app/src/components/shell/TitleBar.tsx   (R2-9 binding layout, 01 §7)
interface TitleBarProps { title?: string }   // defaults to "BandReady"; mock-exam mode shows "Mock Test — do not close"
```

CSS: `.titlebar { -webkit-app-region: drag; user-select: none; height: 36px }`; every button/menu inside gets `-webkit-app-region: no-drag`. Window buttons are 46×36px hit targets, `ghost` styling, close hover `bg-destructive text-destructive-foreground`. IPC (preload-exposed, no `nodeIntegration`): `win:minimize`, `win:maximize-toggle`, `win:close`; double-click on drag region → `win:maximize-toggle`. During a timed mock test, `win:close` routes through `useConfirm` ("End your mock test? This attempt will be scored as-is."). Min window 1024×700; layout is desktop-first, no mobile breakpoints, but panes reflow at <1200px (split views become stacked tabs).

## 6. Screen inventory + wireframes

Shell = OpenVoiceUI pattern: `Sidebar` (NAV array: Home, Speaking, Writing, Reading, Listening, Vocabulary, Progress, Settings) + `PageShell` content. Sidebar is darker than content (token above), 224px, collapsible to 64px icon rail. All screens `animate-fade-in` on mount.

### 6.1 Dashboard / Home

```
┌─────────┬──────────────────────────────────────────────────────────┐
│ ◈ Band  │  Good evening, Lux                      🔥 12-day streak │
│  Ready  │  ┌ Today's plan ────────────────────────────────────┐    │
│ ● Home  │  │ ▸ Speaking Part 2 practice (15 min)   [Start]    │    │
│  Speak  │  │ ▸ 24 vocab cards due                  [Review]   │    │
│  Write  │  │ ▸ Reading: matching headings drill    [Start]    │    │
│  Read   │  └──────────────────────────────────────────────────┘    │
│  Listen │  ┌ Band estimate ──────┐ ┌ Exam countdown ─────────┐     │
│  Vocab  │  │ Overall (6.5)       │ │ 34 days to target date  │     │
│  Progr. │  │ S 6.0 W 6.0         │ │ target band  7.0        │     │
│  Settgs │  │ R 7.0 L 6.5         │ │ [■■■■■■□□□□] on track   │     │
│         │  └─────────────────────┘ └─────────────────────────┘     │
└─────────┴──────────────────────────────────────────────────────────┘
```

Band estimates are BandScore badges; "Today's plan" comes from 10-curriculum-progress.md's scheduler.

### 6.2 Speaking Room (04-speaking-module.md) — three sequential states in one route

```
A) Pre-call device check          B) Live call                       C) Feedback report
┌───────────────────────┐  ┌────────────────────────────┐  ┌────────────────────────────┐
│  Ready to practice?   │  │ ● REC  Part 2   ◔ 01:23    │  │  Speaking — Part 2         │
│  Mic: [MacBook Mic ▾] │  │      ┌────────┐            │  │   ┌──────┐                 │
│  ▁▂▅▃▁ level meter    │  │      │ ≋≋≋≋≋≋ │ examiner   │  │   │ 6.5  │  band-reveal    │
│  Output: [Default ▾]  │  │      └────────┘ speaking   │  │   └──────┘                 │
│  [🔊 Test sound]      │  │  ┌ Cue card ─────────────┐ │  │  Fluency 6.5  Lexical 6.0  │
│                       │  │  │ Describe a place you  │ │  │  Grammar 6.5  Pronun. 7.0  │
│  Part: (1)(2)(3)(Full)│  │  │ like to visit…        │ │  │  ┌ transcript w/ error     │
│  [Start session]      │  │  └───────────────────────┘ │  │  │ highlights + examiner   │
│                       │  │  transcript (live) …       │  │  │ comments per turn …     │
│                       │  │  [🎤 mute]   [End session] │  │  [Practice again] [Home]   │
└───────────────────────┘  └────────────────────────────┘  └────────────────────────────┘
```

Header strip in (B): recording dot (`--recording`, 1s opacity pulse), part indicator badge, `CircularTimer`. Examiner tile shows `AudioWaveform` animated while bot speaks, mic-ring pulse on the user tile while user speaks (see §10).

### 6.3 Writing Desk (05-writing-module.md)

```
┌──────────────────────────────┬──────────────────────────────────────┐
│ Task 1 (Academic)  ◔ 17:42   │  [editor pane]                       │
│ ┌ Prompt ───────────────────┐│  The chart illustrates…              │
│ │ The chart below shows …   ││                                      │
│ │ ┌───────────────────────┐ ││                                      │
│ │ │  ChartRenderer (SVG)  │ ││                                      │
│ │ └───────────────────────┘ ││                                      │
│ │ Write at least 150 words. ││                                      │
│ └───────────────────────────┘│  words: 132 / 150   [Submit early]   │
└──────────────────────────────┴──────────────────────────────────────┘
```

Editor: plain `Textarea` styling at `text-[15px] leading-7`, no spellcheck/autocorrect in test mode (`spellCheck={false}`), word count `text-[13px] text-muted-foreground` turning `text-success` at minimum. Timer pulses under 60s. Feedback report reuses the Speaking report layout with `AnnotatedText` over the essay.

### 6.4 Reading Test (06-reading-module.md)

```
┌ Passage 2 of 3  ◔ 38:10 ────────────────────────────────────────────┐
├──────────────────────────────┬──────────────────────────────────────┤
│ [passage pane, scrollable]   │ Questions 14–19: Matching headings   │
│ The migration of Arctic      │ 14. Paragraph B  [vii ▾]             │
│ terns has long puzzled…      │ 15. Paragraph C  [___ ▾]             │
│                              │ …                                    │
│  (user highlights persist)   ├──────────────────────────────────────┤
│                              │ Palette: ①②③…⑬ ⑭ ⑮ … ㊵  [Finish]  │
└──────────────────────────────┴──────────────────────────────────────┘
```

Split is a draggable 50/50 divider; `QuestionPalette` pinned bottom-right; answered = filled primary, current = ring, flagged = warning dot, unanswered = outline.

### 6.5 Listening Player (07-listening-module.md)

```
┌ Section 2 of 4  ─ plays ONCE in test mode ──────────────────────────┐
│  ▶  ──────●──────────────  12:34 / 30:00     🔊 ▁▂▃                 │
│  ┌ Answer sheet ─────────────────────────────────────────────┐      │
│  │ 11. The visitor centre opens at [______]                  │      │
│  │ 12. Parking costs £[______] per day                       │      │
│  └───────────────────────────────────────────────────────────┘      │
│  Palette: ⑪⑫⑬…   [transcript: hidden in test mode]  [Finish]      │
└─────────────────────────────────────────────────────────────────────┘
```

Practice mode adds seek/replay + synced transcript; test mode locks seeking (scrubber becomes read-only progress).

### 6.6 Vocab Review (08-vocabulary-srs.md)

```
┌  Vocabulary review        card 7 / 24  [■■■□□□□□□□]  ┐
│              ┌───────────────────────┐               │
│              │      mitigate         │  (front)      │
│              │  /ˈmɪtɪɡeɪt/  🔊      │               │
│              └───────────────────────┘               │
│                 [Show answer]  (Space)               │
│  after flip:  [Again] [Hard] [Good] [Easy]           │
│                 1       2      3      4              │
└──────────────────────────────────────────────────────┘
```

Single centered card `max-w-md`, flip = fade-in swap (no 3D rotation — reduced-motion friendly). Grade buttons keyboard 1–4, Space flips.

### 6.7 Progress (10-curriculum-progress.md)

```
┌ Progress ───────────────────────────────────────────────────────────┐
│  Overall band (hero):  6.5   ▲ +0.5 since placement                 │
│  ┌ Speaking ─────┐ ┌ Writing ──────┐ ┌ Reading ──────┐ ┌ Listening ┐│
│  │ 7 ┼────────── │ │ (same small-  │ │               │ │           ││
│  │   │    ╭──●   │ │  multiple     │ │               │ │           ││
│  │ 6 ┼──●─╯      │ │  line chart)  │ │               │ │           ││
│  │ 5 ┼────────── │ │               │ │               │ │           ││
│  └───────────────┘ └───────────────┘ └───────────────┘ └───────────┘│
│  ┌ Study activity (last 12 weeks) ──────────────────────────┐       │
│  │ HeatmapCalendar ▦▦▨▨□▦▦ …                                │       │
└──┴──────────────────────────────────────────────────────────┴───────┘
```

Dataviz conventions (binding): **no pie charts anywhere**; band trends are line charts as **small multiples, one per skill, single series in the primary hue** (single series ⇒ no legend needed, title names it; avoids a 4-series categorical palette that would collide with reserved status colors); y-axis fixed 4.0–9.0 with gridlines every 0.5 band (major labels at whole bands, `text-[11px] text-muted-foreground`, recessive `border`-colored gridlines); 2px lines, ≥8px hoverable point markers, crosshair + tooltip on hover; never dual axes; heatmap is a 5-step sequential single-hue ramp of the primary (light: `hsl(170 40% 94%)` → `hsl(172 72% 26%)`; dark: `hsl(170 30% 14%)` → `hsl(170 70% 55%)`) with 2px surface gaps between cells and a tooltip (date, minutes, activities); every chart offers a "view as table" toggle.

### 6.8 Settings (03-providers-and-settings.md)

```
┌ Settings ───────────────────────────────────────────────────────────┐
│ [General] [Providers] [Audio] [Data]                                │
│  Providers:                                                         │
│  ┌ LLM ──────────────────────────────┐  exactly ONE of each —       │
│  │ Endpoint  [http://127.0.0.1:8080] │  fields rendered from the    │
│  │ API key   [••••••••]  Model [ ▾]  │  adapter config_spec, never  │
│  │ [Test connection]  ✓ reachable    │  hard-coded (OpenVoiceUI     │
│  └───────────────────────────────────┘  spec-driven form pattern)   │
│  ┌ STT … ┐ ┌ TTS … ┐ ┌ VAD tunables … ┐                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.9 Onboarding wizard (first run)

**10-curriculum-progress.md §2 owns the wizard end-to-end (R2-14, resolving C15): step list, order, question fields, defaults, and the placement offer are specced there** — 13-packaging-distribution.md's model-download step is folded in as a step within 10's wizard. This section owns only the visual/layout treatment of the steps 10 defines. This doc's earlier divergent flow (welcome/theme step, "25-min placement", "start at Band 5.5 plan") is deleted; theme is not a wizard step (dark boots by default, changeable later in Settings).

Layout: modal-free full-screen steps, one question per screen, progress dots top-center, Back/Continue bottom, `animate-fade-in` between steps. Per-step-kind visual specs:

- **Question steps** (variant, target band, exam date, self-rating, daily minutes + study days — fields and defaults per 10 §2): single centered card `max-w-md`; segmented controls / chips for enumerated answers (study-day chips Mon–Sun), a 0.5-stepped slider + numeral for target band, native date input with a "Not booked yet" toggle for exam date.
- **Engine detection / model download step** (folded in from 13 per R2-14; behavior per 03-providers-and-settings.md and 13 §7): detection report as a list of engine rows ("Found: Ollama ✓, mlx-lm ✗") with a one-click guided-setup Button per row; download progress renders as a determinate bar fed by job polling (18-api-contract.md §3), cancellable.
- **Final placement-offer screen** (copy semantics per 10 §2/§3 and R2-14): primary CTA "[Take the ~30-min placement test]" (recommended) vs secondary "[Skip — start from my self-rating]". The speaking sampler is individually skippable; skipping any section falls back to the self-assessed level for that skill (R2-14). No fixed "Band 5.5" fallback — skip seeds from `self_level`.
- Mic check is not a separate wizard step: DeviceCheck (§6.2 A, non-skippable per 02's gotcha 3) runs pre-call when the placement's speaking sampler — or the first speaking session — starts.

Escape hatch "Set up later" per 10's flow rules; every answer is editable afterwards in Settings → Profile.

## 7. Component inventory — reused from OpenVoiceUI

Port OpenVoiceUI's `components/ui/` kit wholesale into `app/src/components/ui/` (R2-9 layout; verified API, `Button.tsx` et al.):

| Component | Spec (unchanged) |
|---|---|
| Button | variants `primary\|secondary\|ghost\|outline\|destructive` × sizes `sm(h-8 px-3 text-[13px])\|md(h-9 px-4)\|lg(h-10 px-5)\|icon(h-9 w-9)`; `loading` overlays a spinner while keeping the label laid out invisible so width never reflows |
| Card | `rounded-xl border bg-card` + Header/Title/Content slots |
| Badge | `rounded-md text-[11px]` tonal variants |
| Input / Textarea / Select / Field | `bg-transparent border-input rounded-lg`, Field = label + control + error line |
| Modal / Drawer | Headless UI 2.2, fade+scale / slide-over |
| Spinner | Loader2 lucide spin |
| ConfirmProvider / useConfirm | promise-based confirm dialogs (used by mock-test close guard) |
| PageShell / Sidebar | NAV-array-driven shell; ViewToggle where list/grid applies |

Icons: lucide-react only. State: Zustand 5, tiny stores — the four global stores (session, settings, progress, srs) plus per-feature ephemeral stores under `app/src/features/<module>/store.ts`, attempt-in-progress state always feature-local (R2-23, 01 §7); pages fetch via `api.*` in `useEffect` with an `active` cancellation flag (no react-query) — keep the OpenVoiceUI convention.

## 8. New components

Paths follow the binding repo layout (R2-9, 01 §7): shared components under `app/src/components/`, module-specific components inside their feature folder.

```
app/src/components/
  shell/TitleBar.tsx
  band/BandScore.tsx        band/BandReveal.tsx
  timer/CircularTimer.tsx
  voice/AudioWaveform.tsx   voice/TranscriptBubble.tsx  voice/DeviceCheck.tsx
  test/QuestionPalette.tsx
  feedback/AnnotatedText.tsx
  charts/HeatmapCalendar.tsx  charts/BandTrend.tsx  charts/ChartRenderer.tsx
app/src/features/speaking/components/CueCard.tsx      # feature-local (01 §7)
```

### 8.1 Signatures (defaults chosen, flagged where notable)

```tsx
interface BandScoreProps { band: number; size?: "sm"|"md"|"lg"; label?: string }
// sm = inline 13px pill; md = 24px numeral; lg = 40px numeral in a ring. tabular-nums always.

interface CircularTimerProps { totalSec: number; remainingSec: number;
  warnAtSec?: number /* default 60; speaking prep uses 10 */; paused?: boolean }
// SVG ring, stroke = primary → warning under warnAtSec + timer-pulse; center mm:ss.

interface AudioWaveformProps { level: number /* 0..1 RMS */; active: boolean; bars?: number /* 5 */ }
// 5 rounded bars, heights follow level; idle = flat muted bars.

interface TranscriptBubbleProps { role: "examiner"|"candidate"; text: string; tMs: number;
  errors?: { start: number; end: number; kind: "grammar"|"lexical"|"pron"; note: string }[] }
// candidate bubbles right-aligned bg-muted; examiner left bg-card border. Error spans get a
// dashed underline (grammar=destructive, lexical=warning, pron=band-good hue) + tooltip note.

interface CueCardProps { topic: string; bullets: string[]; prepSecondsLeft?: number }
// exam-style card: border-2 border-primary/40, "You should say:" + bullets, prep countdown chip.

interface QuestionPaletteProps { count: number; current: number;
  status: Record<number, "answered"|"flagged"|"blank">; onJump(n: number): void }

interface AnnotatedTextProps { text: string;
  annotations: { start: number; end: number; severity: "error"|"improve"|"good"; note: string }[] }
// Writing feedback overlay; click span → side note; keyboard: n/p cycle annotations.

interface HeatmapCalendarProps { weeks?: number /* 12 */; data: { date: string; minutes: number }[] }

interface ChartRendererProps { spec: Task1ChartSpec }   // JSON shape owned by 05-writing-module.md
// deterministic SVG for Task 1 prompts: type "bar"|"line"|"table"|"process"|"map"; must render
// identically across platforms (it is exam content). Monochrome-ish: primary + muted grays only.
```

### 8.2 BandScore color mapping (validated)

Buckets, both themes validated 2026-07-25 with the dataviz palette validator (light: all pass, amber carries a contrast WARN → numeric label is mandatory relief; dark: all pass — hexes `#c03a3a #bf861e #5b8def #26a68d`):

| Band | Token | Light HSL | Dark HSL | Semantics |
|---|---|---|---|---|
| < 5.0 | `--band-low` | `0 72% 45%` | `0 54% 49%` | needs work |
| 5.0–5.5 | `--band-mid` | `38 92% 44%` | `39 73% 43%` | borderline |
| 6.0–6.5 | `--band-good` | `217 80% 46%` | `220 82% 65%` | approaching |
| ≥ 7.0 | `--band-strong` | `170 85% 30%` | `168 63% 40%` | on target |

Rendering: `sm` = tinted pill (`bg-[hsl(var(--band-*))]/12 text-[hsl(var(--band-*))]`), `md`/`lg` = solid fill with white (light) / near-black (dark) numeral. The number is always rendered — color is never the only encoding.

## 9. Interaction states

- **Loading:** skeletons, never spinners for page loads. Skeleton = `bg-muted rounded-md relative overflow-hidden` + absolutely-positioned gradient child animated with `shimmer 1.5s infinite`. Provide `SkeletonCard`, `SkeletonRow`, `SkeletonChart` (chart skeleton keeps final aspect ratio to avoid layout shift). Spinners only inside Buttons (`loading` prop).
- **Empty states:** centered in the content pane: lucide icon in a `bg-muted` circle, one-line heading, one line of guidance, one primary CTA. Copy examples — Vocab: "No cards due. Words from your practice sessions wait in your suggestions inbox — accept them to start reviewing." [Review suggestions] (nothing enters the SRS silently, R2-5); Progress: "Complete your first scored practice to see your band trend." [Start placement test].
- **Error states:**
  - *Mic permission* (port OpenVoiceUI `describeError()` mapping `NotAllowedError`/`NotFoundError`): inline card in DeviceCheck, not a toast — "BandReady can't access your microphone. Open System Settings → Privacy & Security → Microphone and enable BandReady, then click Retry." [Open System Settings] (deep-link via `shell.openExternal`) [Retry].
  - *Provider unreachable:* banner at top of the affected module (not global): "Your LLM endpoint (http://127.0.0.1:11434) isn't responding. Speaking and scoring are paused." [Open Settings] [Retry]. Detected via the adapter `verify()` path from 03-providers-and-settings.md. Reading/Listening practice with pre-scored answer keys keeps working — say so in the banner.
  - *Mid-session drop:* the session machine (04 §3.1, per R2-11) goes `RECONNECTING` (grace spinner + "Reconnecting…" chip, 15 s server-side grace) then `ERROR`; the `ERROR` overlay preserves the transcript and offers [Reconnect]; partial session is saved per 11-data-model.md.
- **Destructive confirms:** always `useConfirm`, destructive Button variant, verb-first ("Delete profile", never "OK").

## 10. Voice-UI states (Speaking Room)

Base transport phases come verbatim from OpenVoiceUI `LiveCall.tsx`: `Phase = "idle" | "connecting" | "connected" | "error"` mapped from `usePipecatClientTransportState()`. BandReady layers the examiner-session state machine on top (only meaningful while `connected`). **Phase names are 04 §3.1's canonical vocabulary (R2-11, resolving C11) — this doc's earlier `part2-talk` strings are repealed.** The renderer never advances state: phases arrive as `state` events on `WS /api/v1/speaking/sessions/{id}/events` (18-api-contract.md §5) and the UI mirrors them:

```
IDLE → CONNECTING → P1_INTRO → P1_QA
     → P2_INTRO → P2_PREP (60s) → P2_LONG_TURN (120s) → P2_ROUNDING
     → P3_DISCUSS → WRAP_UP → SCORING → FEEDBACK

(any point: RECONNECTING, ABORTED, ERROR; Topic Drill: COACH_QA, COACH_FEEDBACK; Quick Chat: CHAT)
```

Device check (§6.2 A) is a pre-call UI screen, not a session phase — the machine starts at `IDLE`.

| Signal | Source | UI |
|---|---|---|
| Examiner speaking | `RTVIEvent.BotStartedSpeaking/BotStoppedSpeaking` | AudioWaveform animates on examiner tile; status "Examiner is speaking" |
| Candidate speaking | local mic RMS + VAD | 2px primary ring pulse on user tile; "Listening…" label |
| Examiner thinking | LLM latency window (bot stopped, no TTS yet, >600ms) | three-dot `text-muted-foreground` pulse |
| Long silence | no user speech 8s while examiner waiting | gentle hint chip: "Take your time — answer when ready." (suppressed in mock mode) |
| Recording | session active | `--recording` dot in header, 1s opacity pulse |

Non-negotiables carried from 02-voice-pipeline.md: `initDevices()` before `connect()` (gotcha 3) means DeviceCheck is not skippable; transcript comes from `usePipecatConversation()`; `<PipecatClientAudio />` mounts once at Speaking Room root. Interruptions are allowed (pipeline `allow_interruptions=True`) — the UI must visibly hand the turn over: examiner waveform freezes the moment candidate speech starts.

## 11. Accessibility

- **Keyboard-first test players:** Reading/Listening fully operable without a mouse — `Tab` through answers, `←/→` prev/next question, `Ctrl/Cmd+←/→` prev/next passage/section, `F` flag, `Space` play/pause (Listening, practice mode), `1–9` jump via palette when it has focus. Vocab: `Space` flip, `1–4` grade. All shortcuts listed in a `?`-key overlay.
- **Reduced motion:** global media-query kill switch (§4); count-ups render final values; shimmer becomes a static muted block.
- **Contrast:** WCAG AA on both themes for all text tokens (muted-foreground on background: light `240 4% 44%` ≈ 4.6:1, dark `240 5% 62%` ≈ 7:1 — both pass); primary combinations verified in §1; band amber-on-light is the one sub-3:1 mark color and always carries its numeral (§8.2). Any new token pair must be checked before merge (14-testing-strategy.md adds an automated axe pass).
- **Captions/transcripts:** live transcript in Speaking is always available (collapsible, never removed); Listening practice mode offers synced transcript; all feedback audio snippets pair with text.
- **Screen reader:** timers use `aria-live="off"` with a polite announcement at 5-min/1-min marks (not every second); QuestionPalette buttons get `aria-label="Question 14, answered"`; waveforms are `aria-hidden` with a text status sibling.
- Focus rings per §3; focus trapped in Modal/Drawer (Headless UI provides this).

## 12. Copy tone

Calm, encouraging, concrete; second person; no exclamation marks in feedback; **exam-serious in mock mode** (mock sessions drop encouragement chips and use exam-register instructions verbatim-style: "You will have one minute to prepare. You can make notes if you wish."). Feedback formula: strength first, then one specific improvement with an example from the candidate's own words. Never "Bad grammar" — instead: "You used past tense consistently. One pattern to work on: articles before singular nouns — you said 'I went to store' → 'the store'." Buttons verb-first ("Start session", "Review 24 cards"). Numbers over adjectives ("+0.5 since placement", not "great progress"). Error copy states what happened + one action, never blames the user.

## Open questions

1. Sidebar behavior during timed tests: auto-collapse to the icon rail (recommended default) or fully hide with a locked "test mode" bar? Affects perceived exam realism vs. escape-hatch accessibility.
2. Should the band-bucket thresholds be user-relative (colored against the user's *target* band, e.g. amber = 1.0 below target) instead of the absolute scale in §8.2? Absolute is the shipped default; relative may motivate better and needs only a mapping change.
3. Runtime theme customization: OpenVoiceUI lets users override tokens via a validated settings table. Do we expose that in v1 or ship fixed light/dark only (current default: fixed) — matters for 11-data-model.md's settings schema.
4. Windows 11 snap layouts require either native frame or `titleBarOverlay`; with `frame:false` we lose the snap flyout on the maximize button. Accept the loss (default) or adopt `titleBarStyle:'hidden'` + overlay on Windows?
5. Does ChartRenderer also need a hand-drawn/print texture mode for Task 1 map/process types, or is monochrome SVG sufficient for v1?
