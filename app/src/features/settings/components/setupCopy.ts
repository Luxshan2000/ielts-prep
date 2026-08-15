/**
 * Wire values in, sentences a learner can act on out.
 *
 * Verify answers `{state: "unreachable", detail: "could not connect to
 * http://127.0.0.1:11434/v1 — is the server running?"}`. The download job answers
 * `retrying in 8s (ReadTimeout(''))`. Both are exactly right for the person who wrote the
 * sidecar and useless — or frightening — for somebody preparing for IELTS. Every string a
 * learner reads on the setup screen comes from this file, so there is one place to check
 * that no enum, URL, exception class or model id reaches them.
 */

import type { ArtifactState, DetectEngine, JobView, Modality, VerifyResult } from "../store";

/** What the learner should be offered next. The screen decides how to render it. */
export type FixKind =
  | "none" // it works
  | "check" // never checked, or a transient failure: just check again
  | "install-local" // no marking program on this machine
  | "download" // weights missing
  | "key" // the key was refused
  | "choose"; // nothing configured for this job at all

export interface JobStatus {
  tone: "success" | "warning" | "destructive" | "default";
  /** Short enough for a badge. Never a wire enum. */
  headline: string;
  /** One sentence saying what to do next, or null when there is nothing to say. */
  body: string | null;
  fix: FixKind;
}

export const JOB_LABEL: Record<Modality, string> = {
  llm: "The examiner",
  stt: "Hearing you",
  tts: "The voice",
};

const JOB_WHAT: Record<Modality, string> = {
  llm: "asks you questions and marks your answers",
  stt: "turns what you say into text",
  tts: "reads questions and listening audio aloud",
};

export function jobWhat(modality: Modality): string {
  return JOB_WHAT[modality];
}

export function formatSize(mb: number | null | undefined): string | null {
  if (!mb || mb <= 0) return null;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export interface DescribeContext {
  /** The examiner is pointed at an online service rather than this machine. */
  usingCloud?: boolean;
  /** The weights this slot would need, when we know which artifact that is. */
  artifact?: ArtifactState | null;
  /** A transport failure from the Verify call itself (the sidecar never answered). */
  verifyError?: string | null;
  /** True while the check is running. */
  busy?: boolean;
}

/**
 * The one translation table. `verify.detail` is deliberately never forwarded: it names
 * base URLs, model ids and file paths, and the learner cannot act on any of them.
 */
export function describeVerify(
  _modality: Modality,
  verify: VerifyResult | undefined,
  ctx: DescribeContext = {},
): JobStatus {
  if (ctx.busy) {
    return { tone: "default", headline: "Checking…", body: null, fix: "none" };
  }

  if (ctx.verifyError) {
    return {
      tone: "destructive",
      headline: "Could not check",
      body: "BandReady could not run the check just now. Try again in a moment.",
      fix: "check",
    };
  }

  if (!verify) {
    return { tone: "default", headline: "Not checked yet", body: null, fix: "check" };
  }

  if (verify.ok) {
    return { tone: "success", headline: "Working", body: null, fix: "none" };
  }

  switch (verify.state) {
    case "unreachable":
      return ctx.usingCloud
        ? {
            tone: "destructive",
            headline: "Cannot be reached",
            body: "BandReady could not reach that service. Check your internet connection, then check again.",
            fix: "check",
          }
        : {
            tone: "destructive",
            headline: "Not running",
            body: "This needs a free marking program running on this computer. Install Ollama — BandReady notices on its own once it is running — or use an online service instead.",
            fix: "install-local",
          };

    case "needs_download": {
      const size = formatSize(ctx.artifact?.approx_mb);
      return {
        tone: "warning",
        headline: "Needs one download",
        body: size
          ? `A one-time ${size} download is missing. It is kept on this computer and never downloaded again.`
          : "A one-time download is missing. It is kept on this computer and never downloaded again.",
        fix: "download",
      };
    }

    case "unauthorized":
      return {
        tone: "destructive",
        headline: "Key refused",
        body: "That key was refused. Check you pasted the whole key, and that it is still active on the service's website.",
        fix: "key",
      };

    case "timeout":
      return {
        tone: "warning",
        headline: "Too slow to use",
        body: "It did not answer in time. Check your internet connection, then check again.",
        fix: "check",
      };

    case "unconfigured":
      return {
        tone: "warning",
        headline: "Nothing chosen yet",
        body: "Nothing is set up for this job yet. Choose where it should run below.",
        fix: "choose",
      };

    default:
      return {
        tone: "destructive",
        headline: "Not working",
        body: "It answered with an error. Try again in a moment — if it keeps happening, use an online service instead.",
        fix: "check",
      };
  }
}

// ------------------------------------------------------------------ downloads

const NETWORK_PATTERNS: [RegExp, string][] = [
  [
    /nodename nor servname|Name or service not known|getaddrinfo|NameResolutionError|ConnectError|ConnectionRefused/i,
    "No internet connection.",
  ],
  [/ReadTimeout|WriteTimeout|ConnectTimeout|TimeoutException|timed? ?out/i, "The download server stopped responding."],
  [/SSL|CERTIFICATE|certificate verify/i, "The secure connection to the download server failed."],
  [/No space left|ENOSPC|disk/i, "This computer has run out of disk space."],
  [/checksum mismatch/i, "The downloaded file arrived damaged."],
  [/HTTP 4\d\d|HTTP 5\d\d|status code/i, "The download server refused the request."],
];

function plainCause(raw: string): string | null {
  for (const [pattern, sentence] of NETWORK_PATTERNS) {
    if (pattern.test(raw)) return sentence;
  }
  return null;
}

/**
 * A failed download, in words. The sidecar's own text is a Python repr
 * (`downloading model.bin failed: ConnectError('[Errno 8] nodename nor servname
 * provided')`), so it is classified rather than forwarded.
 */
export function plainDownloadError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cause = plainCause(raw);
  const tail = "Press Resume to pick it back up — the part already downloaded is kept.";
  return cause ? `${cause} ${tail}` : `The download did not finish. ${tail}`;
}

/** The in-flight `detail` line, which is either a byte count or an exception repr. */
export function plainDownloadDetail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const retry = /retrying in (\d+)\s*s/i.exec(raw);
  if (retry) {
    const cause = plainCause(raw) ?? "The connection dropped.";
    return `${cause} Trying again in ${retry[1]} seconds.`;
  }
  if (/verifying checksum/i.test(raw)) return "Checking the file is complete…";
  if (/already present/i.test(raw)) return "Already on this computer.";
  if (plainCause(raw) && !/\d+\s*MB/.test(raw)) return plainCause(raw);
  return null;
}

export interface DownloadProgress {
  /** 0–100, or null when nothing honest can be shown. */
  pct: number | null;
  label: string;
  caption: string | null;
}

const BYTES_LINE = /—\s*(\d+)\s*MB\s*\/\s*(\d+)\s*MB\s*$/;

/**
 * An honest percentage for the big downloads.
 *
 * The sidecar computes `progress_pct` from declared file sizes, and the Whisper artifacts
 * declare none — so the 1.5 GB downloads, the only ones long enough to need a bar, are the
 * ones that get an indeterminate pulse. The per-file byte counts are in the job detail, so
 * the current file's share is recoverable here; saying which file of how many keeps that
 * from reading as if the whole download restarted.
 */
export function downloadProgress(
  job: JobView | undefined,
  artifact: ArtifactState | undefined,
): DownloadProgress {
  const detail = job?.detail ?? null;
  const total = formatSize(artifact?.approx_mb);
  const spoken = plainDownloadDetail(detail);
  if (spoken) return { pct: job?.pct ?? null, label: "Downloading", caption: spoken };

  if (typeof job?.pct === "number") {
    return {
      pct: job.pct,
      label: "Downloading",
      caption: total ? `${Math.round(job.pct)}% of about ${total}` : `${Math.round(job.pct)}%`,
    };
  }

  const match = detail ? BYTES_LINE.exec(detail) : null;
  const files = artifact?.files ?? [];
  if (match) {
    const done = Number(match[1]);
    const fileTotal = Number(match[2]);
    const name = detail!.slice(0, detail!.indexOf("—")).trim();
    const index = files.findIndex((f) => f.name === name);
    const label =
      files.length > 1 && index >= 0
        ? `Downloading file ${index + 1} of ${files.length}`
        : "Downloading";
    return {
      pct: fileTotal > 0 ? Math.min(100, (done / fileTotal) * 100) : null,
      label,
      caption: `${done} MB of ${fileTotal} MB${total && files.length > 1 ? ` · about ${total} in total` : ""}`,
    };
  }

  return {
    pct: job?.pct ?? null,
    label: "Downloading",
    caption: total ? `About ${total} in total` : "Starting…",
  };
}

// -------------------------------------------------------------------- engines

const ENGINE_LABELS: Record<string, string> = {
  ollama: "Ollama",
  lm_studio: "LM Studio",
  mlx_lm: "MLX (mlx-lm server)",
  llama_cpp: "llama.cpp",
  kokoro: "Kokoro (local voice)",
  faster_whisper: "Local Whisper",
  mlx_whisper: "MLX Whisper",
};

/** Title-cases an unknown engine id rather than printing `some_new_engine` verbatim. */
export function engineLabel(engine: Pick<DetectEngine, "id">): string {
  const known = ENGINE_LABELS[engine.id];
  if (known) return known;
  return engine.id
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const OS_LABELS: Record<string, string> = {
  darwin: "This Mac",
  win32: "This Windows PC",
  windows: "This Windows PC",
  linux: "This Linux PC",
};

/** `darwin · arm64 · 16 GB RAM · Apple Silicon` → `This Mac · Apple Silicon · 16 GB memory`. */
export function platformLabel(platform: {
  os?: string;
  arch?: string;
  apple_silicon?: boolean;
  ram_gb?: number | null;
}): string {
  const parts = [OS_LABELS[platform.os ?? ""] ?? "This computer"];
  if (platform.apple_silicon) parts.push("Apple Silicon");
  if (platform.ram_gb) parts.push(`${platform.ram_gb} GB memory`);
  return parts.join(" · ");
}
