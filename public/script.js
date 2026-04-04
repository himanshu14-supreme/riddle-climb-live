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
    if (id) enterWaitingRoom(id);
}

function enterWaitingRoom(id) {
    currentRoomId = id;
    document.getElementById('lobby').style.display = 'none';
    const waitingRoom = document.getElementById('waiting-room');
    waitingRoom.style.display = 'block';
    waitingRoom.classList.remove('hidden');
    document.getElementById('wait-room-id').innerText = `ROOM ID: ${id}`;
    socket.emit('joinRoom', { roomId: id, playerName: myName });
}

socket.on('playerCountUpdate', (data) => {
    document.getElementById('player-count-text').innerText = `Players Joined: ${data.count}/2`;
    const list = document.getElementById('player-list');
    list.innerHTML = data.players.map(p => `<li>✅ ${p.name}</li>`).join('');
    data.players.forEach((p, index) => {
        if (p.id === socket.id) myPlayerNumber = index + 1;
    });
    if (data.count >= 2) document.getElementById('start-game-btn').disabled = false;
});

function requestStart() {
    socket.emit('startGameSignal', currentRoomId);
}

socket.on('initGame', (players) => {
    playerNames[1] = players[0].name;
    playerNames[2] = players[1].name;
    document.getElementById('waiting-room').style.display = 'none';
    const gameScreen = document.getElementById('game-screen');
    gameScreen.style.display = 'block';
    gameScreen.classList.remove('hidden');
    generateBoard();
    updateUI();
    syncStatus();
});

function generateBoard() {
    const board = document.getElementById('board');
    if (!board || board.children.length > 2) return; 
    for (let i = 1; i <= 100; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (traps.includes(i)) cell.classList.add('trap');
        if (boosts.includes(i)) cell.classList.add('boost');
        cell.id = 'cell-' + i;
        cell.innerText = i;
        board.appendChild(cell);
    }
}

// --- 2. GAMEPLAY LOGIC ---

async function playTurn() {
    if (officialTurn !== myPlayerNumber) return;
    const btn = document.getElementById('roll-btn');
    btn.disabled = true;
    btn.innerText = "Loading...";

    try {
        const response = await fetch('/api/riddle');
        const riddle = await response.json();
        isStealAttempt = false;
        activeAnsweringPlayer = officialTurn;
        showModal(riddle);
    } catch (e) {
        console.error("DB Error", e);
        syncStatus();
    }
}

function syncStatus() {
    const statusText = document.getElementById('status');
    const rollBtn = document.getElementById('roll-btn');
    statusText.innerText = `${playerNames[officialTurn]}'s Turn`;
    statusText.style.color = (officialTurn === 1) ? "#e74c3c" : "#3498db";
    rollBtn.disabled = (officialTurn !== myPlayerNumber);
    rollBtn.innerText = (officialTurn === myPlayerNumber) ? "Roll for Riddle" : "Wait for turn";
}

function showModal(riddle) {
    const modal = document.getElementById('riddle-modal');
    const modalContent = document.querySelector('.modal-content');
    const box = document.getElementById('options-box');
    modalContent.style.backgroundColor = 'white';
    
    box.innerHTML = '';
    
    // Check if I am the one supposed to answer
    if (myPlayerNumber === activeAnsweringPlayer) {
        document.getElementById('modal-title').innerText = isStealAttempt ? "✨ YOUR STEAL ATTEMPT! ✨" : "Your Riddle";
        const options = [riddle.option_a, riddle.option_b, riddle.option_c, riddle.option_d];
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerText = opt;
            btn.onclick = () => checkAnswer(opt, riddle.answer, riddle);
            box.appendChild(btn);
        });
    } else {
        // If I am NOT the answering player (The original player watching the steal)
        document.getElementById('modal-title').innerText = `Waiting for ${playerNames[activeAnsweringPlayer]} to steal...`;
        const msg = document.createElement('p');
        msg.innerText = "They are attempting to steal your progress!";
        msg.style.color = "#333";
        box.appendChild(msg);
    }

    document.getElementById('riddle-text').innerText = riddle.question;
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
        let move = (timeSpent <= 10) ? 3 : (timeSpent <= 15) ? 2 : 1;
        positions[activeAnsweringPlayer] = Math.max(1, positions[activeAnsweringPlayer] - move);
        if (boosts.includes(positions[activeAnsweringPlayer])) {
            positions[activeAnsweringPlayer] = Math.max(1, positions[activeAnsweringPlayer] - 4);
        }
        finishTurn();
    } else {
        handleFailure(riddleData);
    }
}

function handleFailure(riddleData) {
    const modalContent = document.querySelector('.modal-content');
    modalContent.style.backgroundColor = '#ff7675'; 
    
    setTimeout(() => {
        if (!isStealAttempt) {
            // Apply trap penalty to current player
            if (traps.includes(positions[officialTurn])) {
                positions[officialTurn] = Math.min(100, positions[officialTurn] + 5);
            }
            
            isStealAttempt = true;
            activeAnsweringPlayer = (officialTurn === 1) ? 2 : 1;

            // Trigger Steal UI for the other player
            socket.emit('triggerSteal', {
                roomId: currentRoomId,
                riddle: riddleData,
                stealer: activeAnsweringPlayer
            });

            showModal(riddleData);
        } else {
            // Steal failed, just end the attempt
            finishTurn();
        }
    }, 600);
}

socket.on('receiveSteal', (data) => {
    isStealAttempt = true;
    activeAnsweringPlayer = data.stealer;
    showModal(data.riddle);
});

function finishTurn() {
    document.getElementById('riddle-modal').style.display = 'none';
    
    // LOGIC FIX: Only switch officialTurn if this was NOT a steal attempt
    if (!isStealAttempt) {
        officialTurn = (officialTurn === 1) ? 2 : 1;
    }
    
    // Reset steal flag for next turn
    isStealAttempt = false;

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
            p.style.left = target.offsetLeft + (num === 1 ? 5 : 20) + 'px';
            p.style.top = target.offsetTop + (num === 1 ? 5 : 20) + 'px';
        }
    });
}

socket.on('updateBoard', (data) => {
    positions = data.positions;
    officialTurn = data.nextTurn;
    isStealAttempt = false; // Ensure steal is reset when move arrives
    document.getElementById('riddle-modal').style.display = 'none';
    updateUI();
    syncStatus();
});
