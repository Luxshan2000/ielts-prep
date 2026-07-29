/**
 * A dead language model must not look like a flaky audio connection.
 *
 * The examiner's turn is an LLM call. When the configured model is unreachable — a local
 * engine that was never started, a wrong base URL, a missing key — Pipecat surfaces it as
 * a bare "Error during completion: Connection error." The room used to render that as
 * "The practice engine reported an error." beside a "Try connecting again" button, which
 * is doubly wrong: it names the wrong subsystem, and it offers the one action that cannot
 * possibly help. Retrying WebRTC does not start Ollama.
 */

import { describe, expect, it } from "vitest";
import { describeError, isMicPermissionError, isProviderError } from "../components/phases";

describe("isProviderError", () => {
  it("recognises the bare pipeline failure a dead model produces", () => {
    expect(isProviderError(new Error("Error during completion: Connection error."))).toBe(true);
  });

  it("recognises a plain connection error", () => {
    expect(isProviderError(new Error("Connection error"))).toBe(true);
  });

  it.each([
    "the LLM endpoint refused the request",
    "provider timed out",
    "completion failed",
  ])("recognises %p", (message) => {
    expect(isProviderError(new Error(message))).toBe(true);
  });

  it("does not claim a microphone denial", () => {
    const denied = new Error("Permission denied");
    denied.name = "NotAllowedError";
    expect(isProviderError(denied)).toBe(false);
    expect(isMicPermissionError(denied)).toBe(true);
  });

  it("does not claim a missing microphone", () => {
    const missing = new Error("Requested device not found");
    missing.name = "NotFoundError";
    expect(isProviderError(missing)).toBe(false);
  });

  it.each([null, undefined, 42, {}])("is false for %p", (input) => {
    expect(isProviderError(input)).toBe(false);
  });
});

describe("describeError for a dead model", () => {
  const text = describeError(new Error("Error during completion: Connection error."));

  it("names the model rather than the audio path", () => {
    expect(text).toMatch(/language model/i);
    expect(text).not.toMatch(/practice engine reported an error/i);
  });

  it("says where to fix it", () => {
    expect(text).toMatch(/Settings/);
    expect(text).toMatch(/Providers/);
  });

  it("covers both the local and the cloud cause", () => {
    expect(text).toMatch(/running/i);
    expect(text).toMatch(/key/i);
  });

  it("still gives mic denials their own OS-specific instruction", () => {
    const denied = new Error("Permission denied");
    denied.name = "NotAllowedError";
    expect(describeError(denied)).toMatch(/System Settings/);
  });
});
