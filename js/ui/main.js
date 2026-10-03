/* =========================================================
   MAIN — remaining button wiring + app boot sequence.
   Loaded LAST: everything it calls is already defined.
   ========================================================= */

/* ---- Scoring pad ---- */
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

/* ---- Bowler (manual "Change Bowler" button — no exclusion, scorer's own correction) ---- */
$('changeBowlerBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  $('bowlerModalHint').classList.add('hidden');
  $('bowlerNameInput').value = '';
  renderBowlerChoices(null);
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
  $('bowlerModalHint').classList.add('hidden');
  renderMatchScreen();
  saveState();
});
$('bowlerBox').addEventListener('click', ()=>{
  if(!state.matchStarted) return;
  renderFullScorecard();
  openModal('scorecardModal');
});

/* ---- Scorecard download / share ---- */
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

document.querySelectorAll('.side-item').forEach(item=>{
  item.addEventListener('click', ()=>{
    closeSideMenu();
    const action = item.dataset.action;
    const editActions = ['new-match', 'players', 'switch-innings'];
    if(state && state.isViewer && editActions.includes(action)){
      toast('Viewer mode — you can watch only, scoring is disabled');
      return;
    }
    if(action === 'new-match'){
      confirmAction('Start a new match?', 'This will clear the current match completely.', resetToSetup);
    } else if(action === 'players'){
      if(!state || !state.matchStarted){ toast('Start a match first'); return; }
      renameTeamView = 'batting';
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
      confirmAction('Start the next innings?', 'Current score will be locked in, and you\'ll pick the new openers.', beginSwitchInnings);
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