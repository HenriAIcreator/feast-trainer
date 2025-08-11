// FEAST II Trainer — rozšírený o niekoľko FEAST II štýlových úloh
const canvas = document.getElementById('radar');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const taskBtn = document.getElementById('taskBtn');
const aircraftCountSelect = document.getElementById('aircraftCount');
const taskDisplay = document.getElementById('taskDisplay');
const optionsDiv = document.getElementById('options');
const scoreDiv = document.getElementById('score');
const radioToggle = document.getElementById('radioToggle');
const modeSelect = document.getElementById('modeSelect');
const memoryInputDiv = document.getElementById('memoryInput');

let aircraft = [];
let animationId = null;
let width = canvas.width, height = canvas.height;
let score = 0;
let currentTask = null;
let memorySequence = [];

// --- AUDIO (WebAudio + SpeechSynthesis) ---
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioCtx();
function speak(text, lang='sk-SK') {
  if (!radioToggle.checked) return;
  if ('speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance(text);
    // choose voice matching language if available
    utter.lang = lang;
    utter.rate = 0.95;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  }
}

// --- Aircraft model ---
function createAircraft(id) {
  return {
    id: id,
    callsign: 'AC' + (100 + id),
    x: Math.random() * width,
    y: Math.random() * height,
    heading: Math.random() * 360,
    speed: 40 + Math.random() * 140,
    alt: 2000 + Math.floor(Math.random()*5000),
    color: '#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0')
  }
}

// --- Drawing radar and optional highlights ---
function drawRadar(highlightId=null, showMemory=null) {
  ctx.clearRect(0,0,width,height);
  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let r=50;r<Math.max(width,height);r+=50) {
    ctx.beginPath();
    ctx.arc(width/2, height/2, r, 0, Math.PI*2);
    ctx.stroke();
  }
  // center marker
  ctx.fillStyle = '#9fe0ff';
  ctx.beginPath();
  ctx.arc(width/2, height/2, 4,0,Math.PI*2);
  ctx.fill();

  aircraft.forEach(ac => {
    ctx.save();
    ctx.translate(ac.x, ac.y);
    ctx.rotate((ac.heading-90)*Math.PI/180);
    ctx.fillStyle = ac.color;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(-6,6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#dff';
    ctx.font = '12px monospace';
    ctx.fillText(`${ac.callsign} ${Math.round(ac.alt)}ft`, ac.x+8, ac.y-8);

    if (highlightId === ac.id) {
      ctx.strokeStyle = 'rgba(255,255,0,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ac.x, ac.y, 18, 0, Math.PI*2);
      ctx.stroke();
    }
  });

  // show memory items near center if requested
  if (showMemory && memorySequence.length>0) {
    ctx.fillStyle = '#ffd';
    ctx.font = '20px monospace';
    ctx.fillText('Pamätaj si: ' + memorySequence.join(' '), 30, 40);
  }
}

// --- Movement update ---
let lastTime = performance.now();
function update() {
  const now = performance.now();
  const dt = (now - lastTime)/1000;
  lastTime = now;
  aircraft.forEach(ac => {
    const rad = ac.heading * Math.PI/180;
    const vx = Math.cos(rad) * ac.speed * dt/10;
    const vy = Math.sin(rad) * ac.speed * dt/10;
    ac.x += vx;
    ac.y += vy;
    if (ac.x < 0) ac.x += width;
    if (ac.x > width) ac.x -= width;
    if (ac.y < 0) ac.y += height;
    if (ac.y > height) ac.y -= height;
  });
}

// --- Loop ---
function loop() {
  update();
  drawRadar(currentTask && currentTask.type==='radar' ? currentTask.targetId : null, currentTask && currentTask.type==='memory');
  animationId = requestAnimationFrame(loop);
}

// --- Tasks generation (FEAST II-like) ---
function generateTask() {
  if (aircraft.length === 0) return;
  clearUI();
  const mode = modeSelect.value;
  if (mode === 'radar') {
    // Radar Tracking: announce callsign to track, show highlight briefly, then ask heading/alt
    const target = aircraft[Math.floor(Math.random()*aircraft.length)];
    currentTask = {type:'radar', targetId: target.id, targetCall: target.callsign};
    taskDisplay.textContent = `Úloha (Radar Tracking): Sleduj lietadlo ${target.callsign} po 6 sekúnd.`;
    speak(`Sledujte lietadlo ${target.callsign}.`);
    // highlight for 3 seconds, then remove and after 6s ask question
    setTimeout(()=> {
      taskDisplay.textContent = `Úloha (Radar Tracking): Sledujte teraz pozorne...`;
    }, 1000);
    setTimeout(()=> {
      // after tracking period, ask heading question
      const correctHeading = Math.round(target.heading);
      const options = makeHeadingOptions(correctHeading);
      taskDisplay.textContent = `Otázka: Aký heading má ${target.callsign}? Vyber správnu možnosť.`;
      showOptions(options, opt => handleAnswer(opt===correctHeading));
    }, 6000);
  } else if (mode === 'heading') {
    // Heading Change: instruct to change heading, update aircraft heading, then ask which heading now
    const target = aircraft[Math.floor(Math.random()*aircraft.length)];
    const newHeading = Math.round(Math.random()*359);
    currentTask = {type:'heading', targetId: target.id, targetCall: target.callsign, newHeading};
    // announce and apply
    speak(`${target.callsign}, otočte smer na ${newHeading} stupňov.`);
    taskDisplay.textContent = `Úloha (Heading Change): Inštrukcia pre ${target.callsign} — otočte na ${newHeading}°. Sledujte zmenu.`;
    // smoothly change heading over 2s
    const start = performance.now();
    const from = target.heading;
    const duration = 2000;
    function animateHeading(ts){
      const t = Math.min(1,(ts-start)/duration);
      // shortest rotation
      const delta = ((((newHeading - from + 540) % 360) - 180));
      target.heading = (from + delta*t + 360) % 360;
      if (t<1) requestAnimationFrame(animateHeading);
      else {
        // ask question
        taskDisplay.textContent = `Otázka: Aký je nový heading lietadla ${target.callsign}?`;
        const opts = makeHeadingOptions(Math.round(target.heading));
        showOptions(opts, opt => handleAnswer(opt===Math.round(target.heading)));
      }
    }
    requestAnimationFrame(animateHeading);
  } else if (mode === 'memory') {
    // Multitasking memory: show short sequence of digits to remember while simulation runs, then ask to enter sequence
    memorySequence = [];
    const len = 4; // number of items
    for (let i=0;i<len;i++) memorySequence.push(Math.floor(Math.random()*9));
    currentTask = {type:'memory'};
    taskDisplay.textContent = 'Úloha (Pamäť): Zapamätaj si túto sekvenciu čísiel.';
    // show memory on screen for 3s
    drawRadar(null, true);
    speak('Zapamätajte si sekvenciu.');
    setTimeout(()=> {
      // hide and start simulation for a few seconds then ask
      taskDisplay.textContent = 'Pamätajte si ju, teraz beží simulácia...';
      setTimeout(()=> {
        taskDisplay.textContent = 'Napíš zapamätanú sekvenciu:';
        showMemoryInput();
      }, 3500);
    }, 3000);
  }
}

function makeHeadingOptions(correct) {
  const opts = new Set([correct]);
  while (opts.size < 4) {
    const delta = (Math.floor(Math.random()*5)+1)*10;
    const sign = Math.random()>0.5?1:-1;
    opts.add((correct + sign*delta + 360)%360);
  }
  return shuffle(Array.from(opts));
}

// --- UI helpers ---
function showOptions(options, onSelect) {
  optionsDiv.innerHTML = '';
  memoryInputDiv.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt + '°';
    btn.onclick = ()=> onSelect(opt);
    optionsDiv.appendChild(btn);
  });
}

function showMemoryInput() {
  optionsDiv.innerHTML = '';
  memoryInputDiv.innerHTML = '';
  const input = document.createElement('input');
  input.placeholder = 'Zadaj sekvenciu (napr. 5 2 8 1)';
  input.style.width = '240px';
  const submit = document.createElement('button');
  submit.textContent = 'Odoslať';
  submit.onclick = ()=> {
    const val = input.value.trim().replace(/\s+/g,' ').split(' ').map(x=>parseInt(x)).filter(x=>!isNaN(x));
    const correct = JSON.stringify(val) === JSON.stringify(memorySequence);
    handleAnswer(correct);
    memoryInputDiv.innerHTML = '';
  };
  memoryInputDiv.appendChild(input);
  memoryInputDiv.appendChild(submit);
}

function handleAnswer(isCorrect) {
  if (isCorrect) { score += 1; scoreDiv.textContent = `Skóre: ${score}`; taskDisplay.textContent += ' ✅ Správne'; speak('Správne'); }
  else { taskDisplay.textContent += ' ❌ Nesprávne'; speak('Nesprávne'); }
}

// --- Utilities ---
function shuffle(a){ for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function clearUI() {
  optionsDiv.innerHTML = '';
  memoryInputDiv.innerHTML = '';
}

// --- Controls ---
startBtn.onclick = ()=> {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const count = parseInt(aircraftCountSelect.value);
  aircraft = [];
  for (let i=0;i<count;i++) aircraft.push(createAircraft(i+1));
  lastTime = performance.now();
  loop();
  startBtn.disabled = true;
  stopBtn.disabled = false;
  taskBtn.disabled = false;
  score = 0; scoreDiv.textContent = `Skóre: ${score}`;
};

stopBtn.onclick = ()=> {
  cancelAnimationFrame(animationId);
  animationId = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  taskBtn.disabled = true;
  currentTask = null;
  clearUI();
  taskDisplay.textContent = 'Úloha: —';
};

taskBtn.onclick = ()=> {
  generateTask();
};

// periodic ATC hint to make it lively
setInterval(()=>{
  if (animationId && radioToggle.checked) {
    // small generic hint
    const samples = [
      'Sledujte pozície lietadiel.',
      'Verifikujte headingy a altitúdy.',
      'Pripravte sa na ďalšiu úlohu.'
    ];
    speak(samples[Math.floor(Math.random()*samples.length)]);
  }
}, 9000);
