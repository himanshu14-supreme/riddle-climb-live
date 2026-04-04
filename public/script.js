const socket = io();

// Identity & Game State
let myName = "";
let myPlayerNumber = null; 
let playerNames = { 1: "Player 1", 2: "Player 2" };
let currentRoomId = null;
let positions = { 1: 100, 2: 100 };
let officialTurn = 1;
let activeAnsweringPlayer = 1;
let isStealAttempt = false;

// Timer State
let timerInterval;
let timeLeft = 20;
let timeSpent = 0;

// Board Configuration
const traps = [15, 32, 48, 62, 85, 94];   
const boosts = [10, 25, 42, 58, 75, 88];  

// --- 1. LOBBY & ROOM LOGIC ---

function createRoom() {
    myName = document.getElementById('player-name-input').value.trim() || "Guest";
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    enterWaitingRoom(id);
}

function joinRoom() {
    myName = document.getElementById('player-name-input').value.trim() || "Guest";
    const id = document.getElementById('room-input').value.trim().toUpperCase();
    if (id) {
        enterWaitingRoom(id);
    } else {
        alert("Please enter a Room ID");
    }
}

function enterWaitingRoom(id) {
    currentRoomId = id;
    
    // Switch UI Screens
    document.getElementById('lobby').style.display = 'none';
    const waitingRoom = document.getElementById('waiting-room');
    waitingRoom.style.display = 'block';
    waitingRoom.classList.remove('hidden');
    
    document.getElementById('wait-room-id').innerText = `ROOM ID: ${id}`;
    
    // Inform server
    socket.emit('joinRoom', { roomId: id, playerName: myName });
}

socket.on('playerCountUpdate', (data) => {
    document.getElementById('player-count-text').innerText = `Players Joined: ${data.count}/2`;
    
    // Update the list of names in the waiting room
    const list = document.getElementById('player-list');
    list.innerHTML = data.players.map(p => `<li>✅ ${p.name}</li>`).join('');

    // Determine if I am Player 1 or Player 2
    data.players.forEach((p, index) => {
        if (p.id === socket.id) myPlayerNumber = index + 1;
    });

    // Enable Start button only if 2 players are present
    if (data.count >= 2) {
        document.getElementById('start-game-btn').disabled = false;
    }
});

function requestStart() {
    socket.emit('startGameSignal', currentRoomId);
}

socket.on('initGame', (players) => {
    // Store final names assigned by server
    playerNames[1] = players[0].name;
    playerNames[2] = players[1].name;

    // Switch to Game Screen
    document.getElementById('waiting-room').style.display = 'none';
    const gameScreen = document.getElementById('game-screen');
    gameScreen.style.display = 'block';
    gameScreen.classList.remove('hidden');
    
    document.getElementById('room-display').innerText = `Room: ${currentRoomId} | You: ${myName}`;
    
    updateUI();
    syncStatus();
});

// --- 2. BOARD GENERATION ---

const board = document.getElementById('board');
for (let i = 1; i <= 100; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (traps.includes(i)) cell.classList.add('trap');
    if (boosts.includes(i)) cell.classList.add('boost');
    cell.id = 'cell-' + i;
    cell.innerText = i;
    board.appendChild(cell);
}

// --- 3. GAMEPLAY LOGIC ---

async function playTurn() {
    // UI Guard: Stop clicks if it's not your turn
    if (officialTurn !== myPlayerNumber) return;

    const btn = document.getElementById('roll-btn');
    btn.disabled = true;
    btn.innerText = "Loading Riddle...";

    try {
        const response = await fetch('/api/riddle');
        const riddle = await response.json();
        
        isStealAttempt = false;
        activeAnsweringPlayer = officialTurn;
        showModal(riddle);
    } catch (e) {
        console.error("Fetch error:", e);
        syncStatus(); // Reset button text/state
    }
}

function syncStatus() {
    const statusText = document.getElementById('status');
    const rollBtn = document.getElementById('roll-btn');

    statusText.innerText = `${playerNames[officialTurn]}'s Turn`;
    statusText.style.color = (officialTurn === 1) ? "#e74c3c" : "#3498db";

    // Handle Button Lock/Appearance
    if (officialTurn === myPlayerNumber) {
        rollBtn.disabled = false;
        rollBtn.innerText = "Roll for Riddle";
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "Wait for your turn";
    }
}

function showModal(riddle) {
    const modal = document.getElementById('riddle-modal');
    const title = document.getElementById('modal-title');
    const riddleText = document.getElementById('riddle-text');
    const box = document.getElementById('options-box');

    title.innerText = isStealAttempt ? `✨ STEAL! (${playerNames[activeAnsweringPlayer]}) ✨` : `${playerNames[activeAnsweringPlayer]}'s Riddle`;
    riddleText.innerText = riddle.question;
    box.innerHTML = '';

    const options = [
        {text: riddle.option_a}, {text: riddle.option_b}, 
        {text: riddle.option_c}, {text: riddle.option_d}
    ];

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt.text;
        
        btn.onclick = () => {
            // Only the person whose riddle it is can click
            if (myPlayerNumber === activeAnsweringPlayer) {
                checkAnswer(opt.text, riddle.answer, riddle);
            }
        };
        box.appendChild(btn);
    });

    // Reset and Start Timer
    timeLeft = 20;
    timeSpent = 0;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        timeSpent++;
        document.getElementById('timer-display').innerText = `Time Left: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleFailure(riddle);
        }
    }, 1000);

    modal.style.display = 'block';
}

function checkAnswer(selected, correct, riddleData) {
    clearInterval(timerInterval);
    if (selected === correct) {
        // Speed Scoring
        let moveAmount = (timeSpent <= 10) ? 3 : (timeSpent <= 15) ? 2 : 1;
        positions[activeAnsweringPlayer] = Math.max(1, positions[activeAnsweringPlayer] - moveAmount);
        
        // Boost check
        if (boosts.includes(positions[activeAnsweringPlayer])) {
            positions[activeAnsweringPlayer] = Math.max(1, positions[activeAnsweringPlayer] - 4);
        }
        finishTurn();
    } else {
        handleFailure(riddleData);
    }
}

function handleFailure(riddleData) {
    if (!isStealAttempt) {
        // If the main player fails and they are on a trap, they go back
        if (traps.includes(positions[officialTurn])) {
            positions[officialTurn] = Math.min(100, positions[officialTurn] + 5);
        }
        
        // Trigger Steal
        isStealAttempt = true;
        activeAnsweringPlayer = (officialTurn === 1) ? 2 : 1;
        showModal(riddleData);
    } else {
        // Steal failed, just end turn
        finishTurn();
    }
}

function finishTurn() {
    document.getElementById('riddle-modal').style.display = 'none';
    officialTurn = (officialTurn === 1) ? 2 : 1;

    // Send the final positions to the server
    socket.emit('playerMove', { 
        roomId: currentRoomId, 
        positions: positions, 
        nextTurn: officialTurn 
    });

    updateUI();
    syncStatus();
}

function updateUI() {
    [1, 2].forEach(num => {
        const target = document.getElementById('cell-' + positions[num]);
        const p = document.getElementById('player' + num);
        if (target && p) {
            // Slight offset so markers aren't perfectly overlapping
            p.style.left = target.offsetLeft + (num === 1 ? 5 : 20) + 'px';
            p.style.top = target.offsetTop + (num === 1 ? 5 : 20) + 'px';
        }
    });
}

// Receive move updates from other players
socket.on('updateBoard', (data) => {
    positions = data.positions;
    officialTurn = data.nextTurn;
    updateUI();
    syncStatus();
});
