import './style.css';
import Matter from 'matter-js';
import { saveScore, getTopScores, createRoom, joinRoom, listenToRoom, updateRoomState, sendPunishment } from './firebase.js';

// --- Audio System (Web Audio API Synth) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playDropSound() {
  if (audioCtx.state === 'suspended') return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(350, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, audioCtx.currentTime + 0.15);
  gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}

function playFlipSound() {
  if (audioCtx.state === 'suspended') return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.08);
  gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}

function playMismatchSound() {
  if (audioCtx.state === 'suspended') return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(140, audioCtx.currentTime + 0.25);
  gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.25);
}

function playMergeSound(tier) {
  if (audioCtx.state === 'suspended') return;
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  const baseFreq = 300 + (tier * 45);
  
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, audioCtx.currentTime + 0.25);
  
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(baseFreq * 1.25, audioCtx.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(baseFreq * 2.0, audioCtx.currentTime + 0.25);
  
  gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
  
  osc1.connect(gainNode);
  osc2.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc1.start();
  osc2.start();
  osc1.stop(audioCtx.currentTime + 0.25);
  osc2.stop(audioCtx.currentTime + 0.25);
}

// BGM System
let bgmGain = null;
let bgmInterval = null;
function startBGM() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (bgmInterval) return;
  
  bgmGain = audioCtx.createGain();
  bgmGain.gain.value = 0.03; 
  bgmGain.connect(audioCtx.destination);
  
  // Lofi chords: Cmaj7 -> Am7 -> Dm7 -> G7
  const chords = [
    [261.63, 329.63, 392.00, 493.88], // C E G B
    [220.00, 261.63, 329.63, 392.00], // A C E G
    [293.66, 349.23, 440.00, 587.33], // D F A D
    [196.00, 246.94, 293.66, 392.00]  // G B D G
  ];
  let chordIdx = 0;
  
  bgmInterval = setInterval(() => {
    if (isGameOver) return;
    const currentChord = chords[chordIdx];
    
    currentChord.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.08); // Arpeggiated
      
      const noteGain = audioCtx.createGain();
      noteGain.gain.setValueAtTime(0.04, audioCtx.currentTime + i * 0.08);
      noteGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.8);
      
      osc.connect(noteGain);
      noteGain.connect(bgmGain);
      
      osc.start(audioCtx.currentTime + i * 0.08);
      osc.stop(audioCtx.currentTime + 1.8);
    });
    
    chordIdx = (chordIdx + 1) % chords.length;
  }, 3000);
}

// Helper to adjust color brightness for 3D gradient borders
function adjustColorBrightness(hex, percent) {
  let num = parseInt(hex.replace("#",""), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      G = (num >> 8 & 0x00FF) + amt,
      B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R<255?R<0?0:R:255)*0x10000 + (G<255?G<0?0:G:255)*0x100 + (B<255?B<0?0:B:255)).toString(16).slice(1);
}

// --- Game Configuration & State ---
let GAME_WIDTH = Math.min(window.innerWidth, 500);
let GAME_HEIGHT = window.innerHeight;
const WALL_THICKNESS = 60;
const TOP_LIMIT = GAME_HEIGHT * 0.16; // 16% height is the aim and drop zone
const scaleFactor = GAME_WIDTH / 400;

// Fruit config (12 tiers for matching. radii are slightly downscaled for fitting multiple card bubbles)
const FRUITS = [
  { name: "Arándano", radius: 14 * scaleFactor, color: '#4d4dff', emoji: '🫐', points: 1 },
  { name: "Cereza", radius: 19 * scaleFactor, color: '#ff4d4d', emoji: '🍒', points: 3 },
  { name: "Fresa", radius: 25 * scaleFactor, color: '#ff8888', emoji: '🍓', points: 6 },
  { name: "Uva", radius: 32 * scaleFactor, color: '#8a2be2', emoji: '🍇', points: 10 },
  { name: "Limón", radius: 40 * scaleFactor, color: '#fffacd', emoji: '🍋', points: 15 },
  { name: "Mandarina", radius: 49 * scaleFactor, color: '#ffa500', emoji: '🍊', points: 21 },
  { name: "Naranja", radius: 58 * scaleFactor, color: '#ff8c00', emoji: '🟠', points: 28 },
  { name: "Manzana", radius: 68 * scaleFactor, color: '#dc143c', emoji: '🍎', points: 36 },
  { name: "Durazno", radius: 79 * scaleFactor, color: '#ffb6c1', emoji: '🍑', points: 45 },
  { name: "Coco", radius: 91 * scaleFactor, color: '#ffffff', emoji: '🥥', points: 55 },
  { name: "Piña", radius: 104 * scaleFactor, color: '#ffe4b5', emoji: '🍍', points: 66 },
  { name: "Melón", radius: 118 * scaleFactor, color: '#90ee90', emoji: '🍈', points: 78 },
  { name: "Sandía", radius: 135 * scaleFactor, color: '#228b22', emoji: '🍉', points: 100 },
];

let engine, render, runner;
let currentScore = 0;
let nextFruitTier = 0;
let isGameOver = false;
let isDropping = false;
let mouseX = GAME_WIDTH / 2;

// Memory Game State
let firstRevealed = null;
let secondRevealed = null;
let lockFlipping = false;
let mismatchTimeout = null;
let particles = [];

// Multiplayer State
let isMultiplayer = false;
let roomCode = null;
let isPlayer1 = false;
let unsubscribeRoom = null;
let pendingPunishments = 0;
let localPunishmentCount = 0;

// DOM Elements
const scoreEl = document.getElementById('score');
const nextPreviewEl = document.getElementById('next-fruit-preview');
const gameOverScreen = document.getElementById('game-over-screen');
const startScreen = document.getElementById('start-screen');
const finalScoreEl = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-button');
const gameContainer = document.getElementById('game-container');

// Multiplayer DOM
const playSoloBtn = document.getElementById('play-solo-btn');
const playMultiBtn = document.getElementById('play-multi-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const backToMenuBtn = document.getElementById('back-to-menu-btn');
const modeSelection = document.getElementById('mode-selection');
const multiplayerLobby = document.getElementById('multiplayer-lobby');
const waitingRoom = document.getElementById('waiting-room');
const roomCodeDisplay = document.getElementById('room-code-display');
const opponentScoreContainer = document.getElementById('opponent-score-container');
const opponentScoreEl = document.getElementById('opponent-score');

// --- Initialization ---
function init() {
  engine = Matter.Engine.create({
    gravity: { y: 0.85 } // Soft falling gravity
  });
  
  render = Matter.Render.create({
    element: gameContainer,
    engine: engine,
    options: {
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      wireframes: false,
      background: 'transparent'
    }
  });

  const wallOptions = { 
    isStatic: true,
    render: { fillStyle: '#e6a8ff', lineWidth: 0, strokeStyle: 'transparent' }
  };
  
  const ground = Matter.Bodies.rectangle(GAME_WIDTH / 2, GAME_HEIGHT + WALL_THICKNESS / 2, GAME_WIDTH + WALL_THICKNESS * 2, WALL_THICKNESS, wallOptions);
  const leftWall = Matter.Bodies.rectangle(0 - WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, wallOptions);
  const rightWall = Matter.Bodies.rectangle(GAME_WIDTH + WALL_THICKNESS / 2, GAME_HEIGHT / 2, WALL_THICKNESS, GAME_HEIGHT * 2, wallOptions);

  Matter.World.add(engine.world, [ground, leftWall, rightWall]);

  setupInput();
  setupMultiplayerUI();

  Matter.Render.run(render);
  runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);
  Matter.Events.on(render, 'afterRender', gameLoop);
}

// --- Multiplayer UI & Setup ---
function setupMultiplayerUI() {
  playSoloBtn.addEventListener('click', () => {
    isMultiplayer = false;
    startGame();
  });

  playMultiBtn.addEventListener('click', () => {
    modeSelection.classList.add('hidden');
    multiplayerLobby.classList.remove('hidden');
  });

  backToMenuBtn.addEventListener('click', () => {
    multiplayerLobby.classList.add('hidden');
    modeSelection.classList.remove('hidden');
  });

  createRoomBtn.addEventListener('click', async () => {
    roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    isPlayer1 = true;
    isMultiplayer = true;
    
    createRoomBtn.innerText = 'Creando sala...';
    createRoomBtn.disabled = true;
    
    const success = await createRoom(roomCode);
    if (success) {
      multiplayerLobby.classList.add('hidden');
      waitingRoom.classList.remove('hidden');
      roomCodeDisplay.innerText = roomCode;
      
      // Wait for player 2 to join
      unsubscribeRoom = listenToRoom(roomCode, (data) => {
        if (data.status === 'playing') {
          startGame();
        }
      });
    } else {
      alert("Error al crear sala. Intenta de nuevo.");
      createRoomBtn.innerText = 'Crear Sala';
      createRoomBtn.disabled = false;
    }
  });

  joinRoomBtn.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length !== 4) return alert("El código debe ser de 4 letras");
    
    joinRoomBtn.innerText = 'Uniéndose...';
    joinRoomBtn.disabled = true;
    roomCode = code;
    isPlayer1 = false;
    isMultiplayer = true;
    
    const success = await joinRoom(code);
    if (success) {
      startGame();
    } else {
      alert("Sala no encontrada o ya se encuentra llena.");
      joinRoomBtn.innerText = 'Unirse a Sala';
      joinRoomBtn.disabled = false;
    }
  });
}

function startGame() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  startScreen.classList.add('hidden');
  
  if (isMultiplayer) {
    opponentScoreContainer.classList.remove('hidden');
    if (unsubscribeRoom) unsubscribeRoom();
    
    unsubscribeRoom = listenToRoom(roomCode, (data) => {
      // Check game outcome
      if (data.status === 'player1_lost' && !isPlayer1) {
        triggerWin();
        return;
      }
      if (data.status === 'player2_lost' && isPlayer1) {
        triggerWin();
        return;
      }

      const opponentData = isPlayer1 ? data.player2 : data.player1;
      const myData = isPlayer1 ? data.player1 : data.player2;
      
      if (opponentData) {
        opponentScoreEl.innerText = opponentData.score;
      }
      if (myData && myData.punishments > localPunishmentCount) {
        // Punishments sent by opponent!
        const newPunishments = myData.punishments - localPunishmentCount;
        pendingPunishments += newPunishments;
        localPunishmentCount = myData.punishments;
      }
    });
  }

  resetGame();
}

function resetGame() {
  isGameOver = false;
  currentScore = 0;
  pendingPunishments = 0;
  firstRevealed = null;
  secondRevealed = null;
  lockFlipping = false;
  if (mismatchTimeout) clearTimeout(mismatchTimeout);
  mismatchTimeout = null;
  updateScore();
  
  // Clear game bodies
  const bodies = Matter.Composite.allBodies(engine.world);
  const elementsToRemove = bodies.filter(b => b.fruitTier !== undefined || b.isRock || b.isParticle);
  Matter.World.remove(engine.world, elementsToRemove);
  
  particles = [];
  gameOverScreen.classList.add('hidden');
  rollNextFruit();
  startBGM();
}

// Next fruit rolls from tiers 0-2 (blueberry, cherry, strawberry)
function rollNextFruit() {
  nextFruitTier = Math.floor(Math.random() * 3);
  const next = FRUITS[nextFruitTier];
  
  nextPreviewEl.innerHTML = '';
  const previewCanvas = document.createElement('canvas');
  const boxSize = 50; 
  previewCanvas.width = boxSize;
  previewCanvas.height = boxSize;
  const ctx = previewCanvas.getContext('2d');
  
  ctx.translate(boxSize/2, boxSize/2);
  
  // Draw the preview face-down or face-up? Let's draw it face-up so player knows what is next!
  const r = next.radius * 0.9;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * Math.PI);
  ctx.fillStyle = next.color;
  ctx.fill();
  
  ctx.font = `${r * 1.3}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(next.emoji, 0, 0);

  // Cute face
  ctx.fillStyle = '#4a2511'; 
  const eyeOffset = r * 0.35;
  const eyeSize = r * 0.08 + 1;
  
  ctx.beginPath();
  ctx.arc(-eyeOffset, -eyeOffset * 0.1, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeOffset, -eyeOffset * 0.1, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = 'rgba(255, 120, 150, 0.4)';
  ctx.beginPath();
  ctx.arc(-eyeOffset * 1.3, eyeOffset * 0.3, eyeSize * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeOffset * 1.3, eyeOffset * 0.3, eyeSize * 1.8, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#4a2511';
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, eyeOffset * 0.1, eyeOffset * 0.6, 0.1, Math.PI - 0.1);
  ctx.stroke();
  
  nextPreviewEl.appendChild(previewCanvas);
}

function updateScore() {
  scoreEl.innerText = currentScore;
  if (isMultiplayer) {
    updateRoomState(roomCode, isPlayer1, { score: currentScore });
  }
}

// --- Spawning and Game Logic ---
function dropFruit(x) {
  if (isGameOver || isDropping) return;
  
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  // If we have pending punishments, drop a rock instead!
  if (pendingPunishments > 0) {
    dropRock(x);
    pendingPunishments--;
    return;
  }
  
  const fruitConfig = FRUITS[nextFruitTier];
  const spawnX = Math.max(fruitConfig.radius, Math.min(x, GAME_WIDTH - fruitConfig.radius));
  
  const body = Matter.Bodies.circle(spawnX, TOP_LIMIT, fruitConfig.radius, {
    restitution: 0.18,
    friction: 0.08,
    render: { fillStyle: fruitConfig.color, lineWidth: 0, strokeStyle: 'transparent' },
  });

  body.fruitTier = nextFruitTier;
  body.isRevealed = false; // Drops face down!
  body.isFlashing = false;
  
  Matter.World.add(engine.world, body);
  playDropSound();
  
  isDropping = true;
  setTimeout(() => {
    isDropping = false;
    rollNextFruit();
  }, 750); // cooldown between drops
}

function spawnFruit(x, y, tier) {
  const config = FRUITS[tier];
  const body = Matter.Bodies.circle(x, y, config.radius, {
    restitution: 0.2,
    friction: 0.08,
    render: { fillStyle: config.color, lineWidth: 0, strokeStyle: 'transparent' }
  });
  body.fruitTier = tier;
  body.isRevealed = false;
  body.isFlashing = false;
  Matter.World.add(engine.world, body);
  return body;
}

function dropRock(x) {
  const radius = 30 * scaleFactor;
  const spawnX = Math.max(radius, Math.min(x, GAME_WIDTH - radius));
  const body = Matter.Bodies.circle(spawnX, TOP_LIMIT, radius, {
    restitution: 0.05,
    friction: 0.4,
    density: 0.006, // heavy rock
    render: { fillStyle: '#7f8c8d', lineWidth: 0, strokeStyle: 'transparent' },
  });
  body.isRock = true;
  Matter.World.add(engine.world, body);
  playDropSound();
  
  isDropping = true;
  setTimeout(() => {
    isDropping = false;
  }, 400);
}

// --- Particle Effects ---
function createParticles(x, y, color) {
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 2;
    const radius = Math.random() * 3 + 2.5;
    
    const p = Matter.Bodies.circle(x, y, radius, {
      isSensor: true,
      collisionFilter: { group: -1, category: 0, mask: 0 }
    });
    
    Matter.Body.setVelocity(p, {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed
    });
    
    p.life = 28;
    p.maxLife = 28;
    p.color = color;
    p.isParticle = true;
    
    Matter.World.add(engine.world, p);
    particles.push(p);
  }
}

function updateParticles() {
  const toRemove = [];
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life--;
    if (p.life <= 0) {
      toRemove.push(p);
      particles.splice(i, 1);
    }
  }
  if (toRemove.length > 0) {
    Matter.World.remove(engine.world, toRemove);
  }
}

// --- Input Handling ---
function setupInput() {
  // Aiming position tracking
  gameContainer.addEventListener('mousemove', (e) => {
    const rect = gameContainer.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
  });
  
  gameContainer.addEventListener('touchmove', (e) => {
    const rect = gameContainer.getBoundingClientRect();
    if (e.touches.length > 0) {
      mouseX = e.touches[0].clientX - rect.left;
    }
  }, { passive: true });

  // Clicking / Tapping action
  gameContainer.addEventListener('mousedown', (e) => {
    const rect = gameContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    handleContainerClick(x, y);
  });
  
  gameContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const rect = gameContainer.getBoundingClientRect();
    if (e.touches.length > 0) {
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      handleContainerClick(x, y);
    }
  }, { passive: false });

  restartBtn.addEventListener('click', () => {
    window.location.reload(); // Reload cleanly to return to main menu
  });
  
  document.getElementById('submit-score-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('player-name');
    const btn = document.getElementById('submit-score-btn');
    const name = nameInput.value.trim();
    
    if (!name) return alert('Por favor, ingresa tu nombre');
    
    btn.disabled = true;
    btn.innerText = 'Guardando...';
    
    const success = await saveScore(name, currentScore);
    if (success) {
      document.getElementById('submit-score-section').style.display = 'none';
      await loadLeaderboard();
    } else {
      alert('Error al guardar el puntaje.');
      btn.disabled = false;
      btn.innerText = 'Guardar Puntaje';
    }
  });
}

function handleContainerClick(x, y) {
  if (isGameOver) return;
  
  if (y < TOP_LIMIT) {
    // Drop zone click
    dropFruit(x);
  } else {
    // Bubble matching zone click
    handleBubbleClick(x, y);
  }
}

function handleBubbleClick(x, y) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const bodies = Matter.Composite.allBodies(engine.world);
  let clickedBody = null;
  let minDistance = Infinity;
  
  // Find clicked bubble
  for (let body of bodies) {
    if (body.fruitTier !== undefined && !body.isRock && !body.isMerging && !body.isFlashing) {
      const d = Math.hypot(body.position.x - x, body.position.y - y);
      if (d < body.circleRadius && d < minDistance) {
        minDistance = d;
        clickedBody = body;
      }
    }
  }
  
  if (!clickedBody) return;
  if (clickedBody.isRevealed) return; // already revealed
  
  // If we had a pending mismatch timer, flip the previous ones back immediately
  if (mismatchTimeout) {
    clearTimeout(mismatchTimeout);
    mismatchTimeout = null;
    if (firstRevealed) firstRevealed.isRevealed = false;
    if (secondRevealed) secondRevealed.isRevealed = false;
    firstRevealed = null;
    secondRevealed = null;
    lockFlipping = false;
  }
  
  if (lockFlipping) return;
  
  // Reveal
  clickedBody.isRevealed = true;
  playFlipSound();
  
  if (!firstRevealed) {
    firstRevealed = clickedBody;
  } else if (!secondRevealed) {
    secondRevealed = clickedBody;
    
    // Compare tiers
    if (firstRevealed.fruitTier === secondRevealed.fruitTier) {
      // Match!
      lockFlipping = true;
      const matchTier = firstRevealed.fruitTier;
      const b1 = firstRevealed;
      const b2 = secondRevealed;
      
      b1.isMerging = true;
      b2.isMerging = true;
      
      setTimeout(() => {
        const spawnX = (b1.position.x + b2.position.x) / 2;
        const spawnY = (b1.position.y + b2.position.y) / 2;
        
        createParticles(spawnX, spawnY, FRUITS[matchTier].color);
        Matter.World.remove(engine.world, [b1, b2]);
        
        // Merge into next tier if not max tier
        const nextTier = matchTier + 1;
        if (nextTier < FRUITS.length) {
          const newBody = spawnFruit(spawnX, spawnY, nextTier);
          
          // Flash new bubble for 1s so the player knows what it is, then flip back
          newBody.isRevealed = true;
          newBody.isFlashing = true;
          setTimeout(() => {
            newBody.isRevealed = false;
            newBody.isFlashing = false;
          }, 1000);
        }
        
        currentScore += FRUITS[matchTier].points;
        updateScore();
        playMergeSound(matchTier);
        
        // Multiplayer punishment: merge Mandarina (tier 5) or above
        if (isMultiplayer && matchTier >= 5) {
          sendPunishment(roomCode, isPlayer1);
        }
        
        firstRevealed = null;
        secondRevealed = null;
        lockFlipping = false;
      }, 350);
      
    } else {
      // Mismatch
      lockFlipping = true;
      mismatchTimeout = setTimeout(() => {
        playMismatchSound();
        if (firstRevealed) firstRevealed.isRevealed = false;
        if (secondRevealed) secondRevealed.isRevealed = false;
        firstRevealed = null;
        secondRevealed = null;
        lockFlipping = false;
        mismatchTimeout = null;
      }, 1000);
    }
  }
}

// --- Game Loop (Rendering & State Check) ---
function gameLoop() {
  const context = render.context;
  const bodies = Matter.Composite.allBodies(engine.world);

  updateParticles();

  // Draw preview next fruit in drop zone
  if (!isGameOver && !isDropping) {
    const next = FRUITS[nextFruitTier];
    context.save();
    context.globalAlpha = 0.55;
    context.translate(mouseX, TOP_LIMIT);
    
    // Draw it face-up at the aiming marker
    const r = next.radius;
    context.beginPath();
    context.arc(0, 0, r, 0, Math.PI * 2);
    context.fillStyle = next.color;
    context.fill();
    
    context.font = `${r * 1.3}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(next.emoji, 0, 0);
    context.restore();
  }

  // Draw custom styles for all game bodies
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    
    if (body.fruitTier !== undefined) {
      const config = FRUITS[body.fruitTier];
      const r = body.circleRadius;
      
      if (!body.isRevealed) {
        // --- Draw Card Back (Shiny glass bubble with a '?') ---
        context.save();
        context.translate(body.position.x, body.position.y);
        context.rotate(body.angle);
        
        // Sphere gradient filling
        const grad = context.createRadialGradient(-r*0.2, -r*0.2, r*0.1, 0, 0, r);
        grad.addColorStop(0, '#f9e7ff');
        grad.addColorStop(0.55, '#dfbbf7');
        grad.addColorStop(1, '#a67bca');
        
        context.beginPath();
        context.arc(0, 0, r, 0, Math.PI * 2);
        context.fillStyle = grad;
        context.fill();
        
        // Shiny Border
        context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        context.lineWidth = Math.max(1.8, r * 0.07);
        context.stroke();
        
        // Question Mark
        context.font = `bold ${r * 1.15}px 'Segoe UI', Arial`;
        context.fillStyle = '#ffffff';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.shadowColor = 'rgba(139, 92, 246, 0.3)';
        context.shadowBlur = 4;
        context.shadowOffsetY = 2;
        context.fillText('?', 0, 0);
        
        // Specular highlight overlay
        context.shadowColor = 'transparent';
        context.fillStyle = 'rgba(255, 255, 255, 0.4)';
        context.beginPath();
        context.ellipse(-r * 0.32, -r * 0.32, r * 0.22, r * 0.1, Math.PI / 4, 0, Math.PI * 2);
        context.fill();
        
        context.restore();
      } else {
        // --- Draw Revealed Fruit ---
        context.save();
        context.translate(body.position.x, body.position.y);
        context.rotate(body.angle);
        
        // Gradient base
        const grad = context.createRadialGradient(-r*0.2, -r*0.2, r*0.1, 0, 0, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.28, config.color);
        grad.addColorStop(1, adjustColorBrightness(config.color, -22));
        
        context.beginPath();
        context.arc(0, 0, r, 0, Math.PI * 2);
        context.fillStyle = grad;
        context.fill();
        
        // Emoji representation
        context.font = `${r * 1.3}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(config.emoji, 0, 0);
        
        // Cute kawaii face overlay
        context.fillStyle = '#4a2511'; 
        const eyeOffset = r * 0.35;
        const eyeSize = r * 0.08 + 1.2;
        
        // Eyes
        context.beginPath();
        context.arc(-eyeOffset, -eyeOffset * 0.1, eyeSize, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.arc(eyeOffset, -eyeOffset * 0.1, eyeSize, 0, Math.PI * 2);
        context.fill();
        
        // Blush cheeks
        context.fillStyle = 'rgba(255, 120, 150, 0.45)';
        context.beginPath();
        context.arc(-eyeOffset * 1.35, eyeOffset * 0.35, eyeSize * 1.8, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.arc(eyeOffset * 1.35, eyeOffset * 0.35, eyeSize * 1.8, 0, Math.PI * 2);
        context.fill();
        
        // Mouth
        context.strokeStyle = '#4a2511';
        context.lineWidth = Math.max(1.8, r * 0.065);
        context.lineCap = 'round';
        context.beginPath();
        
        if (body.fruitTier === FRUITS.length - 1) { // Sandía
          context.arc(0, eyeOffset * 0.2, eyeOffset * 0.5, 0, Math.PI);
          context.stroke();
          context.fillStyle = '#ff7777';
          context.fill();
        } else {
          context.arc(0, eyeOffset * 0.1, eyeOffset * 0.6, 0.1, Math.PI - 0.1);
          context.stroke();
        }
        
        // specular highlight
        context.fillStyle = 'rgba(255, 255, 255, 0.55)';
        context.beginPath();
        context.arc(-r * 0.4, -r * 0.4, r * 0.1, 0, 2 * Math.PI);
        context.fill();

        context.restore();
      }
    } else if (body.isRock) {
      // --- Draw Angry Rock ---
      context.save();
      context.translate(body.position.x, body.position.y);
      context.rotate(body.angle);
      const r = body.circleRadius;
      
      const grad = context.createRadialGradient(-r*0.2, -r*0.2, r*0.1, 0, 0, r);
      grad.addColorStop(0, '#e5e7eb');
      grad.addColorStop(0.4, '#9ca3af');
      grad.addColorStop(1, '#4b5563');
      
      context.beginPath();
      context.arc(0, 0, r, 0, Math.PI * 2);
      context.fillStyle = grad;
      context.fill();
      
      // Angry face detail
      context.fillStyle = '#1f2937'; 
      context.beginPath();
      context.arc(-r*0.28, -r*0.08, r*0.09, 0, Math.PI*2);
      context.arc(r*0.28, -r*0.08, r*0.09, 0, Math.PI*2);
      context.fill();
      
      context.strokeStyle = '#1f2937';
      context.lineWidth = r*0.09;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(-r*0.45, -r*0.35);
      context.lineTo(-r*0.12, -r*0.18);
      context.stroke();
      context.beginPath();
      context.moveTo(r*0.45, -r*0.35);
      context.lineTo(r*0.12, -r*0.18);
      context.stroke();

      context.beginPath();
      context.arc(0, r*0.38, r*0.18, Math.PI, 0);
      context.stroke();

      context.restore();
    }
    
    // --- Game Over Boundary Check ---
    // If a bubble settles above the top limit, trigger game over.
    if (!isGameOver && (body.fruitTier !== undefined || body.isRock) && body.position.y < TOP_LIMIT && body.velocity.y > -0.4 && body.velocity.y < 0.4) {
      if (body.speed < 0.7) {
        triggerGameOver();
      }
    }
  }
  
  // --- Render custom particles ---
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const opacity = p.life / p.maxLife;
    context.save();
    context.globalAlpha = opacity;
    context.beginPath();
    context.arc(p.position.x, p.position.y, p.circleRadius, 0, Math.PI * 2);
    context.fillStyle = p.color;
    context.fill();
    context.restore();
  }

  // --- Aiming top limit line rendering ---
  if (!isGameOver) {
    context.beginPath();
    context.moveTo(0, TOP_LIMIT);
    context.lineTo(GAME_WIDTH, TOP_LIMIT);
    context.strokeStyle = 'rgba(139, 92, 246, 0.3)';
    context.lineWidth = 2;
    context.setLineDash([8, 8]);
    context.stroke();
    context.setLineDash([]);
  }
}

function triggerGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  document.getElementById('game-over-title').innerText = isMultiplayer ? "¡Has perdido!" : "¡Juego Terminado!";
  finalScoreEl.innerText = currentScore;
  
  document.getElementById('submit-score-section').style.display = 'flex';
  document.getElementById('player-name').value = '';
  const submitBtn = document.getElementById('submit-score-btn');
  submitBtn.disabled = false;
  submitBtn.innerText = 'Guardar Puntaje';
  
  gameOverScreen.classList.remove('hidden');
  loadLeaderboard();

  if (isMultiplayer) {
    updateRoomState(roomCode, isPlayer1, {}, isPlayer1 ? 'player1_lost' : 'player2_lost');
    if (unsubscribeRoom) {
      unsubscribeRoom();
      unsubscribeRoom = null;
    }
  }
}

function triggerWin() {
  if (isGameOver) return;
  isGameOver = true;
  document.getElementById('game-over-title').innerText = "¡Ganaste! 🎉";
  finalScoreEl.innerText = currentScore;
  
  document.getElementById('submit-score-section').style.display = 'flex';
  document.getElementById('player-name').value = '';
  const submitBtn = document.getElementById('submit-score-btn');
  submitBtn.disabled = false;
  submitBtn.innerText = 'Guardar Puntaje';
  
  gameOverScreen.classList.remove('hidden');
  loadLeaderboard();

  if (isMultiplayer && unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
}

async function loadLeaderboard() {
  const listEl = document.getElementById('leaderboard-list');
  listEl.innerHTML = '<li>Cargando...</li>';
  
  const topScores = await getTopScores(5);
  listEl.innerHTML = '';
  
  if (topScores.length === 0) {
    listEl.innerHTML = '<li>Aún no hay puntajes</li>';
    return;
  }
  
  topScores.forEach((scoreObj, index) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>#${index + 1} <b>${scoreObj.name}</b></span> <span>${scoreObj.score} pts</span>`;
    listEl.appendChild(li);
  });
}

// Start
init();
