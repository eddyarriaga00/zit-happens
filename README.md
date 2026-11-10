# Zit Happens

A gloriously gross pimple popping game for iPhone. Plain HTML/CSS/JS, no build step.

## Play
Open the GitHub Pages link in Safari, tap **Share → Add to Home Screen**.

## Develop
```bash
python3 -m http.server 8765
```
Then open http://localhost:8765.

- `js/pimple.js` – pimple types and the squeeze/drain logic (tune numbers in `TYPES`)
- `js/main.js` – levels, scoring, input, menus
- `js/ear.js` – ear wax mode
- `js/fx.js` – droplets, splats, wipe
- `js/skin.js` – skin texture and tones
- `js/audio.js` / `js/haptics.js` – synthesized sound, haptics
- `sw.js` – offline cache (bump `VERSION` when files are added or renamed)
- `tools/make_icons.py` – redraws the app icons
