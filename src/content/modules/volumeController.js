/**
 * VolumeController - Decides how to apply a volume to each media element:
 * Web Audio gain when the element can be routed, native HTML5 volume as
 * fallback (e.g. cross-origin media that Web Audio would silence).
 */

class VolumeController {
  constructor(audioManager) {
    this.audioManager = audioManager;
    this.currentVolume = DEFAULT_VOLUME;
    this.html5Adjusted = new WeakSet(); // elements whose native volume we changed
    this.fallbackReasons = new WeakMap(); // html5Adjusted element -> why it is not routed
    // What the page last set an element's volume to (fed by pageHooks.js).
    // On the HTML5 fallback path the element's real volume is this value
    // times our factor, while the page keeps reading back its own value -
    // so a player that re-asserts its volume on 'volumechange' never fights
    // us, and our attenuation stacks on the page's own volume rather than
    // replacing it.
    this.pageVolumes = new WeakMap();
  }

  /**
   * The volume the page believes the element has.
   */
  getPageVolume(element) {
    const recorded = this.pageVolumes.get(element);
    return recorded !== undefined ? recorded : element.volume;
  }

  /**
   * The page wants to set the element's volume. Records the wish and
   * applies it, scaled by our factor when the element is on the HTML5 path.
   */
  setPageVolume(element, value) {
    const number = Number(value);
    if (!(Number.isFinite(number) && number >= 0 && number <= 1)) {
      element.volume = value; // let the native setter reject it
      return;
    }
    this.pageVolumes.set(element, number);
    element.volume = this.html5Adjusted.has(element)
      ? number * this._html5Factor(this.currentVolume)
      : number;
  }

  /**
   * Why the element is currently on the HTML5 fallback path instead of our
   * gain node, or null when it is routed, untouched (default volume) or not
   * yet decided. Unlike AudioManager.amplificationBlockReason this reflects
   * what we actually did, so the popup's warning follows reality.
   */
  fallbackReason(element) {
    return this.fallbackReasons.get(element) ?? null;
  }

  applyVolumeToElement(element, volume = this.currentVolume) {
    if (volume === DEFAULT_VOLUME) {
      if (this.audioManager.hasSource(element)) {
        this.audioManager.setGainValue(volume);
      } else if (this.html5Adjusted.has(element)) {
        this._restoreHtml5(element);
      }
      // Untouched element at default volume: leave the browser alone.
      return;
    }

    // An element already routed through our GainNode stays on the gain
    // path for good, whatever its current state - routing is permanent.
    if (!this.audioManager.hasSource(element)) {
      const blockReason = this.audioManager.amplificationBlockReason(element);
      if (blockReason) {
        this._applyHtml5Fallback(element, volume, blockReason);
        return;
      }

      // Route only media that is actually playing. Firefox rejects
      // setMediaKeys() on an element Web Audio has captured, and players
      // like Amazon Prime Video insert their <video> before attaching DRM
      // keys; encrypted media cannot get this far without its keys. Until
      // then the HTML5 path carries the volume, and the registry's
      // 'playing' listener brings the element back here.
      if (!this._isPlaying(element)) {
        this._applyHtml5Fallback(element, volume, null);
        return;
      }

      if (!this.audioManager.audioContext && !this.audioManager.initAudioContext()) {
        this._applyHtml5Fallback(element, volume, 'rejected');
        return;
      }
    }

    if (this.audioManager.tryConnectToAudioContext(element)) {
      // The element may have used the HTML5 fallback earlier (e.g. it was
      // created detached and attached later). Its native volume would now
      // stack on top of the gain, so restore it.
      if (this.html5Adjusted.has(element)) {
        this._restoreHtml5(element);
      }
      // A late joiner must pick up the current gain - a fresh GainNode
      // starts at 1.0 regardless of the tab's chosen volume.
      this.audioManager.setGainValue(volume);
    } else {
      // The attempt just failed; the manager now knows why.
      this._applyHtml5Fallback(
        element, volume, this.audioManager.amplificationBlockReason(element) || 'rejected'
      );
    }
  }

  _isPlaying(element) {
    return !element.paused && element.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  }

  // HTML5 volume maxes out at 1.0, so amplification is clamped away here.
  _html5Factor(volume) {
    return Math.min(volume, VOLUME_SCALE) / VOLUME_SCALE;
  }

  /**
   * A null reason means the element is only waiting to be routed (not yet
   * playing), which is no cause for a warning.
   */
  _applyHtml5Fallback(element, volume, reason) {
    const pageVolume = this.getPageVolume(element);
    this.pageVolumes.set(element, pageVolume);
    this.html5Adjusted.add(element);
    if (reason) {
      this.fallbackReasons.set(element, reason);
    } else {
      this.fallbackReasons.delete(element);
    }
    element.volume = pageVolume * this._html5Factor(volume);
  }

  /**
   * Undo an earlier fallback adjustment: give the page its own volume back.
   */
  _restoreHtml5(element) {
    this.html5Adjusted.delete(element);
    this.fallbackReasons.delete(element);
    element.volume = this.getPageVolume(element);
  }

  /**
   * Apply a new volume to every registered media element.
   */
  setVolume(volume, mediaRegistry) {
    this.currentVolume = volume;

    mediaRegistry.applyToAllElements((element) => {
      this.applyVolumeToElement(element, volume);
    });

    this.audioManager.setGainValue(volume);
    // Routing attempts above may have revealed elements Web Audio rejects.
    mediaRegistry.announceStatus();
  }
}
