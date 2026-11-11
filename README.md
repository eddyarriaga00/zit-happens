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
- `js/levels.js` – the patients (levels), their goals, and shop items
- `js/supplies.js` – the openable bottles, wipes, pad jar, gel, steamer and bin
- `js/tools.js` – how tools look in your hand (needle, tweezers, spray mist)
- `js/steps.js` – spa steps (lather, rinse, steam, soothe)
- `js/fx.js` – droplets, splats, wipe
- `js/skin.js` – skin texture, tones, and the body-area scenes (forehead, nose, cheek, chin, back, shoulder)
- `js/facescene.js` – the full realistic face you play on (and blinking)
- `js/salon.js` – the Makeup mode and the fringe-cutting used by the salon
- `js/hairsalon.js` – the Hair Salon: client visits, stations and upgrades
- `js/faces.js` – 2D patient portraits and each patient's look
- `js/audio.js` / `js/haptics.js` – synthesized sound, haptics
- `sw.js` – offline cache (bump `VERSION` when files are added or renamed)
- `tools/make_icons.py` – redraws the app icons

## Added in v23

- Pore Strip and Brows close-up modes (`js/extras.js`)
- VIP visits: one client, four treatments, a review and a tip; one daily VIP pays double
- Home screen of mode tiles, HUD progress bar, guest book of reviews
- Portraits painted by the same renderer as the in-game face
