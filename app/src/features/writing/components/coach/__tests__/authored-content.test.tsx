/**
 * The coach, run against the **authored content** rather than a fixture.
 *
 * A fixture proves the components render something; it cannot prove they render
 * what the content agents actually wrote. This mounts the three complete prompts in
 * `staging-writing/TEMPLATE.json` — one per task type, authored to the standard —
 * and checks the two things that break silently in the wild:
 *
 *  - **every annotation span anchors.** The UI locates notes by exact string search,
 *    so a span with a retyped comma disappears from the model with no error anywhere;
 *  - **each brief reaches its own screen.** An `essay_brief` on a letter, or an
 *    `overview_brief` the coach never reads, is a payload authored into a void.
 *
 * The staging directory is not part of the app build, so if it is absent (a
 * content-free checkout) the suite says so and skips rather than failing.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageBankPanel } from "../LanguageBank";
import { ModelAnswerViewer } from "../ModelAnswers";
import { PlanPanel } from "../PlanPanel";
import { placeSpans } from "../spans";
import { hasTeaching, type WritingTeaching } from "../types";
import type { TaskType } from "../../../store";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(
  here,
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
  "content",
  "core-en",
  "staging-writing",
  "TEMPLATE.json",
);

interface StagedPrompt {
  id: string;
  task_type: TaskType;
  genre: string;
  teaching_json: WritingTeaching;
}

const staged: StagedPrompt[] = existsSync(TEMPLATE)
  ? (JSON.parse(readFileSync(TEMPLATE, "utf8")).prompts as StagedPrompt[])
  : [];

describe.skipIf(staged.length === 0)("the authored teaching payload", () => {
  it("reads as a teaching payload at all", () => {
    expect(staged).toHaveLength(3);
    for (const prompt of staged) expect(hasTeaching(prompt.teaching_json)).toBe(true);
  });

  it("carries exactly one brief, and it is the one its task type needs", () => {
    for (const prompt of staged) {
      const t = prompt.teaching_json;
      const briefs = [t.overview_brief, t.letter_brief, t.essay_brief].filter(Boolean);
      expect(briefs).toHaveLength(1);
      if (prompt.task_type === "ac_task1") expect(t.overview_brief).toBeTruthy();
      if (prompt.task_type === "gt_task1") expect(t.letter_brief).toBeTruthy();
      if (prompt.task_type === "task2") expect(t.essay_brief).toBeTruthy();
    }
  });

  it("anchors every annotation span in its own model text", () => {
    for (const prompt of staged) {
      for (const model of prompt.teaching_json.model_answers ?? []) {
        const { unresolved } = placeSpans(model.text, model.annotations ?? []);
        expect(
          unresolved.map((a) => `${prompt.id} band ${model.band_target}: ${a.span}`),
        ).toEqual([]);
      }
    }
  });

  it("anchors every swap slot in the band-7 model", () => {
    for (const prompt of staged) {
      const slots = prompt.teaching_json.swap_slots ?? [];
      if (slots.length === 0) continue;
      const seven = (prompt.teaching_json.model_answers ?? []).find((m) => m.band_target === 7);
      expect(seven).toBeTruthy();
      const { unresolved } = placeSpans(seven?.text ?? "", slots);
      expect(unresolved.map((s) => `${prompt.id}: ${s.span}`)).toEqual([]);
    }
  });

  it("gives every language frame a gap to fill", () => {
    for (const prompt of staged) {
      for (const move of prompt.teaching_json.language_bank?.moves ?? []) {
        for (const frame of move.frames ?? []) {
          expect(frame.frame, `${prompt.id} · ${move.move}`).toContain("___");
        }
      }
    }
  });

  it("renders each prompt's ladder, plan and language bank without throwing", () => {
    for (const prompt of staged) {
      const { unmount } = render(
        <MemoryRouter>
          <div>
            <ModelAnswerViewer
              teaching={prompt.teaching_json}
              promptId={prompt.id}
              promptTitle={prompt.id}
              taskType={prompt.task_type}
            />
            <PlanPanel
              teaching={prompt.teaching_json}
              taskType={prompt.task_type}
              attempted
            />
            <LanguageBankPanel
              teaching={prompt.teaching_json}
              taskType={prompt.task_type}
              promptId={prompt.id}
              promptTitle={prompt.id}
            />
          </div>
        </MemoryRouter>,
      );
      // The band selector is the spine of the ladder: if it is not there, the three
      // models collapsed into one and the whole lesson is gone.
      expect(screen.getAllByRole("tab", { name: /band 7/i }).length).toBeGreaterThan(0);
      unmount();
    }
  });
});
