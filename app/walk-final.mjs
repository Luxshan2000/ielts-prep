import { chromium } from "@playwright/test";

const APP = "http://127.0.0.1:5273";
const API = "http://127.0.0.1:8710/api/v1";
const TOKEN = "dev-token";
const SHOT = "/tmp/br-rv1";

const log = (...a) => console.log(...a);
async function api(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return [r.status, j];
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("UNCAUGHT " + e.message));

// -- 0. onboarding: the app needs a profile with a plan before the shell settles.
{
  const [st, sum] = await api("GET", "/progress/summary");
  log("progress/summary ->", st, "has plan:", Boolean(sum && sum.plan));
  if (!sum || !sum.plan) {
    const [c] = await api("POST", "/progress/onboarding", {
      target_band: 7, exam_date: null, exam_format: "general_training",
      self_level: "intermediate", daily_minutes: 45,
      study_days: ["mon", "tue", "wed", "thu", "fri"],
    });
    log("onboarding ->", c);
  }
}

async function go(hash, waitFor) {
  await page.goto(APP + "/#" + hash, { waitUntil: "domcontentloaded" });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
}
const shot = async (name) => {
  await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: false });
  log("  screenshot ->", `${SHOT}/${name}.png`);
};

// ---------------------------------------------------------------- 1. the browser
log("\n=== 1. Reading browser ===");
await go("/reading", "text=Reading");
const bodyText = await page.locator("body").innerText();
log("  GT tests visible in list?", /General Training Test/.test(bodyText));
log("  Academic tests visible?", /Academic Reading Test/.test(bodyText));
await shot("01-browser");

// ---------------------------------------------------------------- 2. GT test renders multi-text S1
log("\n=== 2. GT Section 1 (multi-text) ===");
const [, started] = await api("POST", "/reading/attempts", { test_id: "rt_gt_01", mode: "full" });
const attemptId = started.attempt_id;
log("  attempt", attemptId);
await go(`/reading/attempt/${attemptId}`, "text=Around Ashfield");
const t = await page.locator("body").innerText();
const headings = [
  "Autumn short courses at Norland Community Centre",
  "Ashfield Central Library: using your card",
  "Notice to residents: changes to recycling collections",
];
for (const h of headings) log(`  text block heading "${h.slice(0, 40)}…" present:`, t.includes(h));
log("  question 1 prompt present:", t.includes("a course that charges the same for everyone"));
log("  teaching leaked into the player?", /decision_rule|why_tempting|reusable_rule/.test(await page.content()));
await shot("02-gt-section1");

// ---------------------------------------------------------------- 3. answer + submit
log("\n=== 3. Answer and submit ===");
// Answer through the API for the questions we do not click, so the review has substance.
const passages = await (await fetch(
  "http://127.0.0.1:8710/api/v1/reading/tests/rt_gt_01", { headers: { Authorization: `Bearer ${TOKEN}` } }
)).json();

// Type into the first free-text input the player renders, to prove the UI path works.
const inputs = page.locator('input[type="text"]:visible, input:not([type]):visible');
const nInputs = await inputs.count();
log("  visible answer inputs on passage 1:", nInputs);
const radios = page.locator('input[type="radio"]:visible, button[role="radio"]:visible');
log("  visible choice controls on passage 1:", await radios.count());
if (nInputs > 0) {
  await inputs.first().fill("C");
  log("  typed into the first input");
}
await page.waitForTimeout(800);
await shot("03-answered");

// Fill a real half-key and submit through the API (the UI submit needs all three passages).
const key = {};
{
  const rows = (await (await fetch("http://127.0.0.1:8710/api/v1/reading/tests/rt_gt_01?mode=review",
    { headers: { Authorization: `Bearer ${TOKEN}` } })).json());
  if (rows.passages) {
    for (const p of rows.passages) for (const g of p.question_groups) for (const q of g.questions) {
      const v = q.answers?.[0]?.value ?? q.answers?.[0];
      if (v != null) key[String(q.number)] = v;
    }
  }
}
log("  key recovered from review mode?", Object.keys(key).length, "(0 means the D1 gate refused, which is correct pre-submit)");
const answers = {};
let i = 0;
// Fall back to the pack file if review mode is (correctly) locked.
if (Object.keys(key).length === 0) {
  const fs = await import("node:fs");
  const byId = {};
  for (const line of fs.readFileSync(
    "/Users/luxshanthavarasa/Desktop/Lux's Projects/bandready/content/core-en/data/reading_passages.jsonl", "utf8"
  ).trim().split("\n")) { const r = JSON.parse(line); byId[r.id] = r; }
  for (const pid of ["rp_gt_01_s1", "rp_gt_01_s2", "rp_gt_01_s3"])
    for (const g of byId[pid].passage_json.question_groups)
      for (const q of g.questions) key[String(q.number)] = q.answers[0].value ?? q.answers[0];
}
for (const [n, v] of Object.entries(key)) answers[n] = i++ < 26 ? v : "zzz";
await api("PATCH", `/reading/attempts/${attemptId}`, { answers });
const [ss, rec] = await api("POST", `/reading/attempts/${attemptId}/submit`, { duration_s: 3400 });
log("  submit ->", ss, `raw ${rec.raw_score}/${rec.total_questions} band ${rec.band} (format ${rec.format})`);

// ---------------------------------------------------------------- 4. review + highlight
log("\n=== 4. Review: worked solution + highlighted span ===");
await go(`/reading/review/${attemptId}`, "text=Review");
await page.waitForTimeout(2500);
const rt = await page.locator("body").innerText();
log("  shows a band:", /Band\s*[0-9]/.test(rt));
log("  shows an explanation:", rt.length > 500);
// mark/highlight elements
const marks = await page.locator("mark, [data-evidence], .evidence, [class*=highlight]").count();
log("  highlight elements on the page:", marks);
const solution = await page.locator("text=/paraphrase|Why the others|decision|trap/i").count();
log("  solution-card language present:", solution);
await shot("04-review");

// try opening a per-question solution
const expanders = page.locator('button:has-text("Show"), button:has-text("solution"), button:has-text("Why"), summary');
log("  expandable solution controls:", await expanders.count());
if (await expanders.count()) {
  await expanders.first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const after = await page.locator("body").innerText();
  log("  after expanding, distractor language present:", /tempting|wrong because|Why the other/i.test(after));
  const m2 = await page.locator("mark, [data-evidence]").count();
  log("  highlight elements after expanding:", m2);
  await shot("05-review-solution");
}

// ---------------------------------------------------------------- 5. coach gate
log("\n=== 5. Coach gate ===");
// rp_gt_03_s1 has never been attempted by this profile.
await go("/reading/coach/rp_gt_03_s1", "body");
await page.waitForTimeout(2000);
const ct = await page.locator("body").innerText();
log("  locked language present:", /lock|Sit the passage|before you|attempt first|not yet/i.test(ct));
log("  leaks a worked solution?", /why_tempting|Why the other options|decision rule/i.test(ct));
await shot("06-coach-locked");

await go("/reading/coach/rp_gt_01_s1", "body");
await page.waitForTimeout(2000);
const ct2 = await page.locator("body").innerText();
log("  (attempted passage) unlocked, strategy visible:", /strateg|skim|paraphrase/i.test(ct2));
await shot("07-coach-unlocked");

// ---------------------------------------------------------------- 6. the mock
log("\n=== 6. The 60-minute mock ===");
await go("/reading/mock", "body");
await page.waitForTimeout(1500);
await shot("08-mock-preflight");
const [ms, mock] = await api("POST", "/reading/mock/sessions", { module: "general_training" });
log("  mock opened ->", ms, mock.mock_id, mock.format, "test", mock.test_id);
await go(`/reading/mock/sitting/${mock.mock_id}`, "body");
await page.waitForTimeout(2500);
const mt = await page.locator("body").innerText();
const mhtml = await page.content();
log("  sitting renders the paper:", mt.length > 400);
log("  coaching language on the sitting page:", /decision rule|why_tempting|worked solution|strategy card|skim plan/i.test(mt));
log("  teaching payload in the DOM:", /decision_rule|why_tempting|reusable_rule|paraphrase_link/.test(mhtml));
await shot("09-mock-sitting");

// server-side proof while the sitting is live
log("  --- server-side, sitting live ---");
for (const [m, p] of [["GET", "/reading/coach/passages/rp_gt_01_s1/teaching"], ["GET", "/reading/practice/catalogue"], ["GET", "/dictionary/peat"], ["GET", "/reading/coach/strategy"]]) {
  const [st, d] = await api(m, p);
  const leak = JSON.stringify(d || {});
  log(`   ${p} -> ${st}${st === 200 ? `  solutions_available=${d.solutions_available ?? "n/a"}` : `  ${(d && d.detail || "").slice(0, 70)}`}`);
}
await api("POST", `/reading/mock/sessions/${mock.mock_id}/abandon`);
const [ds] = await api("GET", "/dictionary/peat");
log("  dictionary after abandoning ->", ds);

// ---------------------------------------------------------------- 7. drills
log("\n=== 7. Drills surface ===");
await go("/reading/drills", "body");
await page.waitForTimeout(2500);
const dt = await page.locator("body").innerText();
log("  drills page renders:", dt.length > 300);
log("  mentions trap/paraphrase kinds:", /trap|paraphrase|skim|scan/i.test(dt));
await shot("10-drills");

log("\nconsole errors:", errs.length);
errs.slice(0, 12).forEach((e) => log("   ", e.slice(0, 220)));
await browser.close();
