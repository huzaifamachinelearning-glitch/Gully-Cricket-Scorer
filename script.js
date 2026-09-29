/* =========================================================
   GULLY SCORE — Cricket Scoring App
   All logic lives here: state, scoring rules, undo, rendering.
   ========================================================= */

const STORAGE_KEY = 'gullyscore_state_v2';
const PAST_MATCHES_KEY = 'gullyscore_past_matches';
const SOUND_KEY = 'gullyscore_sound';

/* ---------------- SUPABASE (cloud backup + live sync) ---------------- */
const SUPABASE_URL = 'https://yvsumqmonhicgjkpjkvc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2c3VtcW1vbmhpY2dqa3Bqa3ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MzU0NjcsImV4cCI6MjEwNDUxMTQ2N30.u0o_bqHOjAYEB2kg9uJXRygoa4Sk_LCkec0rQacIj_0';
const supabaseClient = (window.supabase && SUPABASE_URL.startsWith('https'))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let realtimeChannel = null;
let _pushTimer = null;

let state = null;
let selectedOutType = null;
let pendingByeType = null;
let confirmCallback = null;
let rosterMode = false;      // true while collecting the pre-match Team A / Team B rosters
let rosterStage = null;      // 'A' | 'B'
let rosterDraftNames = [];
let soundEnabled = localStorage.getItem(SOUND_KEY) !== 'off';

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
    matchCode: null,
    isViewer: false,
    isSuperOver: false,
    bowlingTeamName: 'Team B',
    teamARoster: [],             // plain names, set once at setup
    teamBRoster: [],
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
  pushToCloud();
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return null;
}

function generateMatchCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for(let i=0; i<6; i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

function pushToCloud(){
  if(!supabaseClient || !state || !state.matchCode || state.isViewer) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(()=>{
    const clone = JSON.parse(JSON.stringify(state));
    delete clone.history;   // undo stack — no need to sync, keeps payload small
    supabaseClient.from('matches').upsert({
      match_code: state.matchCode,
      team_a: state.teamA,
      team_b: state.teamB,
      state: clone
    }, { onConflict: 'match_code' }).then(()=>{}).catch(()=>{});
  }, 400);
}

function joinMatchAsViewer(code){
  if(!supabaseClient){ toast('Internet connection chahiye live match dekhne ke liye'); return; }
  toast('Match dhoondh rahe hain…');
  supabaseClient.from('matches').select('*').eq('match_code', code).single().then(({ data, error })=>{
    if(error || !data){ toast('Match nahi mila — code check karo'); return; }
    state = data.state;
    state.isViewer = true;
    state.history = [];
    showScreen('matchScreen');
    renderMatchScreen();
    subscribeToMatch(code);
    toast('Live match se connect ho gaye!');
  }).catch(()=>{ toast('Kuch gadbad hui, dobara try karo'); });
}

function subscribeToMatch(code){
  if(!supabaseClient) return;
  if(realtimeChannel){ supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
  realtimeChannel = supabaseClient
    .channel('match-' + code)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: 'match_code=eq.' + code }, (payload)=>{
      state = payload.new.state;
      state.isViewer = true;
      state.history = [];
      renderMatchScreen();
    })
    .subscribe();
}

function stopWatching(){
  if(realtimeChannel && supabaseClient){ supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  showScreen('setupScreen');
  toast('Match se disconnect ho gaye');
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
$('playerBackBtn').addEventListener('click', ()=>{
  if(rosterMode || !state.matchStarted){
    showScreen('setupScreen');
  } else {
    showScreen('matchScreen');
    renderMatchScreen();
  }
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

function playTone(freq, duration, type){
  if(!soundEnabled) return;
  try{
    const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext||window.webkitAudioContext)());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + duration);
  }catch(e){}
}
function playSound(kind){
  if(!soundEnabled) return;
  if(kind === 'four'){ playTone(523, 0.16); setTimeout(()=>playTone(659, 0.16), 110); }
  else if(kind === 'six'){ playTone(523, 0.13); setTimeout(()=>playTone(659, 0.13), 90); setTimeout(()=>playTone(784, 0.22), 180); }
  else if(kind === 'wicket'){ playTone(160, 0.3, 'sawtooth'); }
  else if(kind === 'over'){ playTone(392, 0.15); setTimeout(()=>playTone(330, 0.15), 160); }
}
function updateSoundLabel(){
  $('soundToggleLabel').textContent = 'Sound: ' + (soundEnabled ? 'ON' : 'OFF');
}
$('soundToggleItem').addEventListener('click', ()=>{
  soundEnabled = !soundEnabled;
  localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off');
  updateSoundLabel();
  toast(soundEnabled ? 'Sound ON' : 'Sound OFF');
});

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

$('watchMatchBtn').addEventListener('click', ()=>{
  $('watchCodeInput').value = '';
  openModal('watchCodeModal');
});
$('watchCodeConfirm').addEventListener('click', ()=>{
  const code = $('watchCodeInput').value.trim().toUpperCase();
  if(!code){ toast('Match code daalo'); return; }
  closeModal('watchCodeModal');
  joinMatchAsViewer(code);
});

/* ================================================================
   TOSS SCREEN
   ================================================================ */
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

/* ================================================================
   ROSTER SCREEN (pre-match: collect BOTH teams' player names)
   ================================================================ */
function renderRosterScreen(){
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

  $('playersDoneBtn').textContent = rosterStage === 'A' ? (state.teamB + ' Players →') : 'Done — Go to Scoring →';
}

function initMatchStateFromRosters(){
  const battingNames = (state.battingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;
  const bowlingNames = (state.bowlingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;
  state.players = battingNames.map(n => ({ name: n, runs: 0, balls: 0, out: false, howOut: '' }));
  state.matchStarted = true;
  state.strikerIdx = 0;
  state.nonStrikerIdx = state.players.length > 1 ? 1 : 0;
  state.bowlerName = bowlingNames[0] || 'Bowler 1';
  state.matchCode = generateMatchCode();
  ensureBowlerStats(state.bowlerName);
  logEvent(state.battingTeamName + ' innings begins — ' + state.oversLimit + ' overs match');
  saveState();
}

/* ================================================================
   PLAYER SCREEN (mid-match rename via side menu)
   ================================================================ */
function renderPlayerScreen(){
  $('playerScreenTitle').textContent = 'Players — ' + state.battingTeamName;
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
    input.addEventListener('input', ()=>{
      p.name = input.value;
      const rosterArr = (state.battingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;
      if(rosterArr && rosterArr[idx] !== undefined) rosterArr[idx] = input.value;
      saveState();
      renderMatchScreen();
    });

    row.appendChild(num);
    row.appendChild(input);

    const stat = document.createElement('div');
    stat.className = 'p-stat';
    stat.textContent = p.out ? (p.runs+' ('+p.balls+') • OUT') : (p.balls>0 ? p.runs+' ('+p.balls+')' : '—');
    row.appendChild(stat);

    wrap.appendChild(row);
  });

  $('playersDoneBtn').textContent = 'Done';
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
      initMatchStateFromRosters();
      showScreen('matchScreen');
      renderMatchScreen();
      return;
    }
  }
  showScreen('matchScreen');
  renderMatchScreen();
});

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
    playSound('over');
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

  startNextInnings();
  showScreen('matchScreen');
  renderMatchScreen();
}
function startNextInnings(){
  const battingNames = (state.battingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;
  const bowlingNames = (state.bowlingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;
  state.players = (battingNames.length ? battingNames : Array.from({length:state.numPlayers},(_,i)=>'Player '+(i+1)))
    .map(n => ({ name: n, runs: 0, balls: 0, out: false, howOut: '' }));
  state.strikerIdx = 0;
  state.nonStrikerIdx = state.players.length > 1 ? 1 : 0;
  state.bowlerName = bowlingNames[0] || 'Bowler 1';
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

function showInningsFlash(isMatchOver){
  $('inningsFlashTeam').textContent = isMatchOver ? matchOverText() : (state.battingTeamName + ' — Innings Complete');
  $('inningsFlashScore').textContent = state.totalRuns + '/' + state.wickets;
  $('inningsFlashOvers').textContent = oversStr(state.totalLegalBalls) + ' overs';

  const potmEl = $('potmLine');
  if(isMatchOver){
    const { topBatter, topBowler, topBowlerName } = computePOTM();
    let lines = [];
    if(topBatter) lines.push('🏏 Top Score: ' + topBatter.name + ' — ' + topBatter.runs + ' (' + topBatter.balls + ' balls)');
    if(topBowler && topBowler.wickets > 0) lines.push('🎯 Best Bowling: ' + topBowlerName + ' — ' + topBowler.wickets + '/' + topBowler.runs);
    potmEl.textContent = lines.join('\n');
    potmEl.classList.toggle('hidden', lines.length === 0);
  } else {
    potmEl.classList.add('hidden');
  }

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

function isTiedResult(){
  return state.target !== null && state.totalRuns === state.target - 1;
}

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
  startNextInnings();
  logEvent('⚡ SUPER OVER begins — 1 over each side');
  showScreen('matchScreen');
  renderMatchScreen();
}

/* ================================================================
   RENDER — MATCH SCREEN
   ================================================================ */
function renderMatchScreen(){
  if(state.isSuperOver){
    $('inningsTag').textContent = 'Super Over — ' + (state.innings === 1 ? '1st' : '2nd') + ' Innings';
  } else {
    $('inningsTag').textContent = (state.innings === 1 ? '1st Innings' : '2nd Innings');
  }
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

  // Viewer mode: hide all scoring controls, show a LIVE badge instead
  const isViewer = !!state.isViewer;
  $('scoringPad').style.display = isViewer ? 'none' : '';
  $('undoBtn').style.display = isViewer ? 'none' : '';
  $('changeBowlerBtn').style.display = isViewer ? 'none' : '';
  $('liveViewerBadge').classList.toggle('hidden', !isViewer);
  $('stopWatchingItem').style.display = isViewer ? '' : 'none';

  if(state.matchCode && !isViewer){
    $('matchCodePill').textContent = 'Code: ' + state.matchCode + ' 📋';
    $('matchCodePill').classList.remove('hidden');
  } else {
    $('matchCodePill').classList.add('hidden');
  }

  renderStatusBanner();
}

function renderStatusBanner(){
  const banner = $('statusBanner');
  const text = $('statusBannerText');
  const btn = $('statusBannerBtn');
  const btn2 = $('statusBannerBtn2');

  if(state.matchOver){
    banner.classList.remove('hidden');
    text.textContent = matchOverText() + '  (Final: ' + state.totalRuns + '/' + state.wickets + ' in ' + oversStr(state.totalLegalBalls) + ' ov)';
    if(isTiedResult()){
      btn.textContent = '⚡ Start Super Over';
      btn.onclick = ()=> confirmAction('Start a Super Over?', '1 over each side, fresh scores — winner takes the match.', startSuperOver);
      btn2.textContent = 'Start New Match Instead';
      btn2.onclick = ()=> confirmAction('Start a new match?', 'This will clear the current match completely.', resetToSetup);
      btn2.classList.remove('hidden');
    } else {
      btn.textContent = 'Start New Match';
      btn.onclick = ()=> confirmAction('Start a new match?', 'This will clear the current match completely.', resetToSetup);
      btn2.classList.add('hidden');
    }
  } else if(state.inningsOver){
    banner.classList.remove('hidden');
    text.textContent = 'Innings complete: ' + state.totalRuns + '/' + state.wickets + ' in ' + oversStr(state.totalLegalBalls) + ' overs.';
    btn.textContent = state.isSuperOver ? 'Start 2nd Super Over Innings →' : 'Start 2nd Innings →';
    btn.onclick = ()=> confirmAction('End this innings?', 'Current score will be locked and a new innings will start.', beginSwitchInnings);
    btn2.classList.add('hidden');
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
$('noballBtn').addEventListener('click', ()=>{
  document.querySelectorAll('#noballRunGrid .out-type-btn').forEach(b=>b.classList.remove('selected'));
  openModal('noballModal');
});
document.querySelectorAll('#noballRunGrid .out-type-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const runs = parseInt(btn.dataset.runs, 10);
    closeModal('noballModal');
    playNoBall(runs);
  });
});

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
function renderBowlerChoices(){
  const bowlingNames = (state.bowlingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;
  const list = $('bowlerChoiceList');
  list.innerHTML = '';
  (bowlingNames || []).forEach(name=>{
    const item = document.createElement('div');
    item.className = 'next-bat-item';
    item.textContent = name;
    item.addEventListener('click', ()=>{
      state.bowlerName = name;
      ensureBowlerStats(name);
      logEvent('Bowling change: ' + name);
      closeModal('bowlerModal');
      renderMatchScreen();
      saveState();
    });
    list.appendChild(item);
  });
}
$('changeBowlerBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  $('bowlerNameInput').value = '';
  renderBowlerChoices();
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
$('bowlerBox').addEventListener('click', ()=>{
  if(!state.matchStarted) return;
  renderFullScorecard();
  openModal('scorecardModal');
});

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}

function buildInningsHTML(teamName, players, bowlerStats, scoreLine){
  let html = '<div class="sc-innings">';
  html += '<h4>' + escapeHtml(teamName) + ' — ' + escapeHtml(scoreLine) + '</h4>';
  html += '<table class="sc-table"><tr><th>Batter</th><th>R</th><th>B</th><th>Status</th></tr>';
  (players || []).forEach(p=>{
    if(p.balls > 0 || p.out){
      html += '<tr><td>' + escapeHtml(p.name) + '</td><td>' + p.runs + '</td><td>' + p.balls + '</td><td>' + (p.out ? escapeHtml(p.howOut) : 'not out') + '</td></tr>';
    }
  });
  html += '</table>';
  const bowlers = Object.entries(bowlerStats || {}).filter(([,s]) => s.balls > 0);
  if(bowlers.length){
    html += '<table class="sc-table"><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th></tr>';
    bowlers.forEach(([name, s])=>{
      html += '<tr><td>' + escapeHtml(name) + '</td><td>' + oversStr(s.balls) + '</td><td>' + s.runs + '</td><td>' + s.wickets + '</td></tr>';
    });
    html += '</table>';
  }
  html += '</div>';
  return html;
}

function renderFullScorecard(){
  let html = '';
  if(state.firstInningsSummary){
    html += buildInningsHTML(
      state.firstInningsSummary.teamName,
      state.firstInningsSummary.players,
      state.firstInningsSummary.bowlerStats,
      state.firstInningsSummary.runs + '/' + state.firstInningsSummary.wickets + ' (' + state.firstInningsSummary.oversStr + ' ov)'
    );
  }
  html += buildInningsHTML(
    state.battingTeamName,
    state.players,
    state.bowlerStats,
    state.totalRuns + '/' + state.wickets + ' (' + oversStr(state.totalLegalBalls) + ' ov)'
  );
  $('scorecardContent').innerHTML = html;
}

$('downloadScorecardBtn').addEventListener('click', ()=>{
  if(typeof html2canvas === 'undefined'){
    toast('Image export not available offline — connect to internet once to load it');
    return;
  }
  const el = $('scorecardContent');
  $('downloadScorecardBtn').textContent = 'Preparing…';
  html2canvas(el, { backgroundColor:'#FFF8F0', scale:2 }).then(canvas=>{
    $('downloadScorecardBtn').textContent = '📤 Share / Download';
    canvas.toBlob(blob=>{
      if(!blob) return;
      const file = new File([blob], 'gully-scorecard.png', { type:'image/png' });
      if(navigator.share && navigator.canShare && navigator.canShare({ files:[file] })){
        navigator.share({ files:[file], title:'Gully Score Scorecard', text:'Match scorecard' }).catch(()=>{});
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'gully-scorecard.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('Scorecard image downloaded');
      }
    });
  }).catch(()=>{
    $('downloadScorecardBtn').textContent = '📤 Share / Download';
    toast('Could not generate image');
  });
});

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

function renderPastMatchesList(){
  const wrap = $('pastMatchesList');
  wrap.innerHTML = '';
  let list = [];
  try{ list = JSON.parse(localStorage.getItem(PAST_MATCHES_KEY) || '[]'); }catch(e){}
  if(list.length === 0){
    const empty = document.createElement('div');
    empty.className = 'history-item';
    empty.textContent = 'No completed matches yet.';
    wrap.appendChild(empty);
    return;
  }
  list.forEach(m=>{
    const div = document.createElement('div');
    div.className = 'past-match-item';
    const dateStr = new Date(m.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });

    const title = document.createElement('div'); title.className = 'pm-title'; title.textContent = m.teamA + ' vs ' + m.teamB;
    const date = document.createElement('div'); date.className = 'pm-date'; date.textContent = dateStr;
    const result = document.createElement('div'); result.className = 'pm-result'; result.textContent = m.result;
    const scores = document.createElement('div'); scores.className = 'pm-scores';
    let scoreText = '';
    if(m.innings1) scoreText += m.innings1.team + ': ' + m.innings1.runs + '/' + m.innings1.wickets + ' (' + m.innings1.overs + ' ov)  •  ';
    scoreText += m.innings2.team + ': ' + m.innings2.runs + '/' + m.innings2.wickets + ' (' + m.innings2.overs + ' ov)';
    scores.textContent = scoreText;

    div.appendChild(title); div.appendChild(date); div.appendChild(result); div.appendChild(scores);
    wrap.appendChild(div);
  });
}

$('clearPastMatchesBtn').addEventListener('click', ()=>{
  confirmAction('Clear past matches?', 'This will permanently delete all saved match results.', ()=>{
    localStorage.removeItem(PAST_MATCHES_KEY);
    renderPastMatchesList();
    toast('Past matches cleared');
  });
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
    const editActions = ['new-match', 'players', 'switch-innings'];
    if(state && state.isViewer && editActions.includes(action)){
      toast('Viewer mode — sirf dekh sakte ho, score nahi kar sakte');
      return;
    }
    if(action === 'new-match'){
      confirmAction('Start a new match?', 'This will clear the current match completely.', resetToSetup);
    } else if(action === 'players'){
      if(!state || !state.matchStarted){ toast('Start a match first'); return; }
      renderPlayerScreen();
      showScreen('playerScreen');
    } else if(action === 'history'){
      if(!state || !state.matchStarted){ toast('Start a match first'); return; }
      renderHistoryList();
      openModal('historyModal');
    } else if(action === 'scorecard'){
      if(!state || !state.matchStarted){ toast('Start a match first'); return; }
      renderFullScorecard();
      openModal('scorecardModal');
    } else if(action === 'past-matches'){
      renderPastMatchesList();
      openModal('pastMatchesModal');
    } else if(action === 'switch-innings'){
      if(!state || !state.matchStarted){ toast('Start a match first'); return; }
      confirmAction('End this innings?', 'Current score will be locked and a new innings will start.', beginSwitchInnings);
    }
  });
});

$('stopWatchingItem').addEventListener('click', ()=>{
  closeSideMenu();
  stopWatching();
});
$('matchCodePill').addEventListener('click', ()=>{
  if(!state.matchCode) return;
  if(navigator.clipboard){
    navigator.clipboard.writeText(state.matchCode).then(()=> toast('Match code copied!')).catch(()=>{});
  } else {
    toast('Code: ' + state.matchCode);
  }
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
   PWA — SERVICE WORKER REGISTRATION
   ================================================================ */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

/* ================================================================
   INIT ON LOAD
   ================================================================ */
window.addEventListener('DOMContentLoaded', ()=>{
  updateSoundLabel();
  const saved = loadState();
  if(saved && saved.matchStarted){
    state = saved;
    if(!state.history) state.history = [];
    if(!state.log) state.log = [];
    if(!state.bowlerStats) state.bowlerStats = {};
    if(!state.extras.bye) state.extras.bye = 0;
    if(!state.extras.legbye) state.extras.legbye = 0;
    if(!state.teamARoster) state.teamARoster = state.players.map(p=>p.name);
    if(!state.teamBRoster) state.teamBRoster = [];
    showScreen('matchScreen');
    renderMatchScreen();
  } else {
    state = defaultState();
    showScreen('setupScreen');
  }
});