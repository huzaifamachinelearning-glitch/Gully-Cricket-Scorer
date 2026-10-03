/* =========================================================
   PLAYER MANAGEMENT — mid-match rename screen (via side menu).
   Fixes the bug where only the currently-batting team's names
   were editable. Now two tabs: Batting / Bowling, both teams
   reachable and both write back to the correct roster array.
   ========================================================= */

function renderPlayerScreen(){
  $('renameTabs').classList.remove('hidden');
  $('battingTabName').textContent = state.battingTeamName;
  $('bowlingTabName').textContent = state.bowlingTeamName;
  document.querySelectorAll('.rename-tab').forEach(t=>{
    t.classList.toggle('active', t.dataset.team === renameTeamView);
  });

  $('playerScreenTitle').textContent = 'Players';
  const wrap = $('playerListWrap');
  wrap.innerHTML = '';

  if(renameTeamView === 'batting'){
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
        if(state.bowlerName === p.name) state.bowlerName = input.value;
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
  } else {
    const rosterKey = (state.bowlingTeamName === state.teamA) ? 'teamARoster' : 'teamBRoster';
    const roster = state[rosterKey];
    roster.forEach((name, idx)=>{
      const row = document.createElement('div');
      row.className = 'player-row';

      const num = document.createElement('div');
      num.className = 'p-num';
      num.textContent = idx+1;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = name;
      input.addEventListener('input', ()=>{
        const oldName = roster[idx];
        roster[idx] = input.value;
        if(state.bowlerName === oldName) state.bowlerName = input.value;
        if(state.bowlerStats && state.bowlerStats[oldName]){
          state.bowlerStats[input.value] = state.bowlerStats[oldName];
          if(input.value !== oldName) delete state.bowlerStats[oldName];
        }
        saveState();
        renderMatchScreen();
      });

      row.appendChild(num);
      row.appendChild(input);

      const stat = document.createElement('div');
      stat.className = 'p-stat';
      stat.textContent = 'Hasn\'t batted yet';
      row.appendChild(stat);

      wrap.appendChild(row);
    });
  }

  $('playersDoneBtn').textContent = 'Done';
}

document.querySelectorAll('.rename-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    renameTeamView = tab.dataset.team;
    renderPlayerScreen();
  });
});