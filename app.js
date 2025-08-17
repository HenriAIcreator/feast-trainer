
// FEAST II Trainer - Full package (uses Web Speech API for TTS with radio static effect)
// No external audio files required; realistic-ish radio simulated with static before TTS.

const canvas = document.getElementById('radar');
const ctx = canvas.getContext('2d');
let dpi = window.devicePixelRatio || 1;

function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpi);
  canvas.height = Math.floor(rect.height * dpi);
  ctx.setTransform(dpi,0,0,dpi,0,0);
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', resizeCanvas);

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const taskBtn = document.getElementById('taskBtn');
const aircraftCountSelect = document.getElementById('aircraftCount');
const modeSelect = document.getElementById('modeSelect');
const taskDisplay = document.getElementById('taskDisplay');
const scoreSpan = document.getElementById('score');
const radioToggle = document.getElementById('radioToggle');
const timeLeftSpan = document.getElementById('timeLeft');
const statusDiv = document.getElementById('status');
const selectedInfo = document.getElementById('selectedInfo');

const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const altUpBtn = document.getElementById('altUpBtn');
const altDownBtn = document.getElementById('altDownBtn');
const setHeadingInput = document.getElementById('setHeadingInput');
const setHeadingBtn = document.getElementById('setHeadingBtn');
const setAltInput = document.getElementById('setAltInput');
const setAltBtn = document.getElementById('setAltBtn');

let aircraft = [];
let anim = null;
let lastTime = performance.now();
let selectedId = null;
let score = 0;
let lastRadioText = '';
let currentTask = null;
let responseTimer = null;
let responseTimeLeft = 0;
let audioCtx = null;

// --- Radio: static + TTS ---
function ensureAudioCtx(){ if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }

function playStatic(duration = 350, level = 0.08){
  if (!radioToggle.checked) return Promise.resolve();
  ensureAudioCtx();
  const ctx = audioCtx;
  const bufferSize = Math.floor(ctx.sampleRate * duration/1000);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * 0.6;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1500;
  const gain = ctx.createGain();
  gain.gain.value = level;
  src.connect(band).connect(gain).connect(ctx.destination);
  src.start();
  return new Promise(res => { src.onended = res; });
}

function speakEnglish(text){
  lastRadioText = text;
  if (!radioToggle.checked) return;
  // some browsers block speech until user interacts; ensure interaction
  try {
    playStatic(280, 0.07).then(()=>{
      if ('speechSynthesis' in window){
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = 1.0;
        u.pitch = 1.0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    });
  } catch(e){ console.warn('TTS error', e); }
}

// --- Aircraft model ---
const CALLSIGNS = ['Speedbird','Delta','Lufthansa','KLM','Iberia','Alitalia','AirFrance','Alpha','Bravo','Tango','Victor','Echo','Sierra','Omega'];

function randCallsign(){
  if (Math.random() < 0.5) return CALLSIGNS[Math.floor(Math.random()*CALLSIGNS.length)] + ' ' + Math.floor(Math.random()*900+100);
  return ['ALPHA','BRAVO','CHARLIE','DELTA','ECHO'][Math.floor(Math.random()*5)] + ' ' + Math.floor(Math.random()*90+10);
}

function createAircraft(id){
  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;
  return {
    id,
    callsign: randCallsign(),
    x: Math.random() * w,
    y: Math.random() * h,
    heading: Math.random() * 360,
    speed: 30 + Math.random()*140,
    alt: 3000 + Math.floor(Math.random()*7000),
    color: `hsl(${Math.floor(Math.random()*360)},70%,60%)`
  };
}

function drawGrid(){
  const w = canvas.width / dpi;
  const h = canvas.height / dpi;
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#bff';
  for (let r=60;r<Math.max(w,h); r+=60){
    ctx.beginPath(); ctx.arc(w/2,h/2,r,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  const g = ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,Math.min(w,h)/2);
  g.addColorStop(0,'rgba(143,240,255,0.06)'); g.addColorStop(1,'transparent');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h); ctx.restore();
}

function draw(){
  const rect = canvas.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = 'rgba(0,8,12,0.6)'; ctx.fillRect(0,0,w,h);
  drawGrid();
  aircraft.forEach(ac=>{
    ctx.save(); ctx.translate(ac.x,ac.y); ctx.rotate((ac.heading-90)*Math.PI/180);
    if (selectedId===ac.id){ ctx.shadowColor='rgba(0,200,255,0.9)'; ctx.shadowBlur=18; } else { ctx.shadowBlur=8; ctx.shadowColor='rgba(0,150,200,0.4)'; }
    ctx.fillStyle = ac.color; ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(7,8); ctx.lineTo(-7,8); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#dff'; ctx.font='12px monospace'; ctx.fillText(`${ac.callsign} ${Math.round(ac.alt)}ft`, ac.x+10, ac.y-10);
  });
}

function update(dt){
  const rect = canvas.getBoundingClientRect();
  aircraft.forEach(ac=>{
    const rad = ac.heading * Math.PI/180;
    const vx = Math.cos(rad) * ac.speed * dt/10;
    const vy = Math.sin(rad) * ac.speed * dt/10;
    ac.x += vx; ac.y += vy;
    if (ac.x < 0) ac.x += rect.width; if (ac.x > rect.width) ac.x -= rect.width;
    if (ac.y < 0) ac.y += rect.height; if (ac.y > rect.height) ac.y -= rect.height;
  });
}

function loop(){
  const now = performance.now();
  const dt = (now - lastTime)/1000; lastTime = now;
  update(dt);
  draw();
  anim = requestAnimationFrame(loop);
}

// selection
canvas.addEventListener('click', (ev)=>{
  const r = canvas.getBoundingClientRect();
  const x = ev.clientX - r.left; const y = ev.clientY - r.top;
  let nearest=null, nd=9999;
  for (const ac of aircraft){ const dx=ac.x-x, dy=ac.y-y, d=Math.hypot(dx,dy); if (d<22 && d<nd){ nearest=ac; nd=d; } }
  if (nearest){ selectAircraft(nearest.id); speakEnglish(`${nearest.callsign}, report heading and altitude`); setStatus(`Selected ${nearest.callsign}`); }
  else deselect();
});

function selectAircraft(id){ selectedId = id; renderSelectedInfo(); }
function deselect(){ selectedId = null; renderSelectedInfo(); }

function renderSelectedInfo(){
  if (!selectedId){ selectedInfo.textContent='None'; return; }
  const ac = aircraft.find(a=>a.id===selectedId);
  if (!ac){ selectedInfo.textContent='None'; return; }
  selectedInfo.innerText = `Callsign: ${ac.callsign}\nHeading: ${Math.round(ac.heading)}°\nSpeed: ${Math.round(ac.speed)} px\nAltitude: ${Math.round(ac.alt)} ft\nX:${Math.round(ac.x)} Y:${Math.round(ac.y)}`;
  setHeadingInput.value = Math.round(ac.heading); setAltInput.value = Math.round(ac.alt);
}

// controls
leftBtn.onclick = ()=> changeHeading(-5); rightBtn.onclick = ()=> changeHeading(5);
altUpBtn.onclick = ()=> changeAlt(100); altDownBtn.onclick = ()=> changeAlt(-100);
setHeadingBtn.onclick = ()=> { const v = parseInt(setHeadingInput.value); if (!isNaN(v)) setHeading(v%360); };
setAltBtn.onclick = ()=> { const v = parseInt(setAltInput.value); if (!isNaN(v)) setAlt(v); };

function changeHeading(delta){
  if (!selectedId) return setStatus('Select an aircraft first');
  const ac = aircraft.find(a=>a.id===selectedId); ac.heading = (ac.heading + delta + 360)%360; renderSelectedInfo();
  speakEnglish(`${ac.callsign}, turn heading ${Math.round(ac.heading)} degrees`);
  checkTaskFulfil(ac);
}

function setHeading(val){ if (!selectedId) return setStatus('Select an aircraft first'); const ac = aircraft.find(a=>a.id===selectedId); ac.heading = (val+360)%360; renderSelectedInfo(); speakEnglish(`${ac.callsign}, heading set to ${Math.round(ac.heading)} degrees`); checkTaskFulfil(ac); }

function changeAlt(delta){ if (!selectedId) return setStatus('Select an aircraft first'); const ac = aircraft.find(a=>a.id===selectedId); ac.alt = Math.max(0, ac.alt+delta); renderSelectedInfo(); speakEnglish(`${ac.callsign}, altitude ${Math.round(ac.alt)} feet`); checkTaskFulfil(ac); }

function setAlt(val){ if (!selectedId) return setStatus('Select an aircraft first'); const ac = aircraft.find(a=>a.id===selectedId); ac.alt = Math.max(0, val); renderSelectedInfo(); speakEnglish(`${ac.callsign}, altitude set to ${Math.round(ac.alt)} feet`); checkTaskFulfil(ac); }

// keyboard
window.addEventListener('keydown',(e)=>{
  if (e.key==='ArrowLeft'){ e.preventDefault(); changeHeading(-5); }
  if (e.key==='ArrowRight'){ e.preventDefault(); changeHeading(5); }
  if (e.key==='ArrowUp'){ e.preventDefault(); changeAlt(100); }
  if (e.key==='ArrowDown'){ e.preventDefault(); changeAlt(-100); }
  if (e.code==='Space'){ e.preventDefault(); if (lastRadioText) speakEnglish(lastRadioText); }
});

// tasks and scoring
function createTask(){
  if (aircraft.length===0) return;
  clearTask();
  const t = Math.floor(Math.random()*4);
  if (t===0){
    // heading command
    const ac = randomAircraft();
    const newH = Math.floor(Math.random()*360);
    currentTask = {type:'heading', callsign:ac.callsign, id:ac.id, value:newH};
    taskDisplay.textContent = `Command: ${ac.callsign} turn heading ${newH}°`;
    speakEnglish(`${ac.callsign}, turn heading ${newH} degrees`);
  } else if (t===1){
    const ac = randomAircraft();
    const newAlt = (Math.floor(Math.random()*40)+25)*100;
    currentTask = {type:'alt', callsign:ac.callsign, id:ac.id, value:newAlt};
    taskDisplay.textContent = `Command: ${ac.callsign} climb to ${newAlt}ft`;
    speakEnglish(`${ac.callsign}, climb to flight level ${Math.floor(newAlt/100)}`);
  } else if (t===2){
    // identify heading question
    const ac = randomAircraft();
    currentTask = {type:'identifyHeading', callsign:ac.callsign, id:ac.id, value:Math.round(ac.heading)};
    taskDisplay.textContent = `Question: identify heading of ${ac.callsign}`;
    speakEnglish(`Identify heading of ${ac.callsign}`);
  } else {
    // closest pair detection (informational)
    currentTask = {type:'closest'};
    taskDisplay.textContent = `Question: which two aircraft are closest?`;
    speakEnglish('Which two aircraft are closest?');
  }
  // start timer
  startResponseTimer(10);
}

function randomAircraft(){ return aircraft[Math.floor(Math.random()*aircraft.length)]; }

function startResponseTimer(seconds){
  if (responseTimer) clearInterval(responseTimer);
  responseTimeLeft = seconds;
  timeLeftSpan.textContent = responseTimeLeft;
  responseTimer = setInterval(()=>{
    responseTimeLeft -= 1;
    timeLeftSpan.textContent = responseTimeLeft;
    if (responseTimeLeft <= 0){ clearInterval(responseTimer); responseTimer = null; onResponseTimeout(); }
  }, 1000);
}

function onResponseTimeout(){
  setStatus('Time out');
  if (currentTask && currentTask.type && currentTask.type !== 'closest'){
    score -= 1; scoreSpan.textContent = score;
    speakEnglish('Time expired');
  }
  currentTask = null;
  taskDisplay.textContent = '—';
  timeLeftSpan.textContent = '0';
}

function checkTaskFulfil(ac){
  if (!currentTask) return;
  if (ac.id !== currentTask.id) return; // wrong aircraft
  if (currentTask.type === 'heading'){
    const diff = Math.abs(((ac.heading - currentTask.value + 180 + 360) % 360) - 180);
    if (diff <= 5){
      score += 1; scoreSpan.textContent = score; speakEnglish('Correct'); setStatus('Correct',2000); clearTask();
    }
  } else if (currentTask.type === 'alt'){
    if (Math.abs(ac.alt - currentTask.value) <= 100){
      score += 1; scoreSpan.textContent = score; speakEnglish('Correct'); setStatus('Correct',2000); clearTask();
    }
  } else if (currentTask.type === 'identifyHeading'){
    const diff = Math.abs(((ac.heading - currentTask.value + 180 + 360) % 360) - 180);
    // user must click aircraft to select then we consider it correct if difference small
    if (diff <= 10){
      score += 1; scoreSpan.textContent = score; speakEnglish('Correct'); setStatus('Correct',2000); clearTask();
    } else {
      score -= 1; scoreSpan.textContent = score; speakEnglish('Incorrect'); setStatus('Incorrect',2000); clearTask();
    }
  }
}

function clearTask(){
  currentTask = null;
  taskDisplay.textContent = '—';
  if (responseTimer){ clearInterval(responseTimer); responseTimer = null; timeLeftSpan.textContent = '0'; }
}

// util
function setStatus(txt, t=2000){ statusDiv.textContent = txt; if (t>0) setTimeout(()=>{ if (statusDiv.textContent===txt) statusDiv.textContent=''; }, t); }

// UI: start/stop/task
startBtn.onclick = ()=>{
  const count = parseInt(aircraftCountSelect.value);
  aircraft = []; for (let i=0;i<count;i++) aircraft.push(createAircraft(i+1));
  lastTime = performance.now();
  if (!anim) loop();
  startBtn.disabled = true; stopBtn.disabled = false; taskBtn.disabled = false;
  score = 0; scoreSpan.textContent = score; setStatus('Simulation started');
};
stopBtn.onclick = ()=>{ if (anim) cancelAnimationFrame(anim); anim=null; startBtn.disabled=false; stopBtn.disabled=true; taskBtn.disabled=true; setStatus('Stopped',1500); clearTask(); };

taskBtn.onclick = ()=>{ createTask(); };

// periodic radio hints
setInterval(()=>{ if (!anim || !radioToggle.checked) return; const hints = ['Monitoring traffic','Maintain separation','Prepare for next task']; speakEnglish(hints[Math.floor(Math.random()*hints.length)]); }, 20000);

// keyboard repeat last radio (space) handled above by event listener
window.addEventListener('keydown',(e)=>{ if (e.code==='Space'){ e.preventDefault(); if (lastRadioText) speakEnglish(lastRadioText); } });

// initial size
setTimeout(()=>{ resizeCanvas(); }, 200);
