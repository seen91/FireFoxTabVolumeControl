/**
 * AudioManager - Owns the output gains that apply the tab volume to Web
 * Audio, and routes media elements through them for amplification.
 *
 * Every AudioContext in the frame, ours or the page's, reaches the speakers
 * through one GainNode we put in front of its destination. Our own context
 * carries the media elements we route ourselves; page contexts (Foundry
 * VTT, games, SoundCloud) are rerouted by the connect() hook in
 * pageHooks.js. Either way the volume lives in one place: setVolume().
 */

class AudioManager {
  constructor() {
    this.audioContext = null;             // ours, created on first routed element
    this.outputs = new Map();             // AudioContext -> our GainNode in front of its destination
    this.volume = DEFAULT_VOLUME;
    this.routedElements = new WeakSet();  // routed through our createMediaElementSource
    this.blockedElements = new WeakSet(); // elements Web Audio rejected
    this.pageManagedElements = new WeakSet(); // elements the page routes through its own Web Audio
  }

  /**
   * The GainNode in front of the context's destination, created on first
   * use. Our calls go through Xray wrappers, so they bypass the page's
   * hooked connect().
   */
  outputFor(context) {
    let gain = this.outputs.get(context);
    if (!gain) {
      gain = context.createGain();
      gain.gain.value = this.volume / VOLUME_SCALE;
      gain.connect(context.destination);
      this.outputs.set(context, gain);
      context.addEventListener('statechange', () => {
        if (context.state === 'closed') this.outputs.delete(context);
      });
    }
    return gain;
  }

  setVolume(volume) {
    this.volume = volume;
    for (const gain of this.outputs.values()) {
      gain.gain.value = volume / VOLUME_SCALE;
    }
  }

  /**
   * Cross-origin media cannot be routed through Web Audio without CORS,
   * so we detect that up front and fall back to native HTML5 volume.
   *
   * An element with a crossorigin attribute is fetched with CORS; if it
   * plays at all, the server allowed it and Web Audio may process it.
   * blob: and data: URLs are the page's own bytes and always routable.
   */
  isCrossOriginElement(element) {
    if (element.crossOrigin !== null) return false;

    const sources = [
      element.currentSrc,
      element.src,
      element.querySelector('source')?.src
    ].filter(Boolean);

    if (sources.length === 0) return false;

    try {
      return sources.some(src => {
        if (src.startsWith('blob:') || src.startsWith('data:')) return false;
        return new URL(src).origin !== window.location.origin;
      });
    } catch {
      return true;
    }
  }

  /**
   * The page routes this element through its own Web Audio graph (see
   * pageHooks.js). An element feeds at most one source node, so we must
   * never take it; the page's graph ends in an output gain anyway.
   */
  markPageManaged(element) {
    this.pageManagedElements.add(element);
  }

  isPageManaged(element) {
    return this.pageManagedElements.has(element);
  }

  /**
   * Why this element must stay on the native HTML5 volume path (0-100%, no
   * amplification), or null when it can be routed through Web Audio. The
   * reason codes are shown to the user by the popup.
   *
   *   'rejected'     Web Audio refused the element when we tried.
   *   'detached'     Never inserted into the DOM. Such sites typically
   *                  route the element through their own Web Audio graph
   *                  later (SoundCloud does, lazily), and taking it first
   *                  would make their call throw.
   *   'cross-origin' Served from another origin without CORS.
   *
   * DRM is deliberately not a reason: Firefox lets Web Audio capture the
   * audio of EME-protected media (Netflix amplifies fine), it only blocks
   * captureStream() of the video. The catch is ordering: setMediaKeys()
   * fails on an element that is already captured, so the VolumeController
   * routes an element only once it is playing.
   *
   * Everything but 'rejected' is derived from the element's current state,
   * so the answer can change as the page attaches or re-sources it. The
   * VolumeController asks each time it applies a volume.
   */
  amplificationBlockReason(element) {
    if (this.blockedElements.has(element)) return 'rejected';
    if (!element.isConnected) return 'detached';
    if (this.isCrossOriginElement(element)) return 'cross-origin';
    return null;
  }

  /**
   * Whether the element is routed through our own context.
   */
  hasSource(element) {
    return this.routedElements.has(element);
  }

  /**
   * Route the element through our own context's output gain; returns
   * whether it is routed. Once routed, never disconnect: disconnecting a
   * MediaElementAudioSourceNode permanently kills audio for that element.
   */
  routeElement(element) {
    if (this.routedElements.has(element)) return true;
    if (this.pageManagedElements.has(element)) return false;
    if (this.amplificationBlockReason(element)) return false;

    try {
      this.audioContext ??= new AudioContext();
      const source = this.audioContext.createMediaElementSource(element);
      source.connect(this.outputFor(this.audioContext));
      this.routedElements.add(element);
      return true;
    } catch {
      this.blockedElements.add(element);
      return false;
    }
  }
}
