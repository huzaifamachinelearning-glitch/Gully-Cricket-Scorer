/* =========================================================
   STATE — the single source of truth for the whole match,
   plus save/load and the undo stack.
   ========================================================= */

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
    matchCode: null,
    isViewer: false,
    isSuperOver: false,
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

/* ---------------- UNDO ---------------- */
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

/* ---------------- SMALL STATE HELPERS ---------------- */
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