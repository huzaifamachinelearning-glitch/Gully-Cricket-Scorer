/* =========================================================
   SETUP + TOSS + ROSTER ENTRY
   Collects team names, overs, both teams' player lists.
   Ends by handing off to the Opening Selection screen
   (js/screens/opening-selection.js) — no more auto-picked
   striker/bowler.
   ========================================================= */

$('playerBackBtn').addEventListener('click', ()=>{
  if(rosterMode || !state.matchStarted){
    showScreen('setupScreen');
  } else {
    showScreen('matchScreen');
    renderMatchScreen();
  }
});

/* ---------------- SETUP SCREEN ---------------- */
let setupPlayerCount = 11;

$('playerMinus').addEventListener('click', ()=>{
  setupPlayerCount = Math.max(2, setupPlayerCount - 1);
  $('playerCount').textContent = setupPlayerCount;
});
$('playerPlus').addEventListener('click', ()=>{
  setupPlayerCount = Math.min(30, setupPlayerCount + 1);
  $('playerCount').textContent = setupPlayerCount;
});

$('startMatchBtn').addEventListener('click', ()=>{
  const teamA = $('teamAName').value.trim() || 'Team A';
  const teamB = $('teamBName').value.trim() || 'Team B';
  const ov = parseInt($('oversLimit').value, 10);
  if(isNaN(ov) || ov < 1){
    toast('Overs is required — enter how many overs the match will be');
    $('oversLimit').focus();
    return;
  }
  state = defaultState();
  state.teamA = teamA;
  state.teamB = teamB;
  state.numPlayers = setupPlayerCount;
  state.oversLimit = ov;

  $('tossTeamABtn').textContent = teamA + ' bats first';
  $('tossTeamBBtn').textContent = teamB + ' bats first';
  showScreen('tossScreen');
});

$('watchMatchBtn').addEventListener('click', ()=>{
  $('watchCodeInput').value = '';
  openModal('watchCodeModal');
});
$('watchCodeConfirm').addEventListener('click', ()=>{
  const code = $('watchCodeInput').value.trim().toUpperCase();
  if(!code){ toast('Enter the match code'); return; }
  closeModal('watchCodeModal');
  joinMatchAsViewer(code);
});

/* ---------------- TOSS SCREEN ---------------- */
function chooseBattingTeam(name){
  state.battingTeamName = name;
  state.bowlingTeamName = (name === state.teamA) ? state.teamB : state.teamA;
  rosterMode = true;
  rosterStage = 'A';
  rosterDraftNames = Array.from({length: state.numPlayers}, (_, i)=>'Player '+(i+1));
  renderRosterScreen();
  showScreen('playerScreen');
}
$('tossTeamABtn').addEventListener('click', ()=> chooseBattingTeam(state.teamA));
$('tossTeamBBtn').addEventListener('click', ()=> chooseBattingTeam(state.teamB));

/* ---------------- ROSTER SCREEN (pre-match: BOTH teams' player names) ---------------- */
function renderRosterScreen(){
  $('renameTabs').classList.add('hidden'); // tabs are only for mid-match rename
  const teamLabel = rosterStage === 'A' ? state.teamA : state.teamB;
  $('playerScreenTitle').textContent = teamLabel + ' — Enter Players';
  const wrap = $('playerListWrap');
  wrap.innerHTML = '';

  rosterDraftNames.forEach((name, idx)=>{
    const row = document.createElement('div');
    row.className = 'player-row';

    const num = document.createElement('div');
    num.className = 'p-num';
    num.textContent = idx+1;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = name;
    input.addEventListener('input', ()=>{ rosterDraftNames[idx] = input.value; });

    const rm = document.createElement('button');
    rm.className = 'remove-player';
    rm.innerHTML = '✕';
    rm.addEventListener('click', ()=>{
      if(rosterDraftNames.length <= 2){ toast('Need at least 2 players'); return; }
      rosterDraftNames.splice(idx,1);
      renderRosterScreen();
    });

    row.appendChild(num);
    row.appendChild(input);
    row.appendChild(rm);
    wrap.appendChild(row);
  });

  const addRow = document.createElement('div');
  addRow.className = 'add-player-row';
  addRow.textContent = '+ Add Player';
  addRow.addEventListener('click', ()=>{
    rosterDraftNames.push('Player ' + (rosterDraftNames.length+1));
    renderRosterScreen();
  });
  wrap.appendChild(addRow);

  $('playersDoneBtn').textContent = rosterStage === 'A' ? (state.teamB + ' Players →') : 'Done — Pick Openers →';
}

$('playersDoneBtn').addEventListener('click', ()=>{
  if(rosterMode){
    if(rosterStage === 'A'){
      state.teamARoster = [...rosterDraftNames];
      rosterStage = 'B';
      rosterDraftNames = Array.from({length: state.numPlayers}, (_, i)=>'Player '+(i+1));
      renderRosterScreen();
      return;
    } else {
      state.teamBRoster = [...rosterDraftNames];
      rosterMode = false;
      state.matchStarted = true;
      if(!state.matchCode) state.matchCode = generateMatchCode();
      openingContext = 'new';
      goToOpeningSelection();
      return;
    }
  }
  showScreen('matchScreen');
  renderMatchScreen();
});