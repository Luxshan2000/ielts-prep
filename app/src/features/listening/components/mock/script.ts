/**
 * The words and the constants of the listening mock.
 *
 * Kept away from the components because they are the part that has to be right: a
 * commitment screen that reassures is how you get an hour that was half-sat and a
 * report nobody believes.
 *
 * **We model the computer-delivered test by default.** Listening is on computer in the
 * hybrid formats as well as the fully computer-delivered ones, and One Skill Retake —
 * the thing that makes an isolated listening score directly actionable — is available
 * on computer only. The realistic assumption for a learner using a desktop app is that
 * they will type answers as they hear them and get about two minutes to check.
 *
 * Paper is offered as an explicit alternative rather than the default, because it
 * drills a genuinely different skill and is still the format in many countries.
 */

/** Computer delivery: the answers are already where they need to be. */
export const CHECK_SECONDS = 120;
/** Paper delivery: a clerical allowance for moving answers onto the sheet. */
export const TRANSFER_SECONDS = 600;

export type Delivery = "computer" | "paper";

export const DELIVERY_LABEL: Record<Delivery, string> = {
  computer: "Computer-delivered",
  paper: "Paper-based",
};

export function windowSeconds(delivery: Delivery): number {
  return delivery === "paper" ? TRANSFER_SECONDS : CHECK_SECONDS;
}

export const DELIVERY_OPTIONS = [
  {
    value: "computer",
    label: "Computer-delivered: type as you listen, 2 minutes to check",
  },
  {
    value: "paper",
    label: "Paper-based: 10 minutes at the end to transfer your answers",
  },
];

/** The mnemonic that stops the confusion between the two windows. */
export const TRANSFER_MNEMONIC =
  "Paper gets ten minutes because paper has to move the answers. Computer gets two because the answers are already where they need to be. The ten minutes is a clerical allowance, not a thinking period, and nobody has ever been given extra time to reconsider.";

export interface Condition {
  id: string;
  title: string;
  detail: string;
}

export const CONDITIONS: Condition[] = [
  {
    id: "once",
    title: "Each part plays exactly once",
    detail:
      "No pause, no rewind, no replay, no speed control. The player mounts no transport at all, and a part that has finished cannot be started again, including after a reload.",
  },
  {
    id: "coaching",
    title: "No coaching of any kind",
    detail:
      "The coach, the prediction trainer, the signpost inventory and the vocabulary list are all shut while a sitting is open. The teaching payload is not in the response body at all during an attempt. There is nothing to reveal.",
  },
  {
    id: "transcript",
    title: "No transcript and no answer key",
    detail:
      "The script and the accepted answers are withheld until the paper is submitted. There is no reveal control anywhere in the sitting, because there is nothing on this screen to reveal.",
  },
  {
    id: "clock",
    title: "One clock, and it does not pause",
    detail:
      "It runs across all four parts and the window at the end, and it keeps running if you walk away. Leaving needs an explicit abandon.",
  },
  {
    id: "submit",
    title: "It submits itself",
    detail:
      "When the final window reaches zero the paper is marked as it stands. A blank scores nothing and a guess sometimes does not, so leave nothing empty.",
  },
  {
    id: "one",
    title: "One sitting at a time",
    detail:
      "While a mock is open you cannot start another attempt, a drill or a generation job. A mock measures; it does not train.",
  },
];

/** Stated once, before the score, and never dressed up. */
export const BAND_NOTE =
  "The raw-score-to-band conversion is the published Listening table and is the same for Academic and General Training. The two modules sit the same listening paper. It is a good estimate on a full forty-question paper and meaningless on anything less, which is why single parts report a raw score only.";

/** What the raw score is worth compared with the band, and why it leads. */
export const RAW_FIRST_NOTE =
  "Raw score leads because the middle of the band table is wide: several marks can land on the same half-band. A learner improving inside 5.5 would watch the band sit still and conclude nothing had happened.";

export const PART_DIAGNOSIS: Record<number, string> = {
  1: "Part 1 is transcription. Marks lost here are almost always spelling, numbers and corrections rather than comprehension.",
  2: "Part 2 is following a route or a sequence with nobody to slow the speaker down.",
  3: "Part 3 punishes losing track of who thinks what. The keyed answer is usually the position they settle on.",
  4: "Part 4 punishes losing your place. There is no mid-part pause, so one miss runs on.",
};
