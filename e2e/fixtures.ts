/**
 * Shared E2E fixtures — 14-testing-strategy.md §7.3.
 *
 * Everything here talks to the REAL sidecar over HTTP (never to SQLite), so a
 * seeded fixture exercises the same code path the app does. The one exception
 * is `seedSpeakingReport`, which uses the mock-only transcript seam because a
 * browser cannot inject a transcript into the voice runtime any other way.
 */
import {
  test as base,
  expect,
  request as pwRequest,
  type APIRequestContext,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";
import { SIDECAR_TOKEN, SIDECAR_URL } from "./env";

export { expect };

// --------------------------------------------------------------------------- types

export interface PageErrors {
  /** `console.error(...)` lines emitted by the page. */
  console: string[];
  /** Uncaught exceptions and unhandled promise rejections. */
  uncaught: string[];
  /** Everything, for a readable assertion message. */
  all(): string[];
}

export interface Seeder {
  api: APIRequestContext;
  /** Profile past the wizard with self-rated estimates and a generated plan. */
  ensureOnboarded(overrides?: Partial<OnboardProfile>): Promise<void>;
  /** True when `/progress/summary` reports no plan (the app's first-run signal). */
  isFirstRun(): Promise<boolean>;
  selectMockProviders(): Promise<void>;
  seedVocabSuggestions(terms?: string[]): Promise<string[]>;
  seedSpeakingReport(): Promise<{ sessionId: string; reportId: string | null }>;
  seedWritingAttempt(opts?: { essay?: string; promptId?: string }): Promise<string>;
  seedReadingAttempt(): Promise<string>;
  seedListeningAttempt(): Promise<string>;
  seedActivity(days?: number): Promise<void>;
  firstReadingTestId(): Promise<string>;
  firstListeningTestId(): Promise<string>;
  promptIdFor(taskType: "ac_task1" | "gt_task1" | "task2"): Promise<string>;
}

export interface OnboardProfile {
  target_band: number;
  exam_date: string | null;
  exam_format: "academic" | "general_training";
  self_level: string;
  daily_minutes: number;
  study_days: string[];
}

// --------------------------------------------------------------------------- helpers

const DEFAULT_PROFILE: OnboardProfile = {
  target_band: 7,
  exam_date: isoDaysFromNow(70),
  exam_format: "academic",
  self_level: "intermediate",
  daily_minutes: 60,
  study_days: ["mon", "tue", "wed", "thu", "fri"],
};

export function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `/#/reading` — the app uses a HashRouter, so every URL goes through `#`. */
export function hashUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/#${clean}`;
}

/** Navigate to an app route and wait for the shell to paint. */
export async function gotoRoute(page: Page, path: string): Promise<void> {
  await page.goto(hashUrl(path));
  await expect(page.locator("main")).toBeVisible();
}

async function json<T>(res: { ok(): boolean; status(): number; text(): Promise<string> }): Promise<T> {
  const raw = await res.text();
  if (!res.ok()) {
    throw new Error(`sidecar responded ${res.status()}: ${raw.slice(0, 400)}`);
  }
  return raw ? (JSON.parse(raw) as T) : (undefined as T);
}

/** The transcript the mock scorer turns into a full speaking report. */
export const SPEAKING_TRANSCRIPT = {
  turns: [
    { role: "assistant", text: "Can you tell me your full name, please?", t_ms: 500 },
    {
      role: "user",
      text: "My name is Sam Perera.",
      t_ms: 3_000,
      part: 1,
      phase: "P1_QA",
      segments: [{ t_start_ms: 1_500, t_end_ms: 2_800 }],
    },
    { role: "assistant", text: "Do you live in a house or an apartment?", t_ms: 5_000 },
    {
      role: "user",
      text:
        "um I live in a small apartment near the coast and my daily commute takes an hour " +
        "because there were very much cars in the morning",
      t_ms: 20_000,
      part: 1,
      phase: "P1_QA",
      segments: [
        { t_start_ms: 6_500, t_end_ms: 12_000 },
        { t_start_ms: 14_000, t_end_ms: 19_500 },
      ],
    },
    { role: "assistant", text: "Here is your topic.", t_ms: 22_000 },
    {
      role: "user",
      text: new Array(6).fill("I often go to the beach in the evening").join(" "),
      t_ms: 120_000,
      part: 2,
      phase: "P2_LONG_TURN",
      segments: [
        { t_start_ms: 30_000, t_end_ms: 80_000 },
        { t_start_ms: 82_000, t_end_ms: 118_000 },
      ],
    },
  ],
};

/**
 * A realistic Task 2 answer, long enough to clear the 250-word minimum.
 *
 * The first sentence deliberately reproduces the three errors the mock
 * evaluation fixture quotes ("In nowadays", "peoples are agree with this
 * opinion", "goverment"), so the report's inline annotations have real text to
 * resolve their offsets against — that resolution is the thing 05 §7 specifies
 * and the thing an E2E test should actually exercise.
 */
export const SAMPLE_ESSAY = [
  "In nowadays, transport policy divides every large city, and peoples are agree with this",
  "opinion that the goverment must decide where the money goes.",
  "Some people believe that governments should invest heavily in public transport, while",
  "others argue that the money is better spent on roads. In my view, a modern city cannot",
  "function without a reliable network of buses and trains, and the evidence from cities",
  "that have made that investment is persuasive.",
  "",
  "The first reason is congestion. When a city grows without a rail or bus spine, every new",
  "resident adds another car to a fixed amount of road space, and journey times lengthen for",
  "everyone. Cities such as Verdon, which opened three metro lines in a decade, reported a",
  "measurable fall in peak-hour delays because commuters could choose a faster option.",
  "Building more roads, by contrast, tends to attract additional traffic until the original",
  "congestion returns, a phenomenon transport planners call induced demand.",
  "",
  "The second reason is fairness. A household that cannot afford a car is effectively",
  "excluded from jobs and education if the only reliable way to travel is by driving. Public",
  "transport therefore does more than move people: it widens the labour market and reduces",
  "the isolation of poorer districts. Road spending, however necessary for freight, does not",
  "deliver that social benefit as directly.",
  "",
  "There is nevertheless a legitimate argument for maintaining roads, since ambulances,",
  "delivery vehicles and rural communities depend on them, and a neglected road network is",
  "expensive to repair later. The sensible policy is not to abandon roads but to stop",
  "expanding them in dense urban areas where a train would carry the same passengers more",
  "cheaply.",
  "",
  "In conclusion, while road maintenance remains essential, I firmly believe that the larger",
  "share of transport budgets should go to public transport, because it eases congestion and",
  "gives every resident, regardless of income, a practical way to reach work and study.",
].join(" ");

// --------------------------------------------------------------------------- seeder

function makeSeeder(api: APIRequestContext): Seeder {
  const seeder: Seeder = {
    api,

    async isFirstRun() {
      const summary = await json<{ plan?: { id?: string | null } | null; plan_id?: string | null }>(
        await api.get("/api/v1/progress/summary"),
      );
      const planId = summary.plan_id ?? summary.plan?.id ?? null;
      return planId === null || planId === undefined;
    },

    async ensureOnboarded(overrides = {}) {
      if (!(await seeder.isFirstRun())) return;
      const profile = { ...DEFAULT_PROFILE, ...overrides };
      await json(await api.post("/api/v1/placement/start", { data: profile }));
      await json(await api.post("/api/v1/placement/skip", { data: {} }));
    },

    async selectMockProviders() {
      // The settings document is flat (`llm`/`stt`/`tts` at the top level) and
      // the preset's own defaults have to travel with it — `preset` alone leaves
      // the previous base_url in place and verification then dials Ollama.
      await json(
        await api.patch("/api/v1/settings", {
          data: {
            llm: { preset: "mock_llm", base_url: "mock://llm", model: "mock-model-1" },
            stt: { preset: "mock_stt", engine: "mock", base_url: "mock://stt", model: "mock-stt" },
            tts: { preset: "mock_tts", engine: "mock", base_url: "mock://tts", voice: "mock_voice" },
          },
        }),
      );
    },

    async seedVocabSuggestions(terms = ["mitigate", "prevalent", "subsequently"]) {
      const body = {
        items: terms.map((term) => ({
          term,
          definition: `A seeded definition for ${term}.`,
          example_sentences: [`The council tried to ${term} the problem.`],
          source: { kind: "e2e", detail: "seeded by the Playwright suite" },
        })),
      };
      const res = await json<{ ids: string[] }>(
        await api.post("/api/v1/vocab/suggestions", { data: body }),
      );
      return res.ids;
    },

    async seedSpeakingReport() {
      // The sidecar runs one live session at a time (18 §4.7). A session left
      // open by an earlier spec answers 409 with its id — tear it down first.
      let res = await api.post("/api/v1/speaking/sessions", { data: { mode: "full_mock" } });
      if (res.status() === 409) {
        const detail = ((await res.json()) as { detail?: string }).detail ?? "";
        const stale = /ss_[A-Z0-9]+/.exec(detail)?.[0];
        if (stale) {
          await api.post(`/api/v1/speaking/sessions/${stale}/end`, { data: { score: false } });
        }
        res = await api.post("/api/v1/speaking/sessions", { data: { mode: "full_mock" } });
      }
      const started = await json<{ session_id: string }>(res);
      const id = started.session_id;
      await json(
        await api.post(`/api/v1/speaking/sessions/${id}/transcript`, {
          data: SPEAKING_TRANSCRIPT,
        }),
      );
      await json(await api.post(`/api/v1/speaking/sessions/${id}/end`, { data: { score: false } }));
      let reportId: string | null = null;
      const scored = await api.post(`/api/v1/speaking/sessions/${id}/score`);
      if (scored.ok()) {
        const report = (await scored.json()) as { id?: string; report_id?: string };
        reportId = report.report_id ?? report.id ?? null;
      }
      return { sessionId: id, reportId };
    },

    async promptIdFor(taskType) {
      const bank = await json<{ items: { id: string; task_type: string }[] }>(
        await api.get(`/api/v1/writing/prompts?task_type=${taskType}&limit=5`),
      );
      const first = bank.items[0];
      if (!first) throw new Error(`no ${taskType} prompts in the content pack`);
      return first.id;
    },

    async seedWritingAttempt(opts = {}) {
      const promptId = opts.promptId ?? (await seeder.promptIdFor("task2"));
      const created = await json<{ attempt_id: string }>(
        await api.post("/api/v1/writing/attempts", {
          data: { prompt_id: promptId, mode: "practice" },
        }),
      );
      const id = created.attempt_id;
      await json(
        await api.patch(`/api/v1/writing/attempts/${id}`, {
          data: { essay_text: opts.essay ?? SAMPLE_ESSAY, seconds_elapsed: 900 },
        }),
      );
      const submitted = await json<{ job_id?: string }>(
        await api.post(`/api/v1/writing/attempts/${id}/submit`, {
          data: { acknowledge_warnings: true },
        }),
      );
      if (submitted?.job_id) await waitForJob(api, submitted.job_id);
      return id;
    },

    async firstReadingTestId() {
      const tests = await json<{ items: { id: string }[] }>(
        await api.get("/api/v1/reading/tests"),
      );
      const first = tests.items[0];
      if (!first) throw new Error("no reading tests in the content pack");
      return first.id;
    },

    async firstListeningTestId() {
      const tests = await json<{ items: { id: string }[] }>(
        await api.get("/api/v1/listening/tests"),
      );
      const first = tests.items[0];
      if (!first) throw new Error("no listening tests in the content pack");
      return first.id;
    },

    async seedReadingAttempt() {
      const testId = await seeder.firstReadingTestId();
      const attempt = await json<{ attempt_id?: string; id?: string; questions?: unknown[] }>(
        await api.post("/api/v1/reading/attempts", {
          data: { test_id: testId, mode: "full" },
        }),
      );
      const id = (attempt.attempt_id ?? attempt.id) as string;
      const review = await json<{ questions?: { id: string; answers?: string[] }[] }>(
        await api.get(`/api/v1/reading/attempts/${id}`),
      );
      void review;
      await json(await api.post(`/api/v1/reading/attempts/${id}/submit`, { data: {} }));
      return id;
    },

    async seedListeningAttempt() {
      const testId = await seeder.firstListeningTestId();
      const attempt = await json<{ attempt_id?: string; id?: string }>(
        await api.post("/api/v1/listening/attempts", {
          data: { test_id: testId, mode: "practice" },
        }),
      );
      const id = (attempt.attempt_id ?? attempt.id) as string;
      await json(await api.post(`/api/v1/listening/attempts/${id}/submit`, { data: {} }));
      return id;
    },

    async seedActivity(days = 5) {
      for (let i = 0; i < days; i += 1) {
        const day = new Date();
        day.setDate(day.getDate() - i);
        await api.post("/api/v1/progress/activity", {
          data: { date: day.toISOString().slice(0, 10), minutes: 30 + i },
        });
      }
    },
  };
  return seeder;
}

/** Poll the §3 job convention until the job leaves the queue. */
export async function waitForJob(
  api: APIRequestContext,
  jobId: string,
  timeoutMs = 90_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await json<{ state: string; result?: Record<string, unknown>; error?: unknown }>(
      await api.get(`/api/v1/jobs/${jobId}`),
    );
    if (job.state === "done") return job.result ?? {};
    if (job.state === "error" || job.state === "cancelled") {
      throw new Error(`job ${jobId} ended ${job.state}: ${JSON.stringify(job.error)}`);
    }
    if (Date.now() > deadline) throw new Error(`job ${jobId} did not finish in ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

// --------------------------------------------------------------------------- fixtures

/** Console noise that is never a defect and would otherwise fail the smoke spec. */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[vite\]/i,
  /Failed to load resource: net::ERR_ABORTED/i,
  /React Router Future Flag/i,
];

export const test = base.extend<{
  sidecar: APIRequestContext;
  seed: Seeder;
  errors: PageErrors;
}>({
  sidecar: async ({}, use) => {
    const ctx = await pwRequest.newContext({
      baseURL: SIDECAR_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${SIDECAR_TOKEN}` },
    });
    await use(ctx);
    await ctx.dispose();
  },

  seed: async ({ sidecar }, use) => {
    await use(makeSeeder(sidecar));
  },

  // Auto-attached so every spec fails loudly on an uncaught exception, and the
  // smoke spec can assert on the collected lists directly.
  errors: [
    async ({ page }, use) => {
      const consoleErrors: string[] = [];
      const uncaught: string[] = [];
      page.on("console", (msg: ConsoleMessage) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
        consoleErrors.push(text);
      });
      page.on("pageerror", (err) => uncaught.push(`${err.name}: ${err.message}`));
      const errors: PageErrors = {
        console: consoleErrors,
        uncaught,
        all: () => [...uncaught, ...consoleErrors],
      };
      await use(errors);
    },
    { auto: true },
  ],
});

/** Assert the app never rendered its error boundary on the current screen. */
export async function expectNoErrorBoundary(page: Page): Promise<void> {
  await expect(
    page.getByText("Something went wrong on this screen", { exact: false }),
  ).toHaveCount(0);
}
