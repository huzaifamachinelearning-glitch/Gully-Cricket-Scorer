/* =========================================================
   GULLY SCORE — Cricket Scoring App
   All logic lives here: state, scoring rules, undo, rendering.
   ========================================================= */

const STORAGE_KEY = 'gullyscore_state_v2';

let state = null;
let uiFlow = 'new';          // 'new' | 'rename' | 'switch'  -> controls Player-screen buttons
let selectedOutType = null;
let pendingByeType = null;
let confirmCallback = null;

/* ---------------- DEFAULT STATE ---------------- */
function defaultState(){
  return {
    teamA: 'Team A',
    teamB: 'Team B',
    numPlayers: 11,
    oversLimit: null,
    matchStarted: false,
    innings: 1,
    battingTeamName: 'Team A',
    bowlingTeamName: 'Team B',
    players: [],                 // {name, runs, balls, out, howOut}
    strikerIdx: 0,
    nonStrikerIdx: 1,
    bowlerName: '',
    bowlerStats: {},             // name -> {balls, runs, wickets}
    totalRuns: 0,
    wickets: 0,
    legalBalls: 0,                // balls bowled in current over (0-5)
    totalLegalBalls: 0,
    extras: { wide: 0, noball: 0, bye: 0, legbye: 0 },
    thisOverEvents: [],
    currentOverRuns: 0,
    currentOverWickets: 0,
    freeHit: false,
    target: null,
    firstInningsSummary: null,
    matchOver: false,
    inningsOver: false,
    inningsFlashShown: false,
    matchFlashShown: false,
    pendingOverFlash: null,
    log: [],                      // ball-by-ball commentary
    history: []                   // undo stack (snapshots without 'history' field)
  };
}

/* ---------------- PERSISTENCE ---------------- */
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return null;
}
function pushHistory(){
  const snap = JSON.parse(JSON.stringify(state));
  delete snap.history;
  state.history.push(snap);
  if(state.history.length > 60) state.history.shift();
}
function undo(){
  if(!state.history || state.history.length === 0){
    toast('Nothing to undo');
    return;
  }
  const prev = state.history.pop();
  const hist = state.history;
  state = prev;
  state.history = hist;
  toast('Undone last ball');
  $('overFlash').classList.add('hidden');
  $('inningsFlash').classList.add('hidden');
  renderMatchScreen();
  saveState();
}

/* ---------------- UTIL ---------------- */
function $(id){ return document.getElementById(id); }
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>t.classList.add('hidden'), 1800);
}
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
}
function openModal(id){ $(id).classList.remove('hidden'); }
function closeModal(id){ $(id).classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach(btn=>{
  btn.addEventListener('click', ()=> closeModal(btn.dataset.close));
});
document.querySelectorAll('[data-back]').forEach(btn=>{
  btn.addEventListener('click', ()=> showScreen(btn.dataset.back));
});

function ensureBowlerStats(name){
  if(!state.bowlerStats[name]) state.bowlerStats[name] = { balls:0, runs:0, wickets:0 };
  return state.bowlerStats[name];
}
function logEvent(text){
  state.log.push({ text, over: oversStr(state.totalLegalBalls) });
}
function oversStr(balls){
  return Math.floor(balls/6) + '.' + (balls%6);
}
function crr(){
  if(state.totalLegalBalls === 0) return '0.00';
  return (state.totalRuns / (state.totalLegalBalls/6)).toFixed(2);
}

/* ================================================================
   SETUP SCREEN
   ================================================================ */
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
    toast('Overs zaroori hai — kitne overs ka match hai wo daalo');
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

/* ================================================================
   TOSS SCREEN
   ================================================================ */
function chooseBattingTeam(name){
  state.battingTeamName = name;
  state.bowlingTeamName = (name === state.teamA) ? state.teamB : state.teamA;
  state.players = Array.from({length: state.numPlayers}, (_, i)=>({
    name: 'Player ' + (i+1), runs: 0, balls: 0, out: false, howOut: ''
  }));
  uiFlow = 'new';
  renderPlayerScreen();
  showScreen('playerScreen');
}
$('tossTeamABtn').addEventListener('click', ()=> chooseBattingTeam(state.teamA));
$('tossTeamBBtn').addEventListener('click', ()=> chooseBattingTeam(state.teamB));

/* ================================================================
   PLAYER SCREEN (rename / add / remove)
   ================================================================ */
function renderPlayerScreen(){
  $('playerScreenTitle').textContent = state.matchStarted ? 'Players' : (state.battingTeamName + ' — Players');
  const wrap = $('playerListWrap');
  wrap.innerHTML = '';

  state.players.forEach((p, idx)=>{
    const row = document.createElement('div');
    row.className = 'player-row';

    const num = document.createElement('div');
    num.className = 'p-num';
    num.textContent = idx+1;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = p.name;
    input.addEventListener('input', ()=>{ p.name = input.value; saveState(); if(state.matchStarted) renderMatchScreen(); });

    row.appendChild(num);
    row.appendChild(input);

    if(state.matchStarted){
      const stat = document.createElement('div');
      stat.className = 'p-stat';
      stat.textContent = p.out ? (p.runs+' ('+p.balls+') • OUT') : (p.balls>0 ? p.runs+' ('+p.balls+')' : '—');
      row.appendChild(stat);
    } else {
      const rm = document.createElement('button');
      rm.className = 'remove-player';
      rm.innerHTML = '✕';
      rm.addEventListener('click', ()=>{
        if(state.players.length <= 2){ toast('Need at least 2 players'); return; }
        state.players.splice(idx,1);
        renderPlayerScreen();
      });
      row.appendChild(rm);
    }
    wrap.appendChild(row);
  });

  if(!state.matchStarted){
    const addRow = document.createElement('div');
    addRow.className = 'add-player-row';
    addRow.textContent = '+ Add Player';
    addRow.addEventListener('click', ()=>{
      state.players.push({name:'Player '+(state.players.length+1), runs:0, balls:0, out:false, howOut:''});
      renderPlayerScreen();
    });
    wrap.appendChild(addRow);
  }

  $('playersDoneBtn').textContent = state.matchStarted ? 'Done' : 'Done — Go to Scoring →';
}

$('playersDoneBtn').addEventListener('click', ()=>{
  if(uiFlow === 'new'){
    initMatchState();
    showScreen('matchScreen');
    renderMatchScreen();
  } else if(uiFlow === 'switch'){
    startNextInnings();
    showScreen('matchScreen');
    renderMatchScreen();
  } else {
    showScreen('matchScreen');
    renderMatchScreen();
  }
});

function initMatchState(){
  state.matchStarted = true;
  state.strikerIdx = 0;
  state.nonStrikerIdx = state.players.length > 1 ? 1 : 0;
  state.bowlerName = 'Bowler 1';
  ensureBowlerStats(state.bowlerName);
  logEvent(state.battingTeamName + ' innings begins — ' + state.oversLimit + ' overs match');
  saveState();
}

/* ================================================================
   MATCH SCREEN — SCORING ENGINE
   ================================================================ */
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
    state.pendingOverFlash = { overNum, runsThisOver, wktsThisOver };
  }
}

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

/* ---- No ball ---- */
function playNoBall(){
  if(state.matchOver || state.inningsOver){ toast('Innings/Match is over'); return; }
  pushHistory();
  state.totalRuns += 1;
  state.extras.noball += 1;
  state.currentOverRuns += 1;
  const bs = ensureBowlerStats(state.bowlerName);
  bs.runs += 1;
  addBallChip('NB', 'extra');
  state.freeHit = true;
  logEvent('No ball (+1 run) — next ball is FREE HIT');
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
    oversStr: oversStr(state.totalLegalBalls)
  };
  state.target = state.totalRuns + 1;
  state.innings = 2;
  const prevBatting = state.battingTeamName;
  state.battingTeamName = state.bowlingTeamName;
  state.bowlingTeamName = prevBatting;

  const n = state.players.length;
  state.players = Array.from({length:n}, (_,i)=>({name:'Player '+(i+1), runs:0, balls:0, out:false, howOut:''}));

  state.inningsOver = false;
  state.matchOver = false;
  state.inningsFlashShown = false;
  state.matchFlashShown = false;
  state.history = [];
  saveState();

  uiFlow = 'switch';
  renderPlayerScreen();
  showScreen('playerScreen');
}
function startNextInnings(){
  state.strikerIdx = 0;
  state.nonStrikerIdx = state.players.length > 1 ? 1 : 0;
  state.bowlerName = 'Bowler 1';
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
  logEvent(state.battingTeamName + ' innings begins — target: ' + state.target + ' runs');
  saveState();
}

/* ---- Over / Innings flash cards ---- */
function showOverFlash(info){
  $('overFlashNum').textContent = 'Over ' + info.overNum;
  $('overFlashRuns').textContent = info.runsThisOver + ' run' + (info.runsThisOver===1?'':'s');
  $('overFlashSub').textContent = info.wktsThisOver + ' wicket' + (info.wktsThisOver===1?'':'s');
  $('overFlashScore').textContent = 'Score: ' + state.totalRuns + '/' + state.wickets;
  $('overFlash').classList.remove('hidden');
  clearTimeout(showOverFlash._t);
  showOverFlash._t = setTimeout(hideOverFlash, 2600);
}
function hideOverFlash(){
  $('overFlash').classList.add('hidden');
  renderMatchScreen();
}
$('overFlashContinue').addEventListener('click', ()=>{ clearTimeout(showOverFlash._t); hideOverFlash(); });

function showInningsFlash(isMatchOver){
  $('inningsFlashTeam').textContent = isMatchOver ? matchOverText() : (state.battingTeamName + ' — Innings Complete');
  $('inningsFlashScore').textContent = state.totalRuns + '/' + state.wickets;
  $('inningsFlashOvers').textContent = oversStr(state.totalLegalBalls) + ' overs';
  $('inningsFlash').classList.remove('hidden');
}
function hideInningsFlash(){
  $('inningsFlash').classList.add('hidden');
  renderMatchScreen();
}
$('inningsFlashContinue').addEventListener('click', hideInningsFlash);

function resetToSetup(){
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  showScreen('setupScreen');
}

/* ================================================================
   RENDER — MATCH SCREEN
   ================================================================ */
function renderMatchScreen(){
  $('inningsTag').textContent = (state.innings === 1 ? '1st Innings' : '2nd Innings');
  $('battingTeamName').textContent = state.battingTeamName;
  $('mainScore').textContent = state.totalRuns + '/' + state.wickets;
  $('mainOvers').textContent = '(' + oversStr(state.totalLegalBalls) + (state.oversLimit ? '/'+state.oversLimit : '') + ' ov)';
  $('crr').textContent = 'CRR: ' + crr();

  if(state.innings === 2 && state.target !== null){
    const need = state.target - state.totalRuns;
    const ballsLeft = state.oversLimit ? (state.oversLimit*6 - state.totalLegalBalls) : null;
    $('targetInfo').classList.remove('hidden');
    $('targetInfo').textContent = need > 0
      ? ('Need ' + need + (ballsLeft!==null ? ' off '+ballsLeft+' balls' : ''))
      : 'Target reached';
  } else {
    $('targetInfo').classList.add('hidden');
  }

  const totalExtras = state.extras.wide + state.extras.noball + state.extras.bye + state.extras.legbye;
  $('extrasRow').textContent = 'Extras: ' + totalExtras +
    ' (WD ' + state.extras.wide + ', NB ' + state.extras.noball + ', B ' + state.extras.bye + ', LB ' + state.extras.legbye + ')';

  $('freeHitBadge').classList.toggle('hidden', !state.freeHit);

  const striker = state.players[state.strikerIdx];
  const nonStriker = state.players[state.nonStrikerIdx];
  $('strikerName').textContent = striker ? striker.name : '-';
  $('strikerStats').textContent = striker ? (striker.runs + ' (' + striker.balls + ')') : '';
  $('nonStrikerName').textContent = nonStriker ? nonStriker.name : '-';
  $('nonStrikerStats').textContent = nonStriker ? (nonStriker.runs + ' (' + nonStriker.balls + ')') : '';

  $('bowlerName').textContent = state.bowlerName || '—';
  const bs = state.bowlerStats[state.bowlerName];
  $('bowlerFigures').textContent = bs ? ('(' + oversStr(bs.balls) + ' ov, ' + bs.runs + ' runs, ' + bs.wickets + ' wkt)') : '';

  const chipsWrap = $('thisOverBalls');
  chipsWrap.innerHTML = '';
  state.thisOverEvents.forEach(ev=>{
    const c = document.createElement('div');
    c.className = 'ball-chip ' + (ev.type === 'wicket' ? 'wicket' : ev.type === 'boundary' ? 'boundary' : ev.type === 'extra' ? 'extra' : '');
    c.textContent = ev.label;
    chipsWrap.appendChild(c);
  });

  const shouldDisable = !!(state.matchOver || state.inningsOver);
  document.querySelectorAll('.run-btn, .extra-btn').forEach(b => b.disabled = shouldDisable);

  renderStatusBanner();
}

function renderStatusBanner(){
  const banner = $('statusBanner');
  const text = $('statusBannerText');
  const btn = $('statusBannerBtn');

  if(state.matchOver){
    banner.classList.remove('hidden');
    text.textContent = matchOverText() + '  (Final: ' + state.totalRuns + '/' + state.wickets + ' in ' + oversStr(state.totalLegalBalls) + ' ov)';
    btn.textContent = 'Start New Match';
    btn.onclick = ()=> confirmAction('Start a new match?', 'This will clear the current match completely.', resetToSetup);
  } else if(state.inningsOver){
    banner.classList.remove('hidden');
    text.textContent = 'Innings complete: ' + state.totalRuns + '/' + state.wickets + ' in ' + oversStr(state.totalLegalBalls) + ' overs.';
    btn.textContent = 'Start 2nd Innings →';
    btn.onclick = ()=> confirmAction('End this innings?', 'Current score will be locked and a new innings will start.', beginSwitchInnings);
  } else {
    banner.classList.add('hidden');
  }
}

/* ---- Pad buttons ---- */
document.querySelectorAll('.run-btn[data-run]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const runs = parseInt(btn.dataset.run, 10);
    playLegalDelivery(runs);
  });
});
$('plusBtn').addEventListener('click', ()=>{
  $('customRunInput').value = '';
  openModal('customRunModal');
});
$('customRunConfirm').addEventListener('click', ()=>{
  const v = parseInt($('customRunInput').value, 10);
  if(isNaN(v) || v < 0){ toast('Enter a valid number'); return; }
  closeModal('customRunModal');
  playLegalDelivery(v);
});

$('wideBtn').addEventListener('click', playWide);
$('noballBtn').addEventListener('click', playNoBall);

$('declareBtn').addEventListener('click', ()=>{
  $('declareRunInput').value = '';
  openModal('declareModal');
});
$('declareConfirm').addEventListener('click', ()=>{
  const v = parseInt($('declareRunInput').value, 10);
  if(isNaN(v) || v < 0){ toast('Enter a valid number'); return; }
  closeModal('declareModal');
  playDeclare(v);
});

/* ---- More extras: Bye / Leg Bye ---- */
$('moreExtrasToggle').addEventListener('click', ()=>{
  const row = $('moreExtrasRow');
  row.classList.toggle('hidden');
  $('moreExtrasToggle').textContent = row.classList.contains('hidden') ? '⋯ More Extras (Bye / Leg Bye)' : '▲ Hide Extras';
});
$('byeBtn').addEventListener('click', ()=>{
  pendingByeType = 'Bye';
  $('byeModalTitle').textContent = 'Bye Runs';
  $('byeRunInput').value = '';
  openModal('byeModal');
});
$('legbyeBtn').addEventListener('click', ()=>{
  pendingByeType = 'Leg Bye';
  $('byeModalTitle').textContent = 'Leg Bye Runs';
  $('byeRunInput').value = '';
  openModal('byeModal');
});
$('byeConfirm').addEventListener('click', ()=>{
  const v = parseInt($('byeRunInput').value, 10);
  if(isNaN(v) || v < 1){ toast('Enter runs (1 or more)'); return; }
  closeModal('byeModal');
  playByeType(pendingByeType, v);
});

/* ---- Out modal ---- */
document.querySelectorAll('.out-type-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.out-type-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedOutType = btn.dataset.out;
    $('outConfirm').disabled = false;
    $('runOutRunsWrap').classList.toggle('hidden', selectedOutType !== 'Run Out');
  });
});
$('outBtn').addEventListener('click', ()=>{
  selectedOutType = null;
  document.querySelectorAll('.out-type-btn').forEach(b=>b.classList.remove('selected'));
  $('runOutRunsWrap').classList.add('hidden');
  $('runOutRuns').value = 0;
  $('outConfirm').disabled = true;
  openModal('outModal');
});
$('outConfirm').addEventListener('click', ()=>{
  if(!selectedOutType) return;
  const runOutRuns = selectedOutType === 'Run Out' ? (parseInt($('runOutRuns').value,10) || 0) : 0;
  closeModal('outModal');
  playOut(selectedOutType, runOutRuns);
});

/* ---- Bowler ---- */
$('changeBowlerBtn').addEventListener('click', ()=>{
  $('bowlerNameInput').value = '';
  openModal('bowlerModal');
});
$('bowlerConfirm').addEventListener('click', ()=>{
  const v = $('bowlerNameInput').value.trim();
  if(v){
    state.bowlerName = v;
    ensureBowlerStats(v);
    logEvent('Bowling change: ' + v);
  }
  closeModal('bowlerModal');
  renderMatchScreen();
  saveState();
});

/* ---- Undo ---- */
$('undoBtn').addEventListener('click', undo);

/* ================================================================
   SIDE MENU
   ================================================================ */
$('menuBtn').addEventListener('click', ()=>{
  $('sideOverlay').classList.remove('hidden');
  $('sideMenu').classList.add('open');
  if(state && state.matchStarted){
    $('sideSnapshot').classList.remove('hidden');
    $('snapTeam').textContent = state.battingTeamName;
    $('snapScore').textContent = state.totalRuns + '/' + state.wickets + '  (' + oversStr(state.totalLegalBalls) + ' ov)';
  } else {
    $('sideSnapshot').classList.add('hidden');
  }
});
$('sideOverlay').addEventListener('click', closeSideMenu);
$('sideCloseBtn').addEventListener('click', closeSideMenu);
function closeSideMenu(){
  $('sideOverlay').classList.add('hidden');
  $('sideMenu').classList.remove('open');
}

function renderHistoryList(){
  const wrap = $('historyList');
  wrap.innerHTML = '';
  if(!state.log || state.log.length === 0){
    const empty = document.createElement('div');
    empty.className = 'history-item';
    empty.textContent = 'No events yet.';
    wrap.appendChild(empty);
    return;
  }
  state.log.forEach(entry=>{
    const div = document.createElement('div');
    div.className = 'history-item';
    const s1 = document.createElement('span'); s1.textContent = entry.text;
    const s2 = document.createElement('span'); s2.className = 'h-time'; s2.textContent = entry.over;
    div.appendChild(s1); div.appendChild(s2);
    wrap.appendChild(div);
  });
}

document.querySelectorAll('.side-item').forEach(item=>{
  item.addEventListener('click', ()=>{
    closeSideMenu();
    const action = item.dataset.action;
    if(action === 'new-match'){
      confirmAction('Start a new match?', 'This will clear the current match completely.', resetToSetup);
    } else if(action === 'players'){
      if(!state || !state.matchStarted){ toast('Start a match first'); return; }
      uiFlow = 'rename';
      renderPlayerScreen();
      showScreen('playerScreen');
    } else if(action === 'history'){
      if(!state || !state.matchStarted){ toast('Start a match first'); return; }
      renderHistoryList();
      openModal('historyModal');
    } else if(action === 'switch-innings'){
      if(!state || !state.matchStarted){ toast('Start a match first'); return; }
      confirmAction('End this innings?', 'Current score will be locked and a new innings will start.', beginSwitchInnings);
    } else if(action === 'reset'){
      confirmAction('Reset everything?', 'All match data will be permanently deleted.', resetToSetup);
    }
  });
});

function confirmAction(title, text, cb){
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  confirmCallback = cb;
  openModal('confirmModal');
}
$('confirmYes').addEventListener('click', ()=>{
  closeModal('confirmModal');
  if(confirmCallback) confirmCallback();
  confirmCallback = null;
});

/* ================================================================
   INIT ON LOAD
   ================================================================ */
window.addEventListener('DOMContentLoaded', ()=>{
  const saved = loadState();
  if(saved && saved.matchStarted){
    state = saved;
    if(!state.history) state.history = [];
    if(!state.log) state.log = [];
    if(!state.bowlerStats) state.bowlerStats = {};
    if(!state.extras.bye) state.extras.bye = 0;
    if(!state.extras.legbye) state.extras.legbye = 0;
    showScreen('matchScreen');
    renderMatchScreen();
  } else {
    state = defaultState();
    showScreen('setupScreen');
  }
});