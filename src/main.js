import './style.css';
import { saveScore, getTopScores, createRoom, joinRoom, listenToRoom, updateRoomState, updateRoomGameData } from './firebase.js';

// --- Audio System (Web Audio API Synth) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playPopSound() {
  if (audioCtx.state === 'suspended') return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(380, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.08);
  gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}

function playFlipSound() {
  if (audioCtx.state === 'suspended') return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(450, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(750, audioCtx.currentTime + 0.08);
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
  osc.frequency.setValueAtTime(200, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(130, audioCtx.currentTime + 0.22);
  gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.22);
}

function playMergeSound(tier) {
  if (audioCtx.state === 'suspended') return;
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  const baseFreq = 320 + (tier * 30);
  
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, audioCtx.currentTime + 0.25);
  
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(baseFreq * 1.25, audioCtx.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(baseFreq * 2.0, audioCtx.currentTime + 0.25);
  
  gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
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
  bgmGain.gain.value = 0.035; 
  bgmGain.connect(audioCtx.destination);
  
  const chords = [
    [261.63, 329.63, 392.00, 493.88], // Cmaj7
    [220.00, 261.63, 329.63, 392.00], // Am7
    [293.66, 349.23, 440.00, 587.33], // Dm7
    [196.00, 246.94, 293.66, 392.00]  // G7
  ];
  let chordIdx = 0;
  
  bgmInterval = setInterval(() => {
    if (isGameOver) return;
    const currentChord = chords[chordIdx];
    
    currentChord.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.08); 
      
      const noteGain = audioCtx.createGain();
      noteGain.gain.setValueAtTime(0.04, audioCtx.currentTime + i * 0.08);
      noteGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.8);
      
      osc.connect(noteGain);
      noteGain.connect(bgmGain);
      
      osc.start(audioCtx.currentTime + i * 0.08);
      osc.stop(audioCtx.currentTime + 1.8);
    });
    
    chordIdx = (chordIdx + 1) % chords.length;
  }, 2600);
}

// --- Fruit Configuration (20 items for Level 2 support) ---
const FRUITS = [
  { name: "Arándano", color: '#4d4dff', emoji: '🫐', points: 10 },
  { name: "Cereza", color: '#ff4d4d', emoji: '🍒', points: 20 },
  { name: "Fresa", color: '#ff8888', emoji: '🍓', points: 30 },
  { name: "Uva", color: '#8a2be2', emoji: '🍇', points: 40 },
  { name: "Limón", color: '#fffacd', emoji: '🍋', points: 55 },
  { name: "Mandarina", color: '#ffa500', emoji: '🍊', points: 70 },
  { name: "Naranja", color: '#ff8c00', emoji: '🟠', points: 90 },
  { name: "Manzana", color: '#dc143c', emoji: '🍎', points: 110 },
  { name: "Durazno", color: '#ffb6c1', emoji: '🍑', points: 135 },
  { name: "Coco", color: '#ffffff', emoji: '🥥', points: 160 },
  { name: "Piña", color: '#ffe4b5', emoji: '🍍', points: 190 },
  { name: "Melón", color: '#90ee90', emoji: '🍈', points: 220 },
  { name: "Sandía", color: '#228b22', emoji: '🍉', points: 260 },
  { name: "Aguacate", color: '#a3e635', emoji: '🥑', points: 300 },
  { name: "Plátano", color: '#fef08a', emoji: '🍌', points: 340 },
  { name: "Kiwi", color: '#84cc16', emoji: '🥝', points: 385 },
  { name: "Hongo", color: '#f87171', emoji: '🍄', points: 430 },
  { name: "Flor", color: '#fbcfe8', emoji: '🌸', points: 480 },
  { name: "Estrella", color: '#fde047', emoji: '⭐️', points: 530 },
  { name: "Zanahoria", color: '#fb923c', emoji: '🥕', points: 590 }
];

// --- Game State Variables ---
let currentScore = 0;
let movesCount = 0;
let comboMultiplier = 1;
let isGameOver = false;
let isGameActive = false; // Prevents card grid from rebuilding on snapshot updates
let currentLevel = 1; // Level state (ranges 1 to 2)

// Card logic (Solo Mode)
let firstCard = null;
let secondCard = null;
let lockBoard = false;
let mismatchTimeout = null;

// Multiplayer State
let isMultiplayer = false;
let roomCode = null;
let isPlayer1 = false;
let unsubscribeRoom = null;
let activePairsLeft = 8; 
let currentRoomData = null;

// Spectator Sound States
let prevFlipped = [];
let prevMatchedCount = 0;

// DOM Elements
const scoreEl = document.getElementById('score');
const movesEl = document.getElementById('moves');
const comboEl = document.getElementById('combo');
const cardGrid = document.getElementById('card-grid');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const finalMovesEl = document.getElementById('final-moves');
const restartBtn = document.getElementById('restart-button');
const nextLevelBtn = document.getElementById('next-level-btn');
const uiHeader = document.getElementById('ui-header');
const turnIndicator = document.getElementById('turn-indicator');
const levelValEl = document.getElementById('level-val');

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
  setupInput();
  setupMultiplayerUI();
}

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
      
      const sharedDeck = generateRandomDeckForLevel(1);
      await updateRoomGameData(roomCode, { deck: sharedDeck, level: 1 });

      unsubscribeRoom = listenToRoom(roomCode, (data) => {
        if (data.status === 'playing') {
          if (!isGameActive) {
            startGame(data);
          } else {
            handleMultiplayerUpdates(data);
          }
        }
      });
    } else {
      alert("Error al crear sala.");
      createRoomBtn.innerText = 'Crear Sala';
      createRoomBtn.disabled = false;
    }
  });

  joinRoomBtn.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length !== 4) return alert("Código inválido");
    
    joinRoomBtn.innerText = 'Uniéndose...';
    joinRoomBtn.disabled = true;
    roomCode = code;
    isPlayer1 = false;
    isMultiplayer = true;
    
    const success = await joinRoom(code);
    if (success) {
      unsubscribeRoom = listenToRoom(roomCode, (data) => {
        if (data.status === 'playing' && data.deck) {
          if (!isGameActive) {
            startGame(data);
          } else {
            handleMultiplayerUpdates(data);
          }
        }
      });
    } else {
      alert("Sala no encontrada o llena.");
      joinRoomBtn.innerText = 'Unirse a Sala';
      joinRoomBtn.disabled = false;
    }
  });
}

function startGame(roomData = null) {
  if (isGameActive) return;
  isGameActive = true;
  
  if (audioCtx.state === 'suspended') audioCtx.resume();
  startScreen.classList.add('hidden');
  
  if (isMultiplayer) {
    opponentScoreContainer.classList.remove('hidden');
    uiHeader.classList.add('has-rival');
    turnIndicator.classList.remove('hidden');
  }

  resetGame(roomData);
}

function handleMultiplayerUpdates(data) {
  // If the deck changed, it means we transitioned to Level 2! Rebuild the grid.
  if (currentRoomData && data.deck && JSON.stringify(currentRoomData.deck) !== JSON.stringify(data.deck)) {
    currentRoomData = data;
    resetGame(data);
    return;
  }
  
  currentRoomData = data;
  
  // Update Level UI
  levelValEl.innerText = data.level || 1;
  
  const matchedIndices = data.matched || [];
  
  // Check if level has been completed (matched count equals total deck size)
  if (data.deck && matchedIndices.length === data.deck.length) {
    if (data.level < 2) {
      // Level 1 completed: show Level Complete modal
      showLevelCompleteModal(data.level);
      return;
    } else {
      // Level 2 completed: handle final tournament outcome
      if (data.status === 'player1_won') {
        if (isPlayer1) triggerWin(); else triggerLoss();
        return;
      }
      if (data.status === 'player2_won') {
        if (!isPlayer1) triggerWin(); else triggerLoss();
        return;
      }
      if (data.status === 'draw') {
        triggerDraw();
        return;
      }
    }
  }

  // Update scores
  const myScore = isPlayer1 ? data.player1.score : data.player2.score;
  const oppScore = isPlayer1 ? (data.player2 ? data.player2.score : 0) : data.player1.score;
  
  currentScore = myScore;
  scoreEl.innerText = myScore;
  opponentScoreEl.innerText = oppScore;

  // Turn Indicator
  const isMyTurn = (isPlayer1 && data.turn === 'player1') || (!isPlayer1 && data.turn === 'player2');
  if (isMyTurn) {
    turnIndicator.innerText = "🟢 Tu Turno";
    turnIndicator.className = "my-turn";
    lockBoard = false;
  } else {
    turnIndicator.innerText = "🔴 Turno del Rival";
    turnIndicator.className = "rival-turn";
    lockBoard = true;
  }

  // Synchronize cards
  const cards = Array.from(document.querySelectorAll('.card'));
  const flippedIndices = data.flipped || [];

  // Sound triggers: play flip sound when opponent flips a card
  flippedIndices.forEach(idx => {
    if (!prevFlipped.includes(idx)) {
      playFlipSound();
    }
  });
  prevFlipped = [...flippedIndices];

  // Sound triggers: play merge sound when opponent makes a match
  if (matchedIndices.length > prevMatchedCount) {
    const newlyMatchedIndex = matchedIndices[matchedIndices.length - 1];
    const tier = data.deck[newlyMatchedIndex];
    playMergeSound(tier);
    
    // Spawn particles on matched cards
    matchedIndices.forEach(idx => {
      const cardEl = cards.find(c => parseInt(c.dataset.index) === idx);
      if (cardEl && !cardEl.classList.contains('matched')) {
        createParticles(cardEl, FRUITS[tier].color);
      }
    });
    
    prevMatchedCount = matchedIndices.length;
  }

  // Apply visual classes
  cards.forEach(card => {
    const idx = parseInt(card.dataset.index);
    if (matchedIndices.includes(idx)) {
      card.classList.add('matched', 'flipped');
    } else if (flippedIndices.includes(idx)) {
      card.classList.add('flipped');
    } else {
      card.classList.remove('flipped', 'matched', 'shaking');
    }
  });
}

function resetGame(roomData = null) {
  isGameOver = false;
  firstCard = null;
  secondCard = null;
  lockBoard = false;
  prevFlipped = [];
  prevMatchedCount = 0;
  currentRoomData = roomData;
  
  if (mismatchTimeout) clearTimeout(mismatchTimeout);
  mismatchTimeout = null;

  gameOverScreen.classList.add('hidden');
  nextLevelBtn.classList.add('hidden');
  cardGrid.innerHTML = '';
  
  if (isMultiplayer && roomData) {
    // Multiplayer board setup
    currentLevel = roomData.level || 1;
    levelValEl.innerText = currentLevel;
    
    // 6x6 grid styling class
    if (currentLevel >= 2) {
      cardGrid.className = 'grid-6x6';
      activePairsLeft = 18;
    } else {
      cardGrid.className = '';
      activePairsLeft = 8;
    }
    
    buildGrid(roomData.deck);
    handleMultiplayerUpdates(roomData);
  } else {
    // Solo board setup
    levelValEl.innerText = currentLevel;
    
    if (currentLevel >= 2) {
      cardGrid.className = 'grid-6x6';
      activePairsLeft = 18;
    } else {
      cardGrid.className = '';
      activePairsLeft = 8;
    }
    
    const deck = generateRandomDeckForLevel(currentLevel);
    buildGrid(deck);
    
    turnIndicator.classList.add('hidden');
  }
  
  playPopSound();
  startBGM();
}

// Generate shuffled deck layout for a given level (8 pairs for L1, 18 pairs for L2)
function generateRandomDeckForLevel(level) {
  const numPairs = (level === 1) ? 8 : 18;
  const allTiers = Array.from({length: 20}, (_, i) => i);
  const selectedTiers = [];
  while (selectedTiers.length < numPairs) {
    const idx = Math.floor(Math.random() * allTiers.length);
    selectedTiers.push(allTiers.splice(idx, 1)[0]);
  }
  
  const deck = [...selectedTiers, ...selectedTiers];
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[j], deck[i]] = [deck[i], deck[j]];
  }
  return deck;
}

function buildGrid(deck) {
  deck.forEach((tier, index) => {
    const config = FRUITS[tier];
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.tier = tier;
    card.dataset.index = index;
    
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-front">?</div>
        <div class="card-back fruit-bg" style="--fruit-color: ${config.color};">
          <div class="kawaii-face">
            <svg width="100%" height="100%" viewBox="0 0 100 100" style="position: absolute; top:0; left:0; width:100%; height:100%;">
              <circle cx="28" cy="28" r="6" fill="rgba(255, 255, 255, 0.45)" />
              <text x="50" y="52" font-size="58" text-anchor="middle" dominant-baseline="middle" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.15))">${config.emoji}</text>
              <circle cx="34" cy="48" r="5" fill="#4a2511" />
              <circle cx="66" cy="48" r="5" fill="#4a2511" />
              <circle cx="26" cy="55" r="9" fill="rgba(255, 120, 150, 0.45)" />
              <circle cx="74" cy="55" r="9" fill="rgba(255, 120, 150, 0.45)" />
              <path d="M 44 55 Q 50 60 56 55" stroke="#4a2511" stroke-width="3.5" stroke-linecap="round" fill="none" />
            </svg>
          </div>
        </div>
      </div>
    `;
    
    card.addEventListener('click', () => handleCardClick(card));
    cardGrid.appendChild(card);
  });
}

// --- Card Flip & Matching Mechanics ---
function handleCardClick(card) {
  if (isGameOver || lockBoard) return;
  
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const idx = parseInt(card.dataset.index);

  if (isMultiplayer) {
    // --- MULTIPLAYER TURN-BASED SHARING BOARD LOGIC ---
    if (!currentRoomData) return;
    
    const flipped = currentRoomData.flipped || [];
    const matched = currentRoomData.matched || [];
    
    if (flipped.includes(idx) || matched.includes(idx)) return;
    
    lockBoard = true; 
    
    if (flipped.length === 0) {
      playFlipSound();
      updateRoomGameData(roomCode, { flipped: [idx] });
    } else if (flipped.length === 1) {
      const firstIdx = flipped[0];
      const secondIdx = idx;
      
      playFlipSound();
      updateRoomGameData(roomCode, { flipped: [firstIdx, secondIdx] });
      
      const deck = currentRoomData.deck;
      if (deck[firstIdx] === deck[secondIdx]) {
        // Match!
        const tier = deck[firstIdx];
        setTimeout(async () => {
          const newMatched = [...matched, firstIdx, secondIdx];
          
          const fieldPrefix = isPlayer1 ? 'player1' : 'player2';
          const myCurrentScore = isPlayer1 ? currentRoomData.player1.score : currentRoomData.player2.score;
          const newScore = myCurrentScore + FRUITS[tier].points;
          
          const updates = {
            flipped: [],
            matched: newMatched
          };
          updates[`${fieldPrefix}.score`] = newScore;
          
          // Check win condition (all cards matched)
          if (newMatched.length === deck.length) {
            if (currentRoomData.level === 2) {
              // Final tournament level completed: declare winner
              const oppScore = isPlayer1 ? currentRoomData.player2.score : currentRoomData.player1.score;
              if (newScore > oppScore) {
                updates.status = isPlayer1 ? 'player1_won' : 'player2_won';
              } else if (newScore < oppScore) {
                updates.status = isPlayer1 ? 'player2_won' : 'player1_won';
              } else {
                updates.status = 'draw';
              }
            }
          }
          
          await updateRoomGameData(roomCode, updates);
          lockBoard = false;
        }, 600);
      } else {
        // Mismatch!
        setTimeout(async () => {
          const firstCardEl = document.querySelector(`.card[data-index="${firstIdx}"]`);
          const secondCardEl = document.querySelector(`.card[data-index="${secondIdx}"]`);
          if (firstCardEl) firstCardEl.classList.add('shaking');
          if (secondCardEl) secondCardEl.classList.add('shaking');
          
          playMismatchSound();
          
          setTimeout(async () => {
            const nextTurn = currentRoomData.turn === 'player1' ? 'player2' : 'player1';
            await updateRoomGameData(roomCode, {
              flipped: [],
              turn: nextTurn
            });
            lockBoard = false;
          }, 800);
        }, 800);
      }
    }
  } else {
    // --- SOLO MODE LOCAL LOGIC ---
    if (card.classList.contains('flipped') || card.classList.contains('matched')) return;

    if (mismatchTimeout) {
      clearTimeout(mismatchTimeout);
      mismatchTimeout = null;
      if (firstCard) firstCard.classList.remove('flipped', 'shaking');
      if (secondCard) secondCard.classList.remove('flipped', 'shaking');
      firstCard = null;
      secondCard = null;
      lockBoard = false;
    }

    card.classList.add('flipped');
    playFlipSound();

    if (!firstCard) {
      firstCard = card;
    } else if (!secondCard) {
      secondCard = card;
      movesCount++;
      movesEl.innerText = movesCount;
      
      if (firstCard.dataset.tier === secondCard.dataset.tier) {
        // Match!
        lockBoard = true;
        const tier = parseInt(firstCard.dataset.tier);
        const c1 = firstCard;
        const c2 = secondCard;
        
        setTimeout(() => {
          c1.classList.add('matched');
          c2.classList.add('matched');
          
          createParticles(c1, FRUITS[tier].color);
          createParticles(c2, FRUITS[tier].color);
          
          currentScore += FRUITS[tier].points * comboMultiplier;
          scoreEl.innerText = currentScore;
          
          playMergeSound(tier);
          
          comboMultiplier++;
          comboEl.innerText = `x${comboMultiplier}`;
          
          activePairsLeft--;
          if (activePairsLeft === 0) {
            if (currentLevel < 2) {
              showLevelCompleteModal(currentLevel);
            } else {
              triggerGameWin();
            }
          }
          
          firstCard = null;
          secondCard = null;
          lockBoard = false;
        }, 450);
      } else {
        // Mismatch
        lockBoard = true;
        firstCard.classList.add('shaking');
        secondCard.classList.add('shaking');
        
        mismatchTimeout = setTimeout(() => {
          playMismatchSound();
          firstCard.classList.remove('flipped', 'shaking');
          secondCard.classList.remove('flipped', 'shaking');
          
          comboMultiplier = 1;
          comboEl.innerText = "x1";
          
          firstCard = null;
          secondCard = null;
          lockBoard = false;
          mismatchTimeout = null;
        }, 1000);
      }
    }
  }
}

// --- CSS Particle Explosion ---
function createParticles(element, color) {
  const rect = element.getBoundingClientRect();
  const containerRect = document.getElementById('game-container').getBoundingClientRect();
  
  const x = rect.left - containerRect.left + rect.width / 2;
  const y = rect.top - containerRect.top + rect.height / 2;
  
  const count = 12;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.style.position = 'absolute';
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.width = `${Math.random() * 5 + 6}px`;
    p.style.height = p.style.width;
    p.style.borderRadius = '50%';
    p.style.backgroundColor = color;
    p.style.pointerEvents = 'none';
    p.style.zIndex = '50';
    p.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    p.style.transition = 'transform 0.75s cubic-bezier(0.1, 0.8, 0.35, 1), opacity 0.75s ease';
    
    document.getElementById('game-container').appendChild(p);
    
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 45 + 30;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    
    p.offsetHeight; // Force reflow
    
    p.style.transform = `translate(${tx}px, ${ty}px) scale(0)`;
    p.style.opacity = '0';
    
    setTimeout(() => {
      p.remove();
    }, 750);
  }
}

// --- CSS Confetti win effect ---
function triggerConfetti() {
  const container = document.getElementById('game-container');
  const colors = ['#ff60ad', '#8b5cf6', '#ffa500', '#4d4dff', '#ff4d4d', '#228b22'];
  
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.style.position = 'absolute';
    confetti.style.width = `${Math.random() * 6 + 6}px`;
    confetti.style.height = `${Math.random() * 4 + 8}px`;
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.top = `-20px`;
    confetti.style.opacity = '1';
    confetti.style.zIndex = '90';
    confetti.style.pointerEvents = 'none';
    confetti.style.borderRadius = '2px';
    confetti.style.transition = 'transform 2.5s linear, opacity 2.5s ease-out';
    
    container.appendChild(confetti);
    
    const drift = Math.random() * 160 - 80;
    const spin = Math.random() * 720 - 360;
    const fall = container.clientHeight + 40;
    
    confetti.offsetHeight; // Force reflow
    
    confetti.style.transform = `translate(${drift}px, ${fall}px) rotate(${spin}deg)`;
    confetti.style.opacity = '0';
    
    setTimeout(() => {
      confetti.remove();
    }, 2500);
  }
}

// --- Intermediate Level Completion Modal ---
function showLevelCompleteModal(level) {
  isGameOver = true;
  document.getElementById('game-over-title').innerText = "¡Nivel Completado! 🎉";
  finalScoreEl.innerText = currentScore;
  finalMovesEl.innerText = movesCount;
  
  // Hide submit score (only allowed after final victory)
  document.getElementById('submit-score-section').style.display = 'none';
  
  // Show Next Level button
  nextLevelBtn.classList.remove('hidden');
  nextLevelBtn.innerText = `Jugar Nivel ${level + 1}`;
  restartBtn.innerText = 'Salir al Menú';
  
  gameOverScreen.classList.remove('hidden');
}

async function progressMultiplayerLevel() {
  if (!currentRoomData) return;
  
  const nextLevel = currentRoomData.level + 1;
  const sharedDeck = generateRandomDeckForLevel(nextLevel);
  
  const updates = {
    level: nextLevel,
    deck: sharedDeck,
    flipped: [],
    matched: [],
    status: 'playing'
  };
  
  await updateRoomGameData(roomCode, updates);
}

// --- Final Tournament GameOver states ---
function triggerGameWin() {
  if (isGameOver) return;
  isGameOver = true;
  isGameActive = false;
  currentLevel = 1; // Reset level for next new game
  
  triggerConfetti();
  
  document.getElementById('game-over-title').innerText = "¡Victoria Total! 🏆";
  finalScoreEl.innerText = currentScore;
  finalMovesEl.innerText = movesCount;
  
  document.getElementById('submit-score-section').style.display = 'flex';
  document.getElementById('player-name').value = '';
  const submitBtn = document.getElementById('submit-score-btn');
  submitBtn.disabled = false;
  submitBtn.innerText = 'Guardar Puntaje';
  
  nextLevelBtn.classList.add('hidden');
  restartBtn.innerText = 'Volver al Menú';
  
  gameOverScreen.classList.remove('hidden');
  loadLeaderboard();

  if (isMultiplayer) {
    if (unsubscribeRoom) {
      unsubscribeRoom();
      unsubscribeRoom = null;
    }
  }
}

function triggerLoss() {
  if (isGameOver) return;
  isGameOver = true;
  isGameActive = false;
  currentLevel = 1;
  
  document.getElementById('game-over-title').innerText = "¡Derrota! 😢";
  finalScoreEl.innerText = currentScore;
  finalMovesEl.innerText = movesCount;
  
  document.getElementById('submit-score-section').style.display = 'flex';
  document.getElementById('player-name').value = '';
  const submitBtn = document.getElementById('submit-score-btn');
  submitBtn.disabled = false;
  submitBtn.innerText = 'Guardar Puntaje';
  
  nextLevelBtn.classList.add('hidden');
  restartBtn.innerText = 'Volver al Menú';
  
  gameOverScreen.classList.remove('hidden');
  loadLeaderboard();

  if (isMultiplayer && unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
}

function triggerDraw() {
  if (isGameOver) return;
  isGameOver = true;
  isGameActive = false;
  currentLevel = 1;
  
  document.getElementById('game-over-title').innerText = "¡Empate! 🤝";
  finalScoreEl.innerText = currentScore;
  finalMovesEl.innerText = movesCount;
  
  document.getElementById('submit-score-section').style.display = 'flex';
  document.getElementById('player-name').value = '';
  const submitBtn = document.getElementById('submit-score-btn');
  submitBtn.disabled = false;
  submitBtn.innerText = 'Guardar Puntaje';
  
  nextLevelBtn.classList.add('hidden');
  restartBtn.innerText = 'Volver al Menú';
  
  gameOverScreen.classList.remove('hidden');
  loadLeaderboard();

  if (isMultiplayer && unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
}

function triggerWin() {
  triggerGameWin();
}

async function loadLeaderboard() {
  const listEl = document.getElementById('leaderboard-list');
  listEl.innerHTML = '<li>Cargando...</li>';
  
  const topScores = await getTopScores(5);
  listEl.innerHTML = '';
  
  if (topScores.length === 0) {
    listEl.innerHTML = '<li>Sin marcas registradas</li>';
    return;
  }
  
  topScores.forEach((scoreObj, index) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>#${index + 1} <b>${scoreObj.name}</b></span> <span>${scoreObj.score} pts</span>`;
    listEl.appendChild(li);
  });
}

function setupInput() {
  restartBtn.addEventListener('click', () => {
    window.location.reload(); 
  });
  
  nextLevelBtn.addEventListener('click', () => {
    if (!isMultiplayer) {
      currentLevel++;
      resetGame();
    } else {
      progressMultiplayerLevel();
    }
  });
  
  document.getElementById('submit-score-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('player-name');
    const btn = document.getElementById('submit-score-btn');
    const name = nameInput.value.trim();
    
    if (!name) return alert('Ingresa tu nombre');
    
    btn.disabled = true;
    btn.innerText = 'Guardando...';
    
    const success = await saveScore(name, currentScore);
    if (success) {
      document.getElementById('submit-score-section').style.display = 'none';
      await loadLeaderboard();
    } else {
      alert('Error de red al guardar.');
      btn.disabled = false;
      btn.innerText = 'Guardar Puntaje';
    }
  });
}

// Start
init();
