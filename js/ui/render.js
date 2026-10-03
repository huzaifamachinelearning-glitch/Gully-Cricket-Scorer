/* =========================================================
   RENDER — everything that draws to the screen.
   ========================================================= */

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
  maybeShowNextBowlerPrompt();
}
$('overFlashContinue').addEventListener('click', ()=>{ clearTimeout(showOverFlash._t); hideOverFlash(); });

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

/* ---- Match screen ---- */
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
    btn.textContent = state.isSuperOver ? 'Continue to 2nd Super Over Innings →' : 'Start the 2nd Innings →';
    btn.onclick = ()=> confirmAction('Start the next innings?', 'Current score will be locked in, and you\'ll pick the new openers.', beginSwitchInnings);
    btn2.classList.add('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

/* ---- Bowler picker (used by Change Bowler button + the auto over-transition prompt) ---- */
function renderBowlerChoices(excludeName){
  const bowlingNames = (state.bowlingTeamName === state.teamA) ? state.teamARoster : state.teamBRoster;
  const list = $('bowlerChoiceList');
  list.innerHTML = '';
  (bowlingNames || []).forEach(name=>{
    if(excludeName && name === excludeName) return;
    const item = document.createElement('div');
    item.className = 'next-bat-item';
    item.textContent = name;
    item.addEventListener('click', ()=>{
      state.bowlerName = name;
      ensureBowlerStats(name);
      logEvent('Bowling change: ' + name);
      closeModal('bowlerModal');
      $('bowlerModalHint').classList.add('hidden');
      renderMatchScreen();
      saveState();
    });
    list.appendChild(item);
  });
}

/* ---- Full scorecard ---- */
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

/* ---- Ball-by-ball history ---- */
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

/* ---- Past matches ---- */
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