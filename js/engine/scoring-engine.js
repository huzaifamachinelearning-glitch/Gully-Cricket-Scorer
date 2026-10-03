/* =========================================================
   SCORING ENGINE — every cricket rule lives here.
   finalizeInningsStart() is the one place that actually resets
   scores and builds the batting line-up; it only runs after the
   Opening Selection screen confirms striker/non-striker/bowler.
   ========================================================= */

/* ---- Finalize the start of ANY innings (new match / 2nd innings / Super Over) ---- */
function finalizeInningsStart(){
  const battingNames = (state.battingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;
  const bowlingNames = (state.bowlingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;

  state.players = battingNames.map(n => ({ name: n, runs: 0, balls: 0, out: false, howOut: '' }));

  let sIdx = battingNames.indexOf(openingDraft.striker);
  let nIdx = battingNames.indexOf(openingDraft.nonStriker);
  state.strikerIdx = sIdx >= 0 ? sIdx : 0;
  state.nonStrikerIdx = (nIdx >= 0 && nIdx !== state.strikerIdx) ? nIdx : (state.players.length > 1 ? 1 : 0);

  state.bowlerName = openingDraft.bowler || bowlingNames[0] || 'Bowler 1';
  state.bowlerStats = {};
  ensureBowlerStats(state.bowlerName);

  state.totalRuns = 0;
  state.wickets = 0;
  state.legalBalls = 0;
  state.totalLegalBalls = 0;
  state.extras = { wide:0, noball:0, bye:0, legbye:0 };
  state.thisOverEvents = [];
  state.currentOverRuns = 0;
  state.currentOverWickets = 0;
  state.freeHit = false;
  state.pendingOverFlash = null;

  const targetText = state.target !== null ? (' — target: ' + state.target + ' runs') : (' — ' + state.oversLimit + ' overs match');
  logEvent(state.battingTeamName + ' innings begins' + targetText + '. Openers: ' + openingDraft.striker + ' & ' + openingDraft.nonStriker + ', bowling: ' + openingDraft.bowler);

  saveState();
  showScreen('matchScreen');
  renderMatchScreen();
}

/* ---- Strike rotation ---- */
function swapStrike(){
  const t = state.strikerIdx; state.strikerIdx = state.nonStrikerIdx; state.nonStrikerIdx = t;
}
function rotateStrikeIfOdd(runs){
  if(runs % 2 === 1) swapStrike();
}
function addBallChip(label, type){
  state.thisOverEvents.push({label, type});
}
function maybeCompleteOver(){
  if(state.legalBalls === 6){
    const overNum = Math.floor(state.totalLegalBalls/6);
    const runsThisOver = state.currentOverRuns;
    const wktsThisOver = state.currentOverWickets;
    state.legalBalls = 0;
    state.thisOverEvents = [];
    state.currentOverRuns = 0;
    state.currentOverWickets = 0;
    swapStrike();
    logEvent('— End of Over ' + overNum + ': ' + runsThisOver + ' run(s), ' + wktsThisOver + ' wicket(s). Strike changes. —');
    playSound('over');
    state.pendingOverFlash = { overNum, runsThisOver, wktsThisOver };
  }
}

/* ---- Match/innings completion checks ---- */
function checkMatchStatus(){
  const allOut = state.wickets >= state.players.length - 1;
  const oversDone = state.oversLimit && state.totalLegalBalls >= state.oversLimit*6;

  if(state.innings === 1){
    if((allOut || oversDone) && !state.inningsOver){
      state.inningsOver = true;
      logEvent('Innings over: ' + state.totalRuns + '/' + state.wickets + ' in ' + oversStr(state.totalLegalBalls) + ' overs');
    }
  } else {
    if(state.target !== null && state.totalRuns >= state.target && !state.matchOver){
      state.matchOver = true;
      logEvent('Match won! ' + matchOverText());
    } else if((allOut || oversDone) && !state.matchOver){
      state.matchOver = true;
      logEvent('Match over. ' + matchOverText());
    }
  }
}

function matchOverText(){
  if(state.totalRuns >= state.target){
    const wLeft = state.players.length - 1 - state.wickets;
    return '🏆 ' + state.battingTeamName + ' won by ' + wLeft + ' wicket(s)!';
  }
  const diff = state.target - 1 - state.totalRuns;
  if(diff === 0) return '🤝 Match Tied!';
  const winner = (state.battingTeamName === state.teamA) ? state.teamB : state.teamA;
  return '🏆 ' + winner + ' won by ' + diff + ' run(s)!';
}
function isTiedResult(){
  return state.target !== null && state.totalRuns === state.target - 1;
}

/* ---- Central post-ball flow: save, then decide what to show ---- */
function finishBall(){
  checkMatchStatus();
  handlePostBallUI();
}
function handlePostBallUI(){
  saveState();
  if(state.matchOver && !state.matchFlashShown){
    state.matchFlashShown = true;
    saveState();
    savePastMatch();
    showInningsFlash(true);
    return;
  }
  if(state.inningsOver && !state.inningsFlashShown){
    state.inningsFlashShown = true;
    saveState();
    showInningsFlash(false);
    return;
  }
  if(state.pendingOverFlash){
    const info = state.pendingOverFlash;
    state.pendingOverFlash = null;
    saveState();
    showOverFlash(info);
    return;
  }
  renderMatchScreen();
}

/* ---- Normal legal delivery (0-6 runs or custom) ---- */
function playLegalDelivery(runs){
  if(state.matchOver || state.inningsOver){ toast('Innings/Match is over'); return; }
  pushHistory();
  const striker = state.players[state.strikerIdx];
  striker.balls++;
  striker.runs += runs;
  state.totalRuns += runs;
  state.legalBalls++;
  state.totalLegalBalls++;
  state.currentOverRuns += runs;
  const bs = ensureBowlerStats(state.bowlerName);
  bs.balls++; bs.runs += runs;
  addBallChip(String(runs), runs>=4 ? 'boundary' : 'normal');
  logEvent(striker.name + ' scores ' + runs + (runs===6?' — SIX! 🎉':(runs===4?' — FOUR!':' run(s)')));
  if(runs === 4) playSound('four');
  if(runs === 6) playSound('six');
  state.freeHit = false;
  rotateStrikeIfOdd(runs);
  maybeCompleteOver();
  finishBall();
}

/* ---- Wide ---- */
function playWide(){
  if(state.matchOver || state.inningsOver){ toast('Innings/Match is over'); return; }
  pushHistory();
  state.totalRuns += 1;
  state.extras.wide += 1;
  state.currentOverRuns += 1;
  const bs = ensureBowlerStats(state.bowlerName);
  bs.runs += 1;
  addBallChip('WD', 'extra');
  logEvent('Wide ball (+1 run)');
  finishBall();
}

/* ---- No ball (1 extra run automatic + optional runs off the bat) ---- */
function playNoBall(batRuns){
  batRuns = batRuns || 0;
  if(state.matchOver || state.inningsOver){ toast('Innings/Match is over'); return; }
  pushHistory();
  const striker = state.players[state.strikerIdx];
  const total = 1 + batRuns;
  state.totalRuns += total;
  state.extras.noball += 1;
  state.currentOverRuns += total;
  const bs = ensureBowlerStats(state.bowlerName);
  bs.runs += total;
  if(batRuns > 0){
    striker.runs += batRuns;
    addBallChip('NB+' + batRuns, 'extra');
    if(batRuns === 6) playSound('six');
    else if(batRuns === 4) playSound('four');
  } else {
    addBallChip('NB', 'extra');
  }
  state.freeHit = true;
  logEvent('No ball (+1 run)' + (batRuns > 0 ? ' + ' + batRuns + ' run(s) off the bat' : '') + ' — next ball is FREE HIT');
  rotateStrikeIfOdd(batRuns);
  finishBall();
}

/* ---- Bye / Leg Bye (legal ball, runs to extras not batsman) ---- */
function playByeType(type, runs){
  if(state.matchOver || state.inningsOver){ toast('Innings/Match is over'); return; }
  pushHistory();
  const striker = state.players[state.strikerIdx];
  striker.balls++;
  state.totalRuns += runs;
  state.extras[type === 'Bye' ? 'bye' : 'legbye'] += runs;
  state.legalBalls++;
  state.totalLegalBalls++;
  state.currentOverRuns += runs;
  const bs = ensureBowlerStats(state.bowlerName);
  bs.balls++;
  addBallChip((type==='Bye'?'B':'LB') + runs, 'extra');
  logEvent(type + ': +' + runs + ' run(s)');
  state.freeHit = false;
  rotateStrikeIfOdd(runs);
  maybeCompleteOver();
  finishBall();
}

/* ---- Run declare (no ball count, no strike change, no batsman credit) ---- */
function playDeclare(runs){
  if(state.matchOver || state.inningsOver){ toast('Innings/Match is over'); return; }
  pushHistory();
  state.totalRuns += runs;
  addBallChip('D+'+runs, 'extra');
  logEvent('Runs declared: +' + runs);
  finishBall();
}

/* ---- OUT handling ---- */
function playOut(outType, runOutRuns){
  if(state.matchOver || state.inningsOver){ toast('Innings/Match is over'); return; }
  pushHistory();
  const striker = state.players[state.strikerIdx];

  // Free-hit protection: any dismissal except run-out is voided
  if(state.freeHit && outType !== 'Run Out'){
    striker.balls++;
    state.legalBalls++;
    state.totalLegalBalls++;
    const bs = ensureBowlerStats(state.bowlerName);
    bs.balls++;
    addBallChip('•', 'normal');
    logEvent('FREE HIT — ' + outType + ' attempt, batsman NOT out');
    state.freeHit = false;
    maybeCompleteOver();
    toast('Free Hit! No wicket (except run out)');
    finishBall();
    return;
  }

  if(outType === 'Run Out' && runOutRuns > 0){
    striker.runs += runOutRuns;
    state.totalRuns += runOutRuns;
    state.currentOverRuns += runOutRuns;
  }
  striker.balls++;
  striker.out = true;
  striker.howOut = outType;
  state.wickets++;
  state.legalBalls++;
  state.totalLegalBalls++;
  state.currentOverWickets++;
  const bs = ensureBowlerStats(state.bowlerName);
  bs.balls++;
  if(outType !== 'Run Out') bs.wickets++;
  if(outType === 'Run Out' && runOutRuns > 0) bs.runs += runOutRuns;
  addBallChip('W', 'wicket');
  logEvent(striker.name + ' OUT (' + outType + ')' + (outType==='Run Out' && runOutRuns>0 ? ' +'+runOutRuns+' run(s)' : ''));
  playSound('wicket');
  state.freeHit = false;
  if(outType === 'Run Out') rotateStrikeIfOdd(runOutRuns || 0);
  maybeCompleteOver();
  checkMatchStatus();

  const available = state.players
    .map((p, idx)=>({p, idx}))
    .filter(o => !o.p.out && o.idx !== state.nonStrikerIdx && o.idx !== state.strikerIdx);

  if(state.wickets >= state.players.length - 1 || available.length === 0){
    handlePostBallUI();
    return;
  }
  openNextBatModal(available);
  saveState();
}

function openNextBatModal(available){
  const list = $('nextBatList');
  list.innerHTML = '';
  available.forEach(({p, idx})=>{
    const item = document.createElement('div');
    item.className = 'next-bat-item';
    item.textContent = p.name;
    item.addEventListener('click', ()=>{
      state.strikerIdx = idx;
      closeModal('nextBatModal');
      handlePostBallUI();
    });
    list.appendChild(item);
  });
  openModal('nextBatModal');
}

/* ---- Next innings ---- */
function beginSwitchInnings(){
  if(state.innings === 2){
    toast('Match already in 2nd innings');
    return;
  }
  state.firstInningsSummary = {
    teamName: state.battingTeamName,
    runs: state.totalRuns,
    wickets: state.wickets,
    oversStr: oversStr(state.totalLegalBalls),
    players: JSON.parse(JSON.stringify(state.players)),
    bowlerStats: JSON.parse(JSON.stringify(state.bowlerStats))
  };
  state.target = state.totalRuns + 1;
  state.innings = 2;
  const prevBatting = state.battingTeamName;
  state.battingTeamName = state.bowlingTeamName;
  state.bowlingTeamName = prevBatting;

  state.inningsOver = false;
  state.matchOver = false;
  state.inningsFlashShown = false;
  state.matchFlashShown = false;
  state.history = [];
  saveState();

  openingContext = 'switch';
  goToOpeningSelection();
}

/* ---- Super Over (tied match) ---- */
function startSuperOver(){
  state.isSuperOver = true;
  state.oversLimit = 1;           // gully house rule: 1 over each in a Super Over
  state.innings = 1;
  state.target = null;
  state.firstInningsSummary = null;
  state.matchOver = false;
  state.inningsOver = false;
  state.matchFlashShown = false;
  state.inningsFlashShown = false;
  // battingTeamName stays as-is: the team that batted second (chased) bats first in the Super Over
  saveState();

  openingContext = 'superover';
  goToOpeningSelection();
}

/* ---- Player of the Match ---- */
function computePOTM(){
  const allBatters = [
    ...((state.firstInningsSummary && state.firstInningsSummary.players) || []),
    ...state.players
  ];
  const allBowlerStats = {};
  if(state.firstInningsSummary && state.firstInningsSummary.bowlerStats){
    Object.entries(state.firstInningsSummary.bowlerStats).forEach(([name, s])=>{
      allBowlerStats[name] = { balls: s.balls, runs: s.runs, wickets: s.wickets };
    });
  }
  Object.entries(state.bowlerStats).forEach(([name, s])=>{
    if(!allBowlerStats[name]) allBowlerStats[name] = { balls:0, runs:0, wickets:0 };
    allBowlerStats[name].balls += s.balls;
    allBowlerStats[name].runs += s.runs;
    allBowlerStats[name].wickets += s.wickets;
  });

  let topBatter = null;
  allBatters.forEach(p=>{
    if(p.balls > 0 && (!topBatter || p.runs > topBatter.runs)) topBatter = p;
  });

  let topBowlerName = null, topBowler = null;
  Object.entries(allBowlerStats).forEach(([name, s])=>{
    if(s.balls > 0 && (!topBowler || s.wickets > topBowler.wickets || (s.wickets === topBowler.wickets && s.runs < topBowler.runs))){
      topBowler = s; topBowlerName = name;
    }
  });

  return { topBatter, topBowler, topBowlerName };
}

function resetToSetup(){
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  showScreen('setupScreen');
}

function savePastMatch(){
  try{
    const list = JSON.parse(localStorage.getItem(PAST_MATCHES_KEY) || '[]');
    list.unshift({
      date: new Date().toISOString(),
      teamA: state.teamA,
      teamB: state.teamB,
      result: matchOverText(),
      innings1: state.firstInningsSummary ? {
        team: state.firstInningsSummary.teamName,
        runs: state.firstInningsSummary.runs,
        wickets: state.firstInningsSummary.wickets,
        overs: state.firstInningsSummary.oversStr
      } : null,
      innings2: {
        team: state.battingTeamName,
        runs: state.totalRuns,
        wickets: state.wickets,
        overs: oversStr(state.totalLegalBalls)
      }
    });
    if(list.length > 20) list.length = 20;
    localStorage.setItem(PAST_MATCHES_KEY, JSON.stringify(list));
  }catch(e){}
}