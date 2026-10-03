/* =========================================================
   CLOUD SYNC — all Supabase backend/database calls live here.
   This is the single "backend touchpoint" file: match code,
   push-to-cloud backup, and live realtime viewing.
   ========================================================= */

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
  if(!supabaseClient){ toast('Internet connection required to watch a live match'); return; }
  toast('Looking for the match…');
  supabaseClient.from('matches').select('*').eq('match_code', code).single().then(({ data, error })=>{
    if(error || !data){ toast('Match not found — check the code'); return; }
    state = data.state;
    state.isViewer = true;
    state.history = [];
    showScreen('matchScreen');
    renderMatchScreen();
    subscribeToMatch(code);
    toast('Connected to the live match!');
  }).catch(()=>{ toast('Something went wrong, please try again'); });
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
  toast('Disconnected from the match');
}