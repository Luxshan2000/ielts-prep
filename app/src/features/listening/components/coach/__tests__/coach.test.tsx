/**
 * The properties of the listening coach that must not regress.
 *
 * **The gate is the server's, and the client never holds what it withholds.** While a part
 * has not been sat, `transcript.lines` is `[]` and every `timeline` is `null` in the
 * response itself. So the assertions here are about what the component does with an
 * already-locked document — and, crucially, that it never asks `POST /coach/replay` for a
 * moment it has not earned.
 *
 * **Prediction runs before the audio and gives nothing away.** It is the landing tab, it
 * works while the gate is shut, and the authored slot — the answer to the exercise —
 * arrives only once the part has been sat. The gap's *content* is never on that tab in
 * either state.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/lib/api";
import { ListeningCoach } from "../ListeningCoach";
import { useCoachStore } from "../store";
import { useMockStore } from "../../mock/store";

const HEADER = {
  script_id: "ls_1",
  part: 2,
  title: "Ashfield watermill",
  scenario: null,
  topic_id: null,
  accent_set: "uk",
  target_band: 6.5,
  audio_hash: "abc",
  schema_version: 2,
};

const AUDIO = {
  audio_hash: "abc",
  ready: true,
  duration_ms: 30_000,
  media_path: "/api/v1/media/listening/abc.wav",
  timing_path: "/api/v1/media/listening/abc.timing.json",
};

const SLOTS = {
  noun_singular: {
    label: "A singular noun",
    listening_for: "a noun after a / an / each / one",
    hazard: "writing the plural",
  },
  noun_plural: {
    label: "A plural noun",
    listening_for: "a noun after some / two / several",
    hazard: "dropping the -s",
  },
  quantity: {
    label: "A quantity",
    listening_for: "a bare figure",
    hazard: "13 against 30",
  },
};

const LINES = [
  {
    index: 0,
    speaker: "s1",
    text: "It used to be five days a week.",
    pause_after_ms: 300,
    start_ms: 0,
    end_ms: 9_000,
  },
  {
    index: 1,
    speaker: "s1",
    text: "Straight away on your left is the sack store — and we only grind three days a week now.",
    pause_after_ms: 300,
    start_ms: 12_000,
    end_ms: 26_000,
  },
];

const GROUPS = [
  {
    group_id: "g1",
    qtype: "note_completion",
    instruction: "Write NO MORE THAN TWO WORDS for each answer.",
    type_page: null,
    question_numbers: [11, 12],
    question_count: 2,
    answer_order: "sequential",
    order_badge: "In recording order",
    order_note: "She walks the site once, in one direction.",
    strategy: "Put your finger on the gate before the audio starts and keep it there.",
    preview_focus: "Find the gate, the mill and the footbridge on the plan.",
    watch_out: "Two of the places she names loudest are not answers at all.",
    spatial_cues: ["on your left"],
    bank_note: null,
    teaching_available: true,
  },
];

function question(number: number, unlocked: boolean) {
  const twelve = number === 12;
  const prediction = unlocked
    ? {
        cue: twelve ? "days" : "the",
        locked: false,
        slot: twelve
          ? { slug: "quantity", ...SLOTS.quantity }
          : { slug: "noun_singular", ...SLOTS.noun_singular },
        range: twelve ? "1–7" : null,
        note: twelve
          ? "A bare figure — the printed noun is already there."
          : "A two-word name for a small building, left of the path.",
      }
    : { cue: twelve ? "days" : "the", locked: true, slot: null, range: null, note: null };

  return {
    number,
    qtype: "note_completion",
    group_id: "g1",
    instruction: "Write NO MORE THAN TWO WORDS for each answer.",
    prompt: twelve ? "Grinding happens on ______ days a week" : "Beside the mill: the ______",
    options: null,
    select_n: null,
    word_limit: twelve ? 1 : 2,
    prediction,
    teaching_available: true,
    locked: !unlocked,
    timeline: unlocked
      ? {
          prediction,
          signpost: {
            phrase: twelve ? "we only grind" : "Straight away on your left",
            line_index: 1,
            kind: twelve
              ? { slug: "emphasis", label: "This one counts" }
              : { slug: "imminent", label: "Answer coming" },
          },
          answer_quote: twelve
            ? "we only grind three days a week now"
            : "Straight away on your left is the sack store",
          cue_line_index: 1,
          cue_text: LINES[1].text,
          accepted_answers: twelve ? [["three", "3"]] : [["sack store"]],
          paraphrase_link: null,
          distraction: twelve
            ? {
                traps: [
                  {
                    slug: "past_state",
                    label: "Was true, then superseded",
                    family: "raised",
                    family_label: "Raised, then dropped",
                    what_happened: "A value that was true and was explicitly replaced.",
                    signal: "it used to be",
                    fix: "Take the value she lands on.",
                  },
                ],
                trap: {
                  slug: "past_state",
                  label: "Was true, then superseded",
                  family: "raised",
                  family_label: "Raised, then dropped",
                  what_happened: "A value that was true and was explicitly replaced.",
                  signal: "it used to be",
                  fix: "Take the value she lands on.",
                },
                decoy: "five",
                decoy_line_index: 0,
                signal: "It used to be five",
                note: "Take the figure she lands on, not the one she starts from.",
              }
            : null,
          decoy_text: twelve ? LINES[0].text : null,
          option_diagnosis: [],
          recovery: twelve ? "If 12 went past, the next row is the ticket price." : null,
          form: twelve
            ? null
            : { risk: { slug: "over_limit", label: "Over the word limit" }, note: "Two words." },
          explanation: null,
        }
      : null,
  };
}

const LOCK_MESSAGE =
  "Sit this part first. In listening the transcript IS the answer key, so reading it now would spend a part you can only sit once.";

function teaching(unlocked: boolean) {
  return {
    ...HEADER,
    teaching_available: true,
    timelines_available: 2,
    question_count: 2,
    audio: AUDIO,
    speakers: [{ id: "s1", name: "Ellen" }],
    what_makes_this_hard: {
      levers: [{ slug: "cue_answer_distance", note: "The cue and the answer are far apart" }],
      note: "One voice and nobody to slow her down.",
      hardest_question: 12,
      why_hardest: "The negation arrives after a long list.",
    },
    pre_teach: [
      {
        item: "tucked in against",
        gloss: "fitted tightly beside",
        line_index: unlocked ? 1 : null,
        blocks_q: unlocked ? 11 : null,
      },
    ],
    pause_plan: {
      blocks: [
        {
          questions: [11, 12],
          first_number: 11,
          last_number: 12,
          preview_line_index: 0,
          preview_ms: 30_000,
          cue_line_index: 1,
          orient_line_index: 0,
        },
      ],
      block_count: 1,
      close_line_index: 2,
      check_ms: 30_000,
      whole_test_intro: false,
      preview_protocol: [{ from_s: 0, to_s: 3, step: "Read the instruction line." }],
      note: "One preview, then the whole talk without a break.",
    },
    accent_note: null,
    metrics: { spoken_words: 640, words_per_answer: 64, trapped_items: 1, clean_items: 1 },
    groups: GROUPS,
    check_protocol: ["Blanks first."],
    check_note: "Only form recovery is possible.",
    last_value_rule: "The answer is the last value stated for that slot before the speaker moves on.",
    transcript: unlocked
      ? { locked: false, lines: LINES, line_count: 2, timed: true, message: null }
      : { locked: true, lines: [], line_count: 2, message: LOCK_MESSAGE },
    signpost_map: unlocked
      ? [
          {
            line_index: 1,
            phrase: "Straight away on your left",
            kind: { slug: "imminent", label: "Answer coming" },
          },
        ]
      : [],
    questions: [question(11, unlocked), question(12, unlocked)],
    trap_profile: unlocked
      ? [
          {
            slug: "past_state",
            label: "Was true, then superseded",
            family: "raised",
            family_label: "Raised, then dropped",
            what_happened: "A value that was true and was explicitly replaced.",
            signal: "it used to be",
            fix: "Take the value she lands on.",
            questions: [12],
            count: 1,
          },
        ]
      : [],
    line_count: 2,
    gate: {
      unlocked,
      reason: unlocked ? "attempted" : "not_attempted",
      attempts: unlocked ? 1 : 0,
      last_attempt_id: unlocked ? "la_1" : null,
      last_submitted_at: unlocked ? "2026-07-27T09:00:00Z" : null,
      last_raw_score: unlocked ? 8 : null,
      evidence: unlocked ? "script" : null,
      gated_fields: unlocked ? [] : ["transcript"],
      message: unlocked ? null : LOCK_MESSAGE,
    },
  };
}

function predictions(unlocked: boolean) {
  const doc = teaching(unlocked);
  return {
    ...HEADER,
    note: "Prediction is the only listening skill you can practise with the sound off.",
    question_count: 2,
    authored_count: 2,
    items: doc.questions.map((q) => ({
      number: q.number,
      qtype: q.qtype,
      group_id: q.group_id,
      instruction: q.instruction,
      prompt: q.prompt,
      word_limit: q.word_limit,
      prediction: q.prediction,
      authored: true,
    })),
    slots: SLOTS,
    cue_table: [{ printed: "a ___", slot: "noun_singular", note: "" }],
    preview_protocol: [{ from_s: 0, to_s: 3, step: "Read the instruction line." }],
    slot_profile: [],
    locked: !unlocked,
    message: unlocked ? null : "The authored slot arrives after you have sat the part.",
    gate: doc.gate,
  };
}

const REPLAY = {
  ...HEADER,
  number: 12,
  audio: AUDIO,
  note: "The signpost, the decoy and the answer line, as playable windows.",
  lead_in_ms: 3000,
  tail_ms: 1500,
  segments: [
    {
      role: "decoy",
      line_index: 0,
      text: LINES[0].text,
      start_ms: 0,
      end_ms: 9_500,
      seek_ms: 0,
      duration_ms: 9_500,
      playable: true,
    },
    {
      role: "answer",
      line_index: 1,
      text: LINES[1].text,
      start_ms: 9_000,
      end_ms: 27_500,
      seek_ms: 12_000,
      duration_ms: 18_500,
      playable: true,
    },
  ],
  answer: null,
  signpost: null,
  distraction: null,
  answer_quote: "we only grind three days a week now",
  accepted_answers: [["three", "3"]],
  recovery: null,
  explanation: null,
  playable: true,
  gate: teaching(true).gate,
};

function mockApi({ sat }: { sat: boolean }) {
  const get = vi.fn(async (path: string) => {
    if (path.includes("/coach/scripts/")) return teaching(sat);
    if (path.includes("/coach/predictions/")) return predictions(sat);
    if (path.includes("/coach/exam-conditions")) {
      return { active: false, mock_id: null, coaching_available: true, withheld: [], message: null };
    }
    return { items: [], next_cursor: null };
  });
  const post = vi.fn(async (path: string, _body?: unknown) => {
    if (path.includes("/coach/replay")) return REPLAY;
    return {};
  });
  vi.spyOn(api, "get").mockImplementation(get as unknown as typeof api.get);
  vi.spyOn(api, "post").mockImplementation(post as unknown as typeof api.post);
  vi.spyOn(api, "mediaUrl").mockResolvedValue("blob:audio");
  return { get, post };
}

function renderCoach() {
  return render(
    <MemoryRouter initialEntries={["/listening/coach/ls_1"]}>
      <Routes>
        <Route path="/listening/coach/:scriptId" element={<ListeningCoach />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  useCoachStore.setState({ slots: {}, guesses: {}, replays: {}, conditions: null });
  useMockStore.setState({ session: null, answers: {} });
});

describe("the listening coach", () => {
  it("lands on prediction, because it is the tab worth opening before the audio", async () => {
    mockApi({ sat: false });
    renderCoach();

    expect(await screen.findByText(/Ashfield watermill/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Prediction" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await screen.findByText(/Slot-type every gap before you hear anything/),
    ).toBeInTheDocument();
  });

  it("keeps the transcript shut, and never asks for a replay, until the part has been sat", async () => {
    const { get, post } = mockApi({ sat: false });
    renderCoach();

    expect(await screen.findByText(/Ashfield watermill/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Transcript/ }));

    expect(
      await screen.findByText(/The transcript opens once you have sat this part/),
    ).toBeInTheDocument();
    // The padlock speaks in the sidecar's words, so the two can never drift apart.
    expect(screen.getByText(/the transcript IS the answer key/i)).toBeInTheDocument();
    // Nothing was fetched that could carry a spoken line.
    expect(post.mock.calls.some(([path]) => String(path).includes("/replay"))).toBe(false);
    expect(get.mock.calls.some(([path]) => String(path).includes("/review"))).toBe(false);
    expect(screen.queryByText(/sack store/)).not.toBeInTheDocument();
  });

  it("opens the transcript after a submitted attempt, with every line playable", async () => {
    mockApi({ sat: true });
    renderCoach();

    expect(await screen.findByText(/Ashfield watermill/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Transcript/ }));

    // The whole line is the control, and its label names the moment it plays.
    expect(
      await screen.findByRole("button", { name: /Play line 2 from 0:12/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play line 1 from 0:00/ })).toBeInTheDocument();
  });

  it("asks the server for the withdrawn value and the real one, in that order", async () => {
    const { post } = mockApi({ sat: true });
    renderCoach();

    await userEvent.click(await screen.findByRole("tab", { name: /Transcript/ }));

    const replay = await screen.findByRole("button", {
      name: /Replay the moment — decoy, then the answer/,
    });
    await userEvent.click(replay);

    const call = post.mock.calls.find(([path]) => String(path).includes("/coach/replay"));
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ script_id: "ls_1", number: 12 });
    // The decoy is shown struck through beside the note that says what to do about it.
    expect(screen.getAllByText("five").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Take the figure she lands on, not the one she starts from/),
    ).toBeInTheDocument();
  });

  it("grades a prediction against the authored slot without revealing the answer", async () => {
    mockApi({ sat: true });
    renderCoach();

    const group = await screen.findByRole("group", { name: /question 12/ });
    const card = group.parentElement as HTMLElement;
    await userEvent.click(within(group).getByRole("button", { name: "A plural noun" }));
    await userEvent.click(within(card).getByRole("button", { name: "Check this one" }));

    expect(within(card).getAllByText("A quantity").length).toBeGreaterThan(0);
    expect(
      within(card).getByText(/A bare figure — the printed noun is already there/),
    ).toBeInTheDocument();
    // The gap's content is nowhere on this tab.
    expect(screen.queryByText(/three days a week now/)).not.toBeInTheDocument();
  });

  it("still runs the drill while the gate is shut, and marks nothing", async () => {
    mockApi({ sat: false });
    renderCoach();

    const group = await screen.findByRole("group", { name: /question 12/ });
    const card = group.parentElement as HTMLElement;
    await userEvent.click(within(group).getByRole("button", { name: "A quantity" }));

    // Committing is the exercise; the authored answer is not available to mark against.
    expect(within(card).queryByRole("button", { name: "Check this one" })).not.toBeInTheDocument();
    expect(within(card).getByText(/Committed\. Sit the part/)).toBeInTheDocument();
    expect(
      screen.getByText(/The authored slot arrives after you have sat the part/),
    ).toBeInTheDocument();
  });

  it("teaches the signpost kinds before the phrases are unlocked", async () => {
    mockApi({ sat: false });
    renderCoach();

    await userEvent.click(await screen.findByRole("tab", { name: /Signposts/ }));
    expect((await screen.findAllByText(/Answer coming/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Straight away on your left/)).not.toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(LOCK_MESSAGE.slice(0, 30))).length).toBeGreaterThan(0);
  });
});
