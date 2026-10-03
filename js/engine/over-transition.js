/* =========================================================
   OVER TRANSITION — fixes the bug where the same bowler kept
   bowling every over. After the "Over Complete" flash card is
   dismissed, this prompts for the next over's bowler and hides
   the bowler who just finished (can't bowl two overs in a row).
   ========================================================= */

function maybeShowNextBowlerPrompt(){
  if(!state || !state.matchStarted || state.matchOver || state.inningsOver || state.isViewer) return;
  const previousBowler = state.bowlerName;
  $('bowlerModalHint').textContent = 'New over — pick who\'s bowling (can\'t be ' + previousBowler + ', they just finished their over)';
  $('bowlerModalHint').classList.remove('hidden');
  $('bowlerNameInput').value = '';
  renderBowlerChoices(previousBowler);
  openModal('bowlerModal');
}