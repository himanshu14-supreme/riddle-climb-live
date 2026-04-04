const socket = io();

// Identity State
let myName = "";
let myPlayerNumber = null; // Will be 1 or 2
let playerNames = { 1: "Player 1", 2: "Player 2" };

// Game State
let currentRoomId = null;
let positions = { 1: 100, 2: 100 };
let officialTurn = 1;
let activeAnsweringPlayer = 1;
let isStealAttempt = false;

// Timer
let timerInterval;
let timeLeft = 20;
let timeSpent = 0;

const traps = [15, 32, 48, 62, 85, 94];   
const boosts = [10, 25, 42, 58, 75, 88];  

// --- LOBBY LOGIC ---
function createRoom() {
    myName = document.getElementById('player-name-input').value.trim() || "Anonymous";
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    enterWaitingRoom(id);
}

function joinRoom() {
    myName = document.getElementById('player-name-input').value.trim() || "Anonymous";
    const id = document.getElementById('room-input').value.trim().toUpperCase();
    if (id) enterWaitingRoom(id);
}

function enterWaitingRoom(id) {
    currentRoomId = id;
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('waiting-room').style.display = 'block';
    document.getElementById('wait-room-id').innerText = `ROOM ID: ${id}`;
    socket.emit('joinRoom', { roomId: id, playerName: myName });
}

socket.on('playerCountUpdate', (data) => {
    document.getElementById('player-count-text').innerText = `Players Joined: ${data.count}/2`;
    
    // Show names in waiting room
    const list = document.getElementById('player-list');
    list.innerHTML = data.players.map(p => `<li>✅ ${p.name}</li>`).join('');

    // Assign my player number based on socket ID
    data.players.forEach((p, index) => {
        if (p.id === socket.id) myPlayerNumber = index + 1;
    });

    if (data.count >= 2) {
        document.getElementById('start-game-btn').disabled = false;
    }
});

function requestStart() {
    socket.emit('startGameSignal', currentRoomId);
}

socket.on('initGame', (players) => {
    // Store final names
    playerNames[1] = players[0].name;
    playerNames[2] = players[1].name;

    document.getElementById('waiting-room').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    document.getElementById('room-display').innerText = `Room: ${currentRoomId} | You are: ${myName}`;
    updateUI();
    syncStatus();
});

// --- BOARD GENERATION ---
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

// --- GAMEPLAY ---
async function playTurn() {
    // SECURITY: Block if it's not your turn
    if (officialTurn !== myPlayerNumber) {
        alert(`Wait for your turn! It's currently ${playerNames[officialTurn]}'s turn.`);
        return;
    }

    const btn = document.getElementById('roll-btn');
    btn.disabled = true;

    try {
        const response = await fetch('/api/riddle');
        const riddle = await response.json();
        isStealAttempt = false;
        activeAnsweringPlayer = officialTurn;
        showModal(riddle);
    } catch (e) {
        btn.disabled = false;
    }
}

function showModal(riddle) {
    const modalTitle = isStealAttempt ? `✨ STEAL! (${playerNames[activeAnsweringPlayer]}) ✨` : `${playerNames[activeAnsweringPlayer]}'s Riddle`;
    document.getElementById('modal-title').innerText = modalTitle;
    document.getElementById('riddle-text').innerText = riddle.question;
    const box = document.getElementById('options-box');
    box.innerHTML = '';

    const options = [{text: riddle.option_a}, {text: riddle.option_b}, {text: riddle.option_c}, {text: riddle.option_d}];
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt.text;
        
        // Only the active player can click answers
        btn.onclick = () => {
            if (myPlayerNumber === activeAnsweringPlayer) {
                checkAnswer(opt.text, riddle.answer, riddle);
            } else {
                alert("Only the active player can answer!");
            }
        };
        box.appendChild(btn);
    });

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
    document.getElementById('riddle-modal').style.display = 'block';
}

function checkAnswer(selected, correct, riddleData) {
    clearInterval(timerInterval);
    if (selected === correct) {
        let moveAmount = (timeSpent <= 10) ? 3 : (timeSpent <= 15) ? 2 : 1;
        positions[activeAnsweringPlayer] = Math.max(1, positions[activeAnsweringPlayer] - moveAmount);
        if (boosts.includes(positions[activeAnsweringPlayer])) positions[activeAnsweringPlayer] -= 4;
        finishTurn();
    } else {
        handleFailure(riddleData);
    }
}

function handleFailure(riddleData) {
    if (!isStealAttempt) {
        if (traps.includes(positions[officialTurn])) positions[officialTurn] += 5;
        isStealAttempt = true;
        activeAnsweringPlayer = (officialTurn === 1) ? 2 : 1;
        showModal(riddleData);
    } else {
        finishTurn();
    }
}

function finishTurn() {
    document.getElementById('riddle-modal').style.display = 'none';
    officialTurn = (officialTurn === 1) ? 2 : 1;
    socket.emit('playerMove', { roomId: currentRoomId, positions: positions, nextTurn: officialTurn });
    updateUI();
    syncStatus();
    document.getElementById('roll-btn').disabled = false;
}

function updateUI() {
    [1, 2].forEach(num => {
        const target = document.getElementById('cell-' + positions[num]);
        const p = document.getElementById('player' + num);
        if (target && p) {
            p.style.left = target.offsetLeft + (num === 1 ? 5 : 20) + 'px';
            p.style.top = target.offsetTop + (num === 1 ? 5 : 20) + 'px';
        }
    });
}

function syncStatus() {
    const s = document.getElementById('status');
    s.innerText = `${playerNames[officialTurn]}'s Turn`;
    s.style.color = (officialTurn === 1) ? "#e74c3c" : "#3498db";
}

socket.on('updateBoard', (data) => {
    positions = data.positions;
    officialTurn = data.nextTurn;
    updateUI();
    syncStatus();
});
