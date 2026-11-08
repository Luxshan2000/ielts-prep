import { afterEach, describe, expect, it } from "vitest";
import { getSidecarContract, peekSidecarContract, resetSidecarContract } from "../api";

afterEach(() => {
  delete window.__BANDREADY_SIDECAR__;
  delete window.bandready;
  resetSidecarContract();
});

describe("where the API client finds the sidecar", () => {
  it("uses the page's own origin and token in the browser edition", async () => {
    // The sidecar served this page and wrote the token into it (sidecar/bandready/server/web.py).
    // Falling through to the dev default would aim every request at port 8710 with "dev-token".
    window.__BANDREADY_SIDECAR__ = { token: "launch-token" };
    const contract = await getSidecarContract();
    expect(contract).toEqual({ baseUrl: window.location.origin, token: "launch-token" });
    expect(peekSidecarContract()).toEqual(contract);
  });

  it("keeps the dev default when nothing was injected", async () => {
    const contract = await getSidecarContract();
    expect(contract.token).toBe("dev-token");
    expect(contract.baseUrl).toBe("http://127.0.0.1:8710");
  });
});
