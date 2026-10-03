/* =========================================================
   SOUND — boundary / wicket / over-complete effects (no files,
   generated with Web Audio API), plus the on/off toggle.
   ========================================================= */

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