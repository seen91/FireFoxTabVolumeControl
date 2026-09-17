/**
 * AudioManager - Routes media elements through Web Audio for amplification.
 */

class AudioManager {
  constructor() {
    this.audioContext = null;
    this.gainNode = null;
    this.routedElements = new WeakSet();  // ever routed through createMediaElementSource
    this.connectedElements = new Set();
    this.blockedElements = new WeakSet(); // elements Web Audio rejected
    this.pageManagedElements = new WeakSet(); // elements the page routes through its own Web Audio
  }

  initAudioContext() {
    if (this.audioContext) return true;

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      return true;
    } catch (error) {
      console.warn('Tab Volume Control: AudioContext unavailable', error);
      return false;
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
   * The page called createMediaElementSource() on this element. An element
   * feeds at most one source node, so it is the page's now - see pageHooks.js.
   */
  markPageManaged(element) {
    this.pageManagedElements.add(element);
  }

  /**
   * Why this element must stay on the native HTML5 volume path (0-100%, no
   * amplification), or null when it can be - or already is - routed through
   * Web Audio. The reason codes are shown to the user by the popup.
   *
   *   'page-audio'   The page routes it through its own Web Audio graph; an
   *                  element feeds at most one source node and taking it
   *                  first would break the site's player (SoundCloud).
   *   'rejected'     Web Audio refused the element when we tried.
   *   'detached'     Never inserted into the DOM. Such sites typically own
   *                  the element's Web Audio graph, so it is not routed.
   *   'cross-origin' Served from another origin without CORS.
   *
   * DRM is deliberately not a reason: Firefox lets Web Audio capture the
   * audio of EME-protected media (Netflix amplifies fine), it only blocks
   * captureStream() of the video.
   *
   * Everything but 'rejected' and 'page-audio' is derived from the element's
   * current state, so the answer can change as the page attaches or
   * re-sources it. The VolumeController asks each time it applies a volume.
   */
  amplificationBlockReason(element) {
    if (this.routedElements.has(element)) return null;
    if (this.pageManagedElements.has(element)) return 'page-audio';
    if (this.blockedElements.has(element)) return 'rejected';
    if (!element.isConnected) return 'detached';
    if (this.isCrossOriginElement(element)) return 'cross-origin';
    return null;
  }

  shouldBlockAmplification(element) {
    return this.amplificationBlockReason(element) !== null;
  }

  /**
   * Whether the element was ever routed through Web Audio.
   */
  hasSource(element) {
    return this.routedElements.has(element);
  }

  /**
   * Try to route element through Web Audio. Once routed, never disconnect:
   * disconnecting a MediaElementAudioSourceNode permanently kills audio for
   * that element.
   */
  tryConnectToAudioContext(element) {
    if (!this.audioContext || !this.gainNode) return false;
    if (this.connectedElements.has(element)) return true;

    if (this.routedElements.has(element)) {
      // Already routed previously, re-track without reconnecting.
      this.connectedElements.add(element);
      return true;
    }

    if (this.shouldBlockAmplification(element)) {
      return false;
    }

    try {
      const source = this.audioContext.createMediaElementSource(element);
      source.connect(this.gainNode);
      this.routedElements.add(element);
      this.connectedElements.add(element);
      return true;
    } catch {
      this.blockedElements.add(element);
      return false;
    }
  }

  setGainValue(volume) {
    if (this.gainNode && this.connectedElements.size > 0) {
      this.gainNode.gain.value = volume / VOLUME_SCALE;
    }
  }

  /**
   * Stop tracking an element without disconnecting its source node.
   * The audio routing remains intact - disconnecting would kill playback.
   */
  cleanupAudioSource(element) {
    this.connectedElements.delete(element);
  }
}
