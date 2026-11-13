# Zit Happens: improvement plan

Written 2026-11-13. The game now uses painted portraits for every face. This plan is about making
everything else live up to them. Items are in the order I intend to do them; each one ships on its own.

## 0. Needs a look on the real iPhone (only you can check these)
- [ ] Popping and wiping work on v111 (touches are now measured from the drawing area itself).
- [ ] The blank strip at the bottom of the screen: still there? A screenshot of the menu and of a level helps.
- [ ] Does anything stutter? Which screen?

## 1. Finish the move to painted art (biggest visible gap)
- [x] **Back and shoulder levels** (v112): painted, three skin tones each; spots, foam and mess stay on
      bare skin via a colour-based skin map. Could add two more tones later.
- [ ] **Ear Wax**: the ear is still code-drawn. Paint the outer ear per skin tone; keep the canal and
      wax drawn so the gameplay stays.
- [ ] **Scalp**: paint the parted scalp; keep flakes, lice and nits drawn.
- [ ] **Hair Salon hair**: painted hair pieces per style in a neutral shade, tinted to any dye colour,
      instead of code-drawn strands.
- [ ] **Menu and thumbnails**: crop portraits properly for the round thumbnails and the VIP card.

## 2. Make the painted faces feel alive
- [~] **Expressions from art, not lines**: eyes-closed painting for all 13 girls is in (v113), used for
      blinks, washing and eyeshadow. A painted smile for all 13 is in too (v114), faded in when she is pleased.
      Still to paint: a wince (hard squeeze).
- [ ] **Each face its own shape**: measure every portrait's real face outline, so foam, masks, gel and
      mess follow her jaw and cheeks exactly instead of one shared outline.
- [ ] **Sharper close-ups**: larger portraits (or 2x upscales) so leaning in on a spot stays crisp.
- [ ] **More girls**: 20 to 25 portraits, a few older clients, different features, so repeats are rare.
- [ ] **Regulars keep their face**: a named VIP always gets the same portrait.

## 3. Make the treatments look as good as the faces
- [ ] Pimples: softer redness that takes the tone of her painted skin, a healing mark that fades.
- [ ] Pus, foam, gel and masks: thicker, glossier, with soft edges; mask peels in sheets.
- [ ] Water droplets and steam that follow her face shape.
- [ ] Tools drawn in the same painted style (tweezers, loop, needle, pads, bottles).

## 4. Feel and sound
- [ ] Haptics and sounds tuned per action (pop, squeeze, peel, snip).
- [ ] Shorter waits between steps; nothing blocks while a face paints.
- [ ] One-thumb play checked on every mode (reach, button sizes, nothing under the toolbar).

## 5. Phone basics
- [x] Smaller download, first cut (v115): all art re-encoded, 12 MB down to 5.8 MB. Still open: WebP at two sizes.
- [ ] Loading screen on first open instead of a blank moment.
- [ ] Works offline after first open (check the saved file list covers all art).
- [ ] The blank bottom strip, fixed in a way that is confirmed on the phone.

## 6. More to do in the game (older ideas, after the look is right)
- [ ] Clients ask for things in Brows, Makeup and Hair, and tip more when they get them.
- [ ] Forehead and chin pore strips.
- [ ] A timed Zen option.
- [ ] More to spend coins on.

## How each item gets done
1. Build it. 2. Run the scripted playthrough at iPhone size (touches only count where a finger can
reach). 3. Ship it and note it in NIGHTLOG.md with what was and was not checked.
New art is generated in ChatGPT with one fixed recipe so it all matches.
