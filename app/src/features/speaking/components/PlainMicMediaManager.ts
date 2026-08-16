import type { MediaManager } from "@pipecat-ai/small-webrtc-transport";
import type { Participant, PipecatClientOptions, RTVIEventCallbacks, Tracks } from "@pipecat-ai/client-js";

/**
 * Microphone capture with `getUserMedia` and nothing else.
 *
 * The transport ships two managers and neither suits a local-first app.
 * `DailyMediaManager` downloads its call-machine bundle from a CDN the moment a call starts,
 * which this app's own CSP blocks and which would not work offline anyway. `WavMediaManager`
 * captures through an AudioWorklet, and when that worklet fails to start it fails **silently**:
 * its catch is `case 6: error_2 = _c.sent(); break`, which discards the error and carries on
 * with a dead recorder. The call then connects, the examiner speaks, the peer connection
 * publishes nothing, the sidecar logs "no audio frame received" every two seconds for the whole
 * call, and the only thing on screen is "Session ended: please call .begin() first" from the
 * next method to touch the corpse. That was three separate debugging sessions.
 *
 * None of that machinery is needed here. `SmallWebRTCTransport.addUserMedia()` reads exactly one
 * thing from its manager, `tracks().local.audio`, and adds it to the transceiver. A plain
 * `MediaStreamTrack` from `getUserMedia` is what a browser gives you for free, it is what every
 * other recording path in this app already uses successfully, and it has no worklet to fail.
 *
 * Bot audio is not routed through here. With this transport it arrives as a remote track and
 * the call screen plays it directly, so the buffering hooks below are genuinely unused rather
 * than stubbed out and hoped over.
 *
 * Standalone rather than `extends MediaManager`, because the base class is a lie at runtime:
 * the package's `.d.ts` declares it but `dist/index.js` exports only the two concrete
 * managers, so `extends` passes the typecheck and the mocked tests and then throws a
 * SyntaxError the moment a real browser imports the module. The transport only ever calls
 * methods on whatever object it is handed, so a structurally complete implementation is the
 * same thing to it; `asMediaManager()` carries the one type assertion, in one place, with
 * this paragraph as its justification.
 */
export class PlainMicMediaManager {
  // The base-class contract, reproduced from the compiled source rather than imagined:
  // the constructor seeds these five, and setClientOptions() replaces them unless already
  // set. The client calls setClientOptions and setUserAudioCallback before initialize().
  protected _userAudioCallback: (data: ArrayBuffer) => void = () => {};
  protected _options: PipecatClientOptions | null = null;
  protected _callbacks: RTVIEventCallbacks = {};
  protected _micEnabled = true;
  protected _camEnabled = false;
  protected _supportsScreenShare = false;

  setUserAudioCallback(userAudioCallback: (data: ArrayBuffer) => void): void {
    this._userAudioCallback = userAudioCallback;
  }

  setClientOptions(options: PipecatClientOptions, override = false): void {
    if (this._options && !override) return;
    this._options = options;
    this._callbacks = options.callbacks ?? {};
    this._micEnabled = options.enableMic ?? true;
    this._camEnabled = options.enableCam ?? false;
  }

  get supportsScreenShare(): boolean {
    return this._supportsScreenShare;
  }

  /**
   * The shape the SDK's own managers report for the local side, verbatim.
   *
   * The callbacks are not decoration: `usePipecatClientMediaTrack("audio", "local")` only
   * learns a track exists from `onTrackStarted`. The first version of this class skipped
   * them, and everything reading that hook saw null — the level meter sat flat while a
   * working call transcribed perfectly, and the silent-mic warning concluded "the browser
   * never handed over a microphone" about a microphone it was hearing.
   */
  private localParticipant(): Participant {
    return { id: "local", name: "", local: true };
  }

  /** The single, documented lie: structurally complete, nominally unrelated. */
  asMediaManager(): MediaManager {
    return this as unknown as MediaManager;
  }
  private stream: MediaStream | null = null;
  private micId: string | null = null;
  private selected: MediaDeviceInfo | Record<string, never> = {};

  // ---------------------------------------------------------------- lifecycle ---

  async initialize(): Promise<void> {
    await this.open();
  }

  async connect(): Promise<void> {
    // The track is opened in initialize() and stays open for the call. Re-opening here would
    // hand the transport a different track from the one it already negotiated.
    if (!this.stream) await this.open();
  }

  async disconnect(): Promise<void> {
    this.stream?.getTracks().forEach((t) => {
      t.stop();
      this._callbacks.onTrackStopped?.(t, this.localParticipant());
    });
    this.stream = null;
  }

  /**
   * Open the microphone, and let a failure travel.
   *
   * Deliberately unguarded. The whole reason this class exists is that the manager it replaces
   * swallowed exactly this error, so a rejection here reaches `connect()` in LiveSession and
   * becomes a sentence the learner can act on.
   */
  private async open(): Promise<void> {
    const constraints: MediaStreamConstraints = {
      audio: this.micId ? { deviceId: { exact: this.micId } } : true,
      video: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    // On a device switch the old track is both stopped and reported stopped, so the hooks
    // swap to the replacement instead of holding a dead reference.
    this.stream?.getTracks().forEach((t) => {
      t.stop();
      this._callbacks.onTrackStopped?.(t, this.localParticipant());
    });
    this.stream = stream;
    for (const track of stream.getAudioTracks()) {
      track.enabled = this._micEnabled;
      this._callbacks.onTrackStarted?.(track, this.localParticipant());
    }

    // Resolve the label only after permission is granted; before that every label is "".
    const id = stream.getAudioTracks()[0]?.getSettings().deviceId ?? null;
    if (id) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.selected = devices.find((d) => d.deviceId === id) ?? {};
    }
  }

  // ------------------------------------------------------------------ tracks ---

  tracks(): Tracks {
    const audio = this.stream?.getAudioTracks()[0] ?? undefined;
    return { local: { audio, video: undefined } } as Tracks;
  }

  // ----------------------------------------------------------------- devices ---

  private async list(kind: MediaDeviceKind): Promise<MediaDeviceInfo[]> {
    try {
      return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === kind);
    } catch {
      return [];
    }
  }

  getAllMics(): Promise<MediaDeviceInfo[]> {
    return this.list("audioinput");
  }

  getAllCams(): Promise<MediaDeviceInfo[]> {
    return this.list("videoinput");
  }

  getAllSpeakers(): Promise<MediaDeviceInfo[]> {
    return this.list("audiooutput");
  }

  updateMic(micId: string): void {
    this.micId = micId;
    // Fire and forget matches the base class's `void` signature. A failure to switch leaves the
    // previous track publishing, which is better than a call with no audio at all.
    void this.open().catch((err: unknown) =>
      console.warn("[BandReady] speaking: could not switch microphone", err),
    );
  }

  updateCam(): void {
    /* no camera in this app */
  }

  updateSpeaker(): void {
    /* output device selection is the browser's, not ours */
  }

  get selectedMic(): MediaDeviceInfo | Record<string, never> {
    return this.selected;
  }

  get selectedCam(): MediaDeviceInfo | Record<string, never> {
    return {};
  }

  get selectedSpeaker(): MediaDeviceInfo | Record<string, never> {
    return {};
  }

  // ------------------------------------------------------------------ toggles ---

  enableMic(enable: boolean): void {
    this._micEnabled = enable;
    // Toggling `enabled` rather than stopping the track: a stopped track cannot be restarted
    // and would need the transceiver renegotiated, and muting is what the button means.
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = enable));
  }

  enableCam(): void {
    /* no camera */
  }

  enableScreenShare(): void {
    /* no screen share */
  }

  get isMicEnabled(): boolean {
    return this._micEnabled;
  }

  get isCamEnabled(): boolean {
    return false;
  }

  get isSharingScreen(): boolean {
    return false;
  }

  // ------------------------------------------------- unused with this transport ---

  async userStartedSpeaking(): Promise<unknown> {
    // Only the Daily path interrupts locally buffered playback. Bot audio here is a remote
    // track played by the call screen, so there is nothing to interrupt.
    return undefined;
  }

  bufferBotAudio(): Int16Array | undefined {
    // Same reason. Returning undefined is the documented "not buffering" answer.
    return undefined;
  }
}
