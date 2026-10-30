# Manual test pages

Pages for checking the extension by hand in Firefox. They are not part of the
release package (`create-release.sh` only ships `src/` and the top-level files).

Serve this folder over localhost, since DRM (EME) needs a secure context:

```
cd test && python3 -m http.server 8765
```

Load the extension from `about:debugging` → This Firefox → Load Temporary
Add-on (pick `manifest.json`), then open:

- `http://localhost:8765/webaudio.html` - audio played through the page's own
  Web Audio graph (Foundry VTT, games, SoundCloud) and a plain `<audio>`.
- `http://localhost:8765/drm.html` - the extension must not capture media before
  the page attaches DRM keys (issue #6).

Each page states its expected results.
