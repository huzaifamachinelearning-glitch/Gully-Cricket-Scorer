/* =========================================================
   CONFIG — constants, Supabase client init, core DOM utils
   Loaded FIRST: every other file depends on $ / toast / modals.
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

/* ---------------- GLOBAL APP STATE (shared across all modules) ---------------- */
let state = null;
let selectedOutType = null;
let pendingByeType = null;
let confirmCallback = null;
let rosterMode = false;      // true while collecting the pre-match Team A / Team B rosters
let rosterStage = null;      // 'A' | 'B'
let rosterDraftNames = [];
let soundEnabled = localStorage.getItem(SOUND_KEY) !== 'off';

// Opening-selection screen (striker / non-striker / opening bowler picker)
let openingDraft = { striker: null, nonStriker: null, bowler: null };
let openingContext = 'new';  // 'new' | 'switch' | 'superover' — which flow triggered it

// Mid-match player rename: which team's roster is currently shown
let renameTeamView = 'batting'; // 'batting' | 'bowling'

/* ---------------- CORE DOM UTILS ---------------- */
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