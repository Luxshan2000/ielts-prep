/**
 * Sidecar HTTP/WS client (18-api-contract.md).
 *
 * Every request is `Authorization: Bearer <per-launch sidecar token>`; the two
 * URL-only contexts (`<audio>` and `WebSocket`) use §2 signed tickets instead.
 * Long-running work follows the §3 job convention: 202 + `{job_id}` then poll
 * `GET /api/v1/jobs/{id}`.
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:8710";
const DEFAULT_TOKEN = "dev-token";

export interface SidecarContract {
  baseUrl: string;
  token: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail: string,
  ) {
    super(detail || code);
    this.name = "ApiError";
  }

  /** True when the failure means "the sidecar isn't reachable at all". */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

let contractPromise: Promise<SidecarContract> | null = null;
let resolvedContract: SidecarContract | null = null;

function envContract(): SidecarContract {
  const env = import.meta.env ?? {};
  return {
    baseUrl: stripTrailingSlash(env.VITE_SIDECAR_URL || DEFAULT_BASE_URL),
    token: env.VITE_SIDECAR_TOKEN || DEFAULT_TOKEN,
  };
}

/**
 * Resolve `{baseUrl, token}` — from the Electron preload bridge when present
 * (the main process spawned the sidecar and knows its random port), otherwise
 * from Vite env vars, otherwise the documented dev default.
 */
export async function getSidecarContract(): Promise<SidecarContract> {
  if (contractPromise) return contractPromise;
  contractPromise = (async () => {
    const bridge = typeof window !== "undefined" ? window.bandready : undefined;
    if (bridge?.getSidecarInfo) {
      try {
        const info = await bridge.getSidecarInfo();
        if (info?.base_url && info?.token) {
          return { baseUrl: stripTrailingSlash(info.base_url), token: info.token };
        }
      } catch {
        /* fall through to env defaults */
      }
    }
    return envContract();
  })();
  const contract = await contractPromise;
  resolvedContract = contract;
  return contract;
}

/** Synchronous best-effort contract; used by non-async helpers. */
export function peekSidecarContract(): SidecarContract {
  return resolvedContract ?? envContract();
}

/** Forget the cached contract (used after a sidecar restart). */
export function resetSidecarContract(): void {
  contractPromise = null;
  resolvedContract = null;
  ticketCache.clear();
}

async function toApiError(res: Response): Promise<ApiError> {
  let detail = res.statusText || "request failed";
  let code = "internal";
  try {
    const body = (await res.json()) as { detail?: string; code?: string };
    if (typeof body.detail === "string") detail = body.detail;
    if (typeof body.code === "string") code = body.code;
  } catch {
    /* non-JSON body (should not happen — 01 §9) */
  }
  return new ApiError(res.status, code, detail);
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, token } = await getSidecarContract();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const isForm = init.body instanceof FormData;
  if (init.body !== undefined && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  } catch (err) {
    throw new ApiError(
      0,
      "sidecar_unreachable",
      err instanceof Error ? err.message : "the BandReady sidecar is not responding",
    );
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204 || res.headers.get("Content-Length") === "0") {
    return undefined as T;
  }
  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.includes("json")) return undefined as T;
  return (await res.json()) as T;
}

const body = (data: unknown): string | undefined =>
  data === undefined ? undefined : JSON.stringify(data);

// ---------------------------------------------------------------- tickets ---

export type TicketAudience = "media-read" | "session-events";

interface CachedTicket {
  ticket: string;
  expiresAt: number;
}

const ticketCache = new Map<string, CachedTicket>();
/** Re-mint this many ms before the server-side expiry to avoid a 401 race. */
const TICKET_SKEW_MS = 10_000;

async function ticket(audience: TicketAudience, resource: string): Promise<string> {
  const key = `${audience}|${resource}`;
  const cached = ticketCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.ticket;

  const res = await req<{ ticket: string; expires_in: number }>("/api/v1/tickets", {
    method: "POST",
    body: body({ audience, resource }),
  });
  ticketCache.set(key, {
    ticket: res.ticket,
    expiresAt: Date.now() + Math.max(res.expires_in * 1000 - TICKET_SKEW_MS, 1_000),
  });
  return res.ticket;
}

/** Drop a cached ticket after a 401 `ticket_expired`. */
function invalidateTicket(audience: TicketAudience, resource: string): void {
  ticketCache.delete(`${audience}|${resource}`);
}

/**
 * Absolute, ticket-signed URL for an `<audio>`/`<img>` src.
 * `path` is the exact `/api/v1/media/...` request path (the ticket resource).
 */
async function mediaUrl(path: string): Promise<string> {
  const { baseUrl } = await getSidecarContract();
  const t = await ticket("media-read", path);
  return `${baseUrl}${path}${path.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(t)}`;
}

const SPEAKING_EVENTS_RE = /^\/api\/v1\/speaking\/sessions\/([^/]+)\/events$/;

/**
 * Absolute ws:// URL with a `session-events` ticket. `resource` defaults to the
 * session id parsed out of the standard speaking-events path.
 */
async function wsUrl(path: string, resource?: string): Promise<string> {
  const { baseUrl } = await getSidecarContract();
  const res = resource ?? SPEAKING_EVENTS_RE.exec(path)?.[1];
  if (!res) {
    throw new ApiError(
      0,
      "validation_error",
      `cannot derive a ticket resource for websocket path ${path}`,
    );
  }
  const t = await ticket("session-events", res);
  const wsBase = baseUrl.replace(/^http/, "ws");
  return `${wsBase}${path}${path.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(t)}`;
}

// ------------------------------------------------------------------- jobs ---

export type JobState = "queued" | "running" | "done" | "error" | "cancelled";

export interface Job<R = unknown> {
  id: string;
  kind: string;
  state: JobState;
  progress_pct: number | null;
  detail: string | null;
  result: R | null;
  error: { detail: string; code: string } | null;
  created_at: string;
  updated_at: string;
}

export interface PollJobOptions {
  /** Poll interval in ms (default 700). */
  intervalMs?: number;
  /** Give up after this many ms (default 10 minutes). */
  timeoutMs?: number;
  /** Abort polling (does not cancel the server-side job). */
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 18 §3: poll `GET /api/v1/jobs/{id}` until terminal.
 * Resolves with the job's `result` on `done`; throws `ApiError` on
 * `error`/`cancelled`. `onProgress` receives every intermediate job object.
 */
async function pollJob<R = unknown>(
  jobId: string,
  onProgress?: (job: Job<R>) => void,
  options: PollJobOptions = {},
): Promise<R> {
  const { intervalMs = 700, timeoutMs = 600_000, signal } = options;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (signal?.aborted) throw new ApiError(0, "cancelled", "polling aborted");
    const job = await req<Job<R>>(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
    onProgress?.(job);

    if (job.state === "done") return job.result as R;
    if (job.state === "error") {
      throw new ApiError(500, job.error?.code ?? "job_failed", job.error?.detail ?? "job failed");
    }
    if (job.state === "cancelled") {
      throw new ApiError(409, "cancelled", "the job was cancelled");
    }
    if (Date.now() > deadline) {
      throw new ApiError(504, "job_failed", "the job did not finish in time");
    }
    await sleep(intervalMs);
  }
}

// ------------------------------------------------------------------- api ----

export interface HealthResponse {
  status: string;
  version: string;
  db: string;
  migrations: string;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => req<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, data?: unknown, init?: RequestInit) =>
    req<T>(path, { ...init, method: "POST", body: data instanceof FormData ? data : body(data) }),
  patch: <T>(path: string, data?: unknown, init?: RequestInit) =>
    req<T>(path, { ...init, method: "PATCH", body: body(data) }),
  put: <T>(path: string, data?: unknown, init?: RequestInit) =>
    req<T>(path, { ...init, method: "PUT", body: body(data) }),
  del: <T = void>(path: string, init?: RequestInit) => req<T>(path, { ...init, method: "DELETE" }),

  health: () => req<HealthResponse>("/health"),

  ticket,
  invalidateTicket,
  mediaUrl,
  wsUrl,
  pollJob,
  job: <R = unknown>(id: string) => req<Job<R>>(`/api/v1/jobs/${encodeURIComponent(id)}`),
  cancelJob: (id: string) => req<void>(`/api/v1/jobs/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  }),

  contract: getSidecarContract,
  reset: resetSidecarContract,
};

export type Api = typeof api;
