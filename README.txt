GULLY SCORE — Cricket Scorer
=============================

HOW TO USE
1. Open index.html in any phone/laptop browser (double-tap the file, or "Open with Chrome").
2. Setup screen: enter both team names, number of players (2-30), and OVERS (required — this is what
   ends the innings and the match automatically).
3. Toss screen: pick which team bats first.
4. Enter BOTH teams' player names — first the team batting first, then the other team. Both rosters
   are saved for the whole match, so you never have to re-type names when innings switch, and the
   bowler picker always shows real names from the bowling side.
5. Scoring screen:
   - Tap 0/1/2/3/4/5/6 for runs on a normal ball.
   - Tap "+" to add any custom run value (7, 8, etc).
   - WIDE / NO BALL → adds 1 run, does NOT count as a ball, strike stays same. A no-ball also triggers
     a FREE HIT on the next ball (batsman can't be given out except run-out).
   - "⋯ More Extras" → reveals BYE / LEG BYE (counts as a legal ball, runs go to extras not the batsman).
   - RUN DECLARE → adds runs to team total only (no ball, no strike change, no batsman credit) — use for
     gully-rule declared runs (hit a wall, tree, etc).
   - OUT → pick how out (Bowled/Caught/Run Out/etc). For Run Out, enter runs completed first. Then pick
     the next batsman from the list.
   - Strike automatically swaps on odd runs and at the end of every over (6 legal balls) — you'll see an
     "OVER COMPLETE" flash card with that over's runs/wickets before it continues.
   - When overs run out or the whole team is out, the innings/match locks automatically and a summary
     card appears — buttons stop working until you tap "Start 2nd Innings" or "Start New Match".
   - ↺ (top-right) undoes the last action — use this if you tap the wrong button.
   - Boundary/wicket/over sounds play automatically (toggle off anytime from the menu).
6. Change Bowler now shows a tappable list of the actual bowling team's players (from the roster you
   entered) — no need to type names during the match. A text field is still there for a substitute.
7. Hamburger menu (☰ top-left):
   - New Match — wipes everything and starts fresh.
   - Players & Rename — edit player names anytime (also updates the bowler list for that team).
   - Match History — full ball-by-ball log of everything that happened, so you can always show
     someone exactly how the score reached where it is.
   - Full Scorecard / Share — proper batting + bowling scorecard for both innings (tap the bowler
     box anytime to jump straight here), with a "Share / Download" button that generates a shareable
     image (WhatsApp / Instagram ready).
   - Past Matches — every completed match is saved here automatically (teams, result, both innings'
     scores) so old results aren't lost when you start a new match.
   - Switch / End Innings — locks the current score, sets the target, and moves straight to the
     2nd innings using the roster you already entered.
   - Sound — toggle scoring sound effects on/off.
   - Reset Everything — same as New Match.
8. Player of the Match — shown automatically on the final match-complete flash card (top scorer +
   best bowler across both innings).

INSTALL AS AN APP (PWA)
Once deployed online (GitHub Pages / Netlify), open the link in Chrome on your phone, then:
   Chrome menu (⋮) → "Add to Home Screen" / "Install App"
This adds a real app icon and lets it open full-screen without the browser address bar. It also
works offline after the first load (manifest.json, icon.svg, and sw.js power this — keep them in
the same folder as the other files).

NOTES
- All data is saved in your browser automatically (localStorage). Closing the browser or refreshing will NOT lose your match — it reopens exactly where you left off.
- Works fully offline after the first load, except the Google Fonts (visual only, app still works without internet).
- No installation, no server — just 3 files: index.html, style.css, script.js. Keep all three in the same folder.

Bas ek baar setup karo, phir har ball pe tap karke score continue karo. Ladai khatam! 🏏