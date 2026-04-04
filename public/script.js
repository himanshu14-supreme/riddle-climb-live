const socket = io();

// Game State
let currentRoomId = null;
let positions = { 1: 100, 2: 100 };
let officialTurn = 1;
let activeAnsweringPlayer = 1;
let isStealAttempt = false;

// Timer State
let timerInterval;
let timeLeft = 20;
let timeSpent = 0;

// Config
const traps = [15, 32, 48, 62, 85, 94];   
const boosts = [10, 25, 42, 58, 75, 88];  

const board = document.getElementById('board');
const modal = document.getElementById('riddle-modal');
const modalContent = document.querySelector('.modal-content');
const statusText = document.getElementById('status');
const timerDisplay = document.getElementById('timer-display');

// LOBBY FUNCTIONS
function createRoom() {
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    enterGame(randomId);
}

function joinRoom() {
    const id = document.getElementById('room-input').value.trim().toUpperCase();
    if (id) enterGame(id);
    else alert("Please enter a Room ID");
}

function enterGame(roomId) {
    currentRoomId = roomId;
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    document.getElementById('room-display').innerText = `ROOM ID: ${roomId}`;
    
    socket.emit('joinRoom', roomId);
    syncStatus();
}

// BOARD GENERATION
for (let i = 1; i <= 100; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (traps.includes(i)) cell.classList.add('trap');
    if (boosts.includes(i)) cell.classList.add('boost');
    cell.id = 'cell-' + i;
    cell.innerText = i;
    board.appendChild(cell);
}

function updateUI() {
    [1, 2].forEach(num => {
        const target = document.getElementById('cell-' + positions[num]);
        const p = document.getElementById('player' + num);
        if (target && p) {
            p.style.left = (target.offsetLeft + (num === 1 ? 5 : 25)) + 'px';
            p.style.top = (target.offsetTop + (num === 1 ? 5 : 25)) + 'px';
        }
    });
}
window.onload = updateUI;

socket.on('updateBoard', (data) => {
    positions = data.positions;
    officialTurn = data.nextTurn;
    updateUI();
    syncStatus();
});

async function playTurn() {
    document.getElementById('roll-btn').disabled = true;
    try {
        const response = await fetch('/api/riddle');
        const riddle = await response.json();
        isStealAttempt = false;
        activeAnsweringPlayer = officialTurn;
        showModal(riddle);
    } catch (e) {
        alert("Database Error!");
        document.getElementById('roll-btn').disabled = false;
    }
}

function showModal(riddle) {
    document.getElementById('modal-title').innerText = isStealAttempt ? "✨ STEAL ATTEMPT! ✨" : `Player ${activeAnsweringPlayer}'s Riddle`;
    document.getElementById('riddle-text').innerText = riddle.question;
    const box = document.getElementById('options-box');
    box.innerHTML = '';

    const options = [{text: riddle.option_a}, {text: riddle.option_b}, {text: riddle.option_c}, {text: riddle.option_d}];
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt.text;
        btn.onclick = () => checkAnswer(opt.text, riddle.answer, riddle);
        box.appendChild(btn);
    });

    timeLeft = 20;
    timeSpent = 0;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        timeSpent++;
        timerDisplay.innerText = `Time Left: ${timeLeft}s`;
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
        modalContent.classList.add('correct-flash');
        let moveAmount = (timeSpent <= 10) ? 3 : (timeSpent <= 15) ? 2 : 1;
        positions[activeAnsweringPlayer] = Math.max(1, positions[activeAnsweringPlayer] - moveAmount);
        
        if (boosts.includes(positions[activeAnsweringPlayer])) {
            positions[activeAnsweringPlayer] = Math.max(1, positions[activeAnsweringPlayer] - 4);
        }
        setTimeout(finishTurn, 800);
    } else {
        handleFailure(riddleData);
    }
}

function handleFailure(riddleData) {
    modalContent.classList.add('wrong-flash');
    setTimeout(() => {
        modalContent.classList.remove('wrong-flash');
        if (!isStealAttempt) {
            if (traps.includes(positions[officialTurn])) {
                positions[officialTurn] = Math.min(100, positions[officialTurn] + 5);
            }
            isStealAttempt = true;
            activeAnsweringPlayer = (officialTurn === 1) ? 2 : 1;
            showModal(riddleData); 
        } else {
            finishTurn();
        }
    }, 800);
}

function finishTurn() {
    modalContent.classList.remove('correct-flash');
    modal.style.display = 'none';
    officialTurn = (officialTurn === 1) ? 2 : 1;
    
    socket.emit('playerMove', {
        roomId: currentRoomId, // SEND THE ROOM ID
        positions: positions,
        nextTurn: officialTurn
    });
    
    updateUI();
    syncStatus();
    document.getElementById('roll-btn').disabled = false;
}

function syncStatus() {
    statusText.innerText = `Player ${officialTurn}'s Turn`;
    statusText.style.color = (officialTurn === 1) ? "#e74c3c" : "#3498db";
}
