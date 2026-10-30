/**
 * PageHooks - Wraps a few of the PAGE's own prototypes so media the DOM
 * never shows us still gets registered, so audio the page plays through
 * its own Web Audio graphs passes our gain, and so the page cannot undo
 * the volume we set on elements that stay on the HTML5 path.
 *
 * Sites like SoundCloud create their <audio> with document.createElement()
 * and never attach it, so querySelectorAll, MutationObserver and
 * document-level 'play' listeners never see it. Overriding window.Audio or
 * document.createElement from here would only patch the content-script
 * sandbox, never the page (Xray vision). Instead we reach the page's real
 * globals through window.wrappedJSObject and hand our wrapper back to the
 * page with exportFunction(). The wrappers run in OUR compartment, so a
 * misbehaving page cannot reach our state through them.
 *
 * Must run synchronously at document_start, before any page script runs.
 * These APIs are Firefox-only; everything is a no-op elsewhere.
 */

/**
 * Normalize an object handed to us by page code to its Xray wrapper, so
 * identity matches the elements we find through DOM queries.
 */
function toXray(object) {
  return typeof XPCNativeWrapper === 'function' ? XPCNativeWrapper(object) : object;
}

/**
 * Wrap HTMLMediaElement.prototype.play(): every element that plays, attached
 * or not, gets registered before playback starts.
 */
function installPlayHook(pageWindow, mediaRegistry) {
  const proto = pageWindow.HTMLMediaElement?.prototype;
  if (!proto || typeof proto.play !== 'function') return;

  const originalPlay = proto.play;

  const hookedPlay = function (...args) {
    try {
      mediaRegistry.registerMediaElement(toXray(this));
    } catch {
      // Our bookkeeping must never break the page's playback.
    }
    // Reflect.apply keeps the args array in our compartment. Passing it to
    // page code (originalPlay.apply(this, args)) would hand the page a
    // content-script array, which fails with "Permission denied to access
    // property 'length'".
    return Reflect.apply(originalPlay, this, args);
  };

  proto.play = exportFunction(hookedPlay, pageWindow);
}

/**
 * The page routes this element through its own Web Audio graph. It must
 * stay on the page's graph (whose output our output gain controls),
 * and any HTML5 volume we put on it must come off.
 */
function handOverToPage(element, audioManager, volumeController) {
  audioManager.markPageManaged(element);
  volumeController.handOverToPage(element);
}

/**
 * Wrap AudioContext.prototype.createMediaElementSource(): an element can
 * only ever feed ONE MediaElementAudioSourceNode. If the page routes an
 * element through its own Web Audio graph (SoundCloud does, lazily, for
 * fades) and we had taken the element first, the page's call would throw
 * and its player would break. Marking page-managed elements keeps them out
 * of our own graph.
 */
function installWebAudioHook(pageWindow, audioManager, volumeController) {
  const proto = pageWindow.AudioContext?.prototype;
  if (!proto || typeof proto.createMediaElementSource !== 'function') return;

  const originalCreate = proto.createMediaElementSource;

  const hookedCreate = function (...args) {
    try {
      if (args[0]) handOverToPage(toXray(args[0]), audioManager, volumeController);
    } catch {
      // Bookkeeping only - never interfere with the page's audio graph.
    }
    return Reflect.apply(originalCreate, this, args);
  };

  proto.createMediaElementSource = exportFunction(hookedCreate, pageWindow);
}

/**
 * Wrap AudioNode.prototype.connect() and disconnect() so that whatever the
 * page sends to the speakers of an AudioContext passes through our output
 * gain instead (AudioManager.outputFor). Sites like Foundry VTT
 * play decoded AudioBuffers straight into Web Audio: there is no media
 * element for us to find, and this is the only place to reach their sound.
 *
 * Connecting a MediaElementAudioSourceNode also marks its element as
 * page-managed, which catches pages that build the node with its
 * constructor rather than createMediaElementSource().
 */
function installAudioOutputHook(pageWindow, audioManager, volumeController) {
  const proto = pageWindow.AudioNode?.prototype;
  if (!proto || typeof proto.connect !== 'function' || typeof proto.disconnect !== 'function') return;

  const originalConnect = proto.connect;
  const originalDisconnect = proto.disconnect;

  // Our gain node when `target` is the destination of a realtime context;
  // null otherwise (OfflineAudioContext renders to a buffer, not speakers).
  const outputFor = (node, target) => {
    try {
      if (!target) return null;
      const context = toXray(node).context;
      if (!(context instanceof AudioContext)) return null;
      if (toXray(target) !== context.destination) return null;
      return audioManager.outputFor(context);
    } catch {
      return null;
    }
  };

  const hookedConnect = function (...args) {
    try {
      const node = toXray(this);
      if (node instanceof MediaElementAudioSourceNode && node.mediaElement) {
        handOverToPage(node.mediaElement, audioManager, volumeController);
      }
    } catch {
      // Bookkeeping only.
    }
    const output = outputFor(this, args[0]);
    if (!output) return Reflect.apply(originalConnect, this, args);
    Reflect.apply(originalConnect, this, [output, ...args.slice(1)]);
    // connect() returns its target for chaining; keep that the page's node.
    return args[0];
  };

  const hookedDisconnect = function (...args) {
    const output = outputFor(this, args[0]);
    if (!output) return Reflect.apply(originalDisconnect, this, args);
    return Reflect.apply(originalDisconnect, this, [output, ...args.slice(1)]);
  };

  proto.connect = exportFunction(hookedConnect, pageWindow);
  proto.disconnect = exportFunction(hookedDisconnect, pageWindow);
}

/**
 * Wrap the HTMLMediaElement.prototype.volume accessor. Players commonly
 * re-apply their own volume whenever they see a 'volumechange', which would
 * undo any value we write. With the accessor hooked the page reads back the
 * value it set, so it has no reason to fight, and the element's real volume
 * is the page's value times our factor (see VolumeController.setPageVolume).
 *
 * Our own reads and writes go through Xray wrappers, which bypass page-side
 * prototype changes and hit the native accessor directly.
 */
function installVolumeHook(pageWindow, volumeController) {
  const proto = pageWindow.HTMLMediaElement?.prototype;
  if (!proto) return;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'volume');
  if (!descriptor?.get || !descriptor?.set) return;

  const hookedVolumeGet = function () {
    const element = toXray(this);
    try {
      return volumeController.getPageVolume(element);
    } catch {
      return element.volume;
    }
  };

  const hookedVolumeSet = function (value) {
    volumeController.setPageVolume(toXray(this), value);
  };

  Object.defineProperty(proto, 'volume', {
    get: exportFunction(hookedVolumeGet, pageWindow),
    set: exportFunction(hookedVolumeSet, pageWindow),
    enumerable: descriptor.enumerable,
    configurable: true
  });
}

function installPageHooks(mediaRegistry, audioManager, volumeController) {
  try {
    const pageWindow = window.wrappedJSObject;
    if (!pageWindow || typeof exportFunction !== 'function') return;

    installPlayHook(pageWindow, mediaRegistry);
    installWebAudioHook(pageWindow, audioManager, volumeController);
    installAudioOutputHook(pageWindow, audioManager, volumeController);
    installVolumeHook(pageWindow, volumeController);
  } catch (error) {
    console.warn('Tab Volume Control: could not install page hooks', error);
  }
}
