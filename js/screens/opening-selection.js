/* =========================================================
   OPENING SELECTION — fixes the "auto strike / auto bowler"
   bug. Every time an innings begins (fresh match, 2nd innings,
   or a Super Over), the scorer must explicitly pick who's on
   strike, who's at the non-striker's end, and who's bowling.
   ========================================================= */

function goToOpeningSelection(){
  openingDraft = { striker: null, nonStriker: null, bowler: null };
  renderOpeningSelectionScreen();
  showScreen('openingScreen');
}

function renderOpeningList(containerId, names, selected, onPick){
  const wrap = $(containerId);
  wrap.innerHTML = '';
  (names || []).forEach(name=>{
    const item = document.createElement('div');
    item.className = 'next-bat-item' + (name === selected ? ' selected-pick' : '');
    item.textContent = name;
    item.addEventListener('click', ()=> onPick(name));
    wrap.appendChild(item);
  });
}

function renderOpeningSelectionScreen(){
  const battingNames = (state.battingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;
  const bowlingNames = (state.bowlingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;

  $('openingTitle').textContent = state.isSuperOver ? 'Super Over — Who\'s Opening?' : 'Who\'s Opening?';
  $('openingBattingTeamLabel').textContent = state.battingTeamName + ' (batting)';
  $('openingBowlingTeamLabel').textContent = state.bowlingTeamName + ' (bowling)';

  renderOpeningList('openingStrikerList', battingNames, openingDraft.striker, (name)=>{
    openingDraft.striker = name;
    if(openingDraft.nonStriker === name) openingDraft.nonStriker = null;
    renderOpeningSelectionScreen();
  });

  const nonStrikerOptions = battingNames.filter(n => n !== openingDraft.striker);
  renderOpeningList('openingNonStrikerList', nonStrikerOptions, openingDraft.nonStriker, (name)=>{
    openingDraft.nonStriker = name;
    renderOpeningSelectionScreen();
  });

  renderOpeningList('openingBowlerList', bowlingNames, openingDraft.bowler, (name)=>{
    openingDraft.bowler = name;
    renderOpeningSelectionScreen();
  });

  const ready = !!(openingDraft.striker && openingDraft.nonStriker && openingDraft.bowler);
  $('openingConfirmBtn').disabled = !ready;
}

$('openingConfirmBtn').addEventListener('click', ()=>{
  finalizeInningsStart();
});