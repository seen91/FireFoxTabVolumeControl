/**
 * MediaElementRegistry - Tracks media elements and applies the current
 * volume to them as they appear or start playing.
 */

class MediaElementRegistry {
  constructor(volumeController, audioManager) {
    this.mediaElements = new Set();
    this.listenersAttached = new WeakSet();
    this.volumeController = volumeController;
    this.audioManager = audioManager;
    // Called whenever the answer to getAmplificationStatus() may have
    // changed; content.js forwards the status to the background.
    this.onStatusChange = null;
  }

  /**
   * Whether the media playing right now can be boosted, judged by what we
   * actually did with it rather than by guessing from element properties:
   * an element routed through our gain node is amplified; an element we had
   * to put on the HTML5 fallback path is not, and the recorded reason says
   * why. Only playing, unmuted elements count - preloaded videos, idle ads,
   * a player the page paused and left behind, and muted helper elements
   * (SPAs like Netflix keep a few around) must not speak for the tab. If
   * anything audible is routed the tab is fine even when a side element is
   * not.
   *
   * Null means "no news": nothing plays, or what plays is untouched (default
   * volume, no decision made yet). The background then keeps the previous
   * verdict, so a warning does not flicker as the slider crosses 100% and
   * only a routed element - proof that boosting works - withdraws it.
   */
  getAmplificationStatus() {
    let limitedReason = null;
    for (const element of this.mediaElements) {
      if (element.paused || element.muted) continue;
      if (this.audioManager.hasSource(element) || this.audioManager.isPageManaged(element)) {
        return { limited: false, reason: null };
      }
      limitedReason ??= this.volumeController.fallbackReason(element);
    }
    return limitedReason ? { limited: true, reason: limitedReason } : null;
  }

  announceStatus() {
    if (this.onStatusChange) this.onStatusChange();
  }

  registerMediaElement(element) {
    if (!(element instanceof HTMLMediaElement)) return;

    if (this.mediaElements.has(element)) {
      // Seen again, e.g. the observer or a scan found an element that was
      // first registered detached through the play() hook and has since
      // been inserted into the DOM. That can change whether it is routable,
      // so revisit a playing element's path and the frame's status.
      if (!element.paused) this.volumeController.applyVolumeToElement(element);
      this.announceStatus();
      return;
    }

    this.mediaElements.add(element);
    if (!element.isConnected) {
      // Only reachable through the page-level play() hook; worth a trace.
      console.debug('Tab Volume Control: registered detached media element', element);
    }
    this.volumeController.applyVolumeToElement(element);
    this.announceStatus();

    // Attached once per element ever - an element can be untracked and
    // re-registered (SPAs re-parent players), and listeners would otherwise
    // accumulate. No cleanup on 'ended'/'error' - sites like Reddit fire
    // these during normal operation and the element may play again.
    if (!this.listenersAttached.has(element)) {
      this.listenersAttached.add(element);
      // Re-apply on play: elements skipped while paused pick up the volume
      // here, and the status is derived from playing elements.
      element.addEventListener('play', () => {
        this.volumeController.applyVolumeToElement(element);
        this.announceStatus();
      });
      // Media is routed through Web Audio only once it is actually playing
      // (see VolumeController), which 'play' alone does not guarantee.
      element.addEventListener('playing', () => {
        this.volumeController.applyVolumeToElement(element);
        this.announceStatus();
      });
      // Muting or unmuting changes which elements the status counts.
      element.addEventListener('volumechange', () => this.announceStatus());
    }
  }

  hasElements() {
    return this.mediaElements.size > 0;
  }

  /**
   * Stop tracking an element. Its Web Audio routing, if any, stays intact -
   * disconnecting would permanently break the element's audio.
   */
  cleanupMediaElement(element) {
    if (this.mediaElements.delete(element)) this.announceStatus();
  }

  /**
   * Drop elements that are not in the DOM and not playing.
   *
   * Removing a media element from its document pauses it, so a detached
   * element that is still playing was never inserted (SoundCloud's player,
   * found through the page-level play() hook) and must stay tracked. Once
   * such an element pauses it can be dropped: the hook re-registers it the
   * next time the page calls play().
   */
  cleanupOrphanedElements() {
    for (const element of [...this.mediaElements]) {
      if (!element.isConnected && element.paused) {
        this.cleanupMediaElement(element);
      }
    }
  }

  applyToAllElements(applyFunction) {
    this.mediaElements.forEach(element => {
      if (!element.paused) {
        applyFunction(element);
      }
    });
  }
}
