const socket = io();

let currentUser = { name: "Guest", coins: 600, xp: 0 };
let currentRoomId = null;
let isHost = false;
let myId = null;
let duelTimerInterval = null;

// The Standard Ludo Perimeter Path (mapped to 15x15 grid coordinates, 0-indexed)
// Format: {r: row, c: col}
const ludoPath = [
    // Red outward
    {r:6, c:1}, {r:6, c:2}, {r:6, c:3}, {r:6, c:4}, {r:6, c:5}, 
    {r:5, c:6}, {r:4, c:6}, {r:3, c:6}, {r:2, c:6}, {r:1, c:6}, {r:0, c:6},
    {r:0, c:7}, {r:0, c:8}, {r:1, c:8}, {r:2, c:8}, {r:3, c:8}, {r:4, c:8}, {r:5, c:8},
    {r:6, c:9}, {r:6, c:10}, {r:6, c:11}, {r:6, c:12}, {r:6, c:13}, {r:6, c:14},
    {r:7, c:14}, {r:8, c:14}, {r:8, c:13}, {r:8, c:12}, {r:8, c:11}, {r:8, c:10}, {r:8, c:9},
    {r:9, c:8}, {r:10, c:8}, {r:11, c:8}, {r:12, c:8}, {r:13, c:8}, {r:14, c:8},
    {r:14, c:7}, {r:14, c:6}, {r:13, c:6}, {r:12, c:6}, {r:11, c:6}, {r:10, c:6}, {r:9, c:6},
    {r:8, c:5}, {r:8, c:4}, {r:8, c:3}, {r:8, c:2}, {r:8, c:1}, {r:8, c:0}, {r:7, c:0},
    // Home stretch (Red)
    {r:7, c:1}, {r:7, c:2}, {r:7, c:3}, {r:7, c:4}, {r:7, c:5} 
];

const colors = ['#ef4444', '#10b981', '#3b82f6', '#fbbf24']; // Red, Green, Blue, Yellow

function playGuest() {
    currentUser.name = document.getElementById('guest-name').value.trim() || "Guest_" + Math.floor(Math.random()*999);
    transitionToLobby();
}

function transitionToLobby() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('player-name').innerText = currentUser.name;
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function hostGame() { socket.emit('createRoom'); }
function joinGame() {
    const code = document.getElementById('room-code').value.trim().toUpperCase();
    if(code) socket.emit('joinRoom', code);
}

socket.on('roomJoined', (data) => {
    currentRoomId = data.roomId;
    isHost = data.isHost;
    myId = socket.id;
    
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('display-room-id').innerText = currentRoomId;
    
    if (isHost) document.getElementById('start-btn').classList.remove('hidden');
    buildLudoBoard();
});

socket.on('updateLobby', (players) => {
    document.getElementById('players-list').innerHTML = players.map((p, i) => 
        `<div style="padding: 10px; background: rgba(0,0,0,0.3); border-left: 4px solid ${colors[i%4]}; margin-bottom: 5px; border-radius: 4px;">
            ${p.name} ${p.id === myId ? '(You)' : ''} ${p.stunned ? '😵' : ''}
        </div>`
    ).join('');
    updateBoardTokens(players);
});

socket.on('gameStarted', () => {
    document.getElementById('start-btn').classList.add('hidden');
    showToast("Game Started!");
});

socket.on('turnUpdate', (data) => {
    const isMyTurn = data.activePlayerId === myId;
    document.getElementById('turn-indicator').innerText = isMyTurn ? "Your Turn!" : `${data.activePlayerName}'s Turn`;
    document.getElementById('roll-btn').disabled = !isMyTurn;
});

function rollDice() {
    document.getElementById('roll-btn').disabled = true;
    socket.emit('rollDice', currentRoomId);
}

socket.on('diceRolled', (data) => {
    animateDice(data.roll, () => {
        showToast(`${data.playerName} rolled a ${data.roll}`);
        updateBoardTokens(data.players);
    });
});

// Advanced 3D Dice Animation
function animateDice(result, callback) {
    const cube = document.getElementById('dice-cube');
    cube.classList.add('rolling');
    
    setTimeout(() => {
        cube.classList.remove('rolling');
        
        let rotX = 0, rotY = 0;
        switch(result) {
            case 1: rotX = 0; rotY = 0; break;
            case 6: rotX = 0; rotY = 180; break;
            case 3: rotX = 0; rotY = -90; break;
            case 4: rotX = 0; rotY = 90; break;
            case 5: rotX = -90; rotY = 0; break;
            case 2: rotX = 90; rotY = 0; break;
        }
        
        cube.style.transform = `translateZ(-50px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        setTimeout(callback, 500); // Wait for physical rotation to stop
    }, 1000);
}

// Draw the dynamic Ludo Board using Grid
function buildLudoBoard() {
    const board = document.getElementById('ludo-board');
    board.innerHTML = '';
    
    // Create 15x15 grid
    for(let r = 0; r < 15; r++) {
        for(let c = 0; c < 15; c++) {
            const cell = document.createElement('div');
            cell.className = 'ludo-cell';
            cell.id = `cell-${r}-${c}`;
            
            // Assign Base Colors
            if (r < 6 && c < 6) cell.classList.add('base-red');
            else if (r < 6 && c > 8) cell.classList.add('base-green');
            else if (r > 8 && c < 6) cell.classList.add('base-blue');
            else if (r > 8 && c > 8) cell.classList.add('base-yellow');
            
            board.appendChild(cell);
        }
    }
    
    // Add Center Home
    const center = document.createElement('div');
    center.className = 'center-home';
    center.innerHTML = '🏁';
    board.appendChild(center);
}

function updateBoardTokens(players) {
    // Remove old tokens
    document.querySelectorAll('.token').forEach(el => el.remove());

    players.forEach((p, i) => {
        const token = document.createElement('div');
        token.className = `token ${p.stunned ? 'stunned' : ''}`;
        token.style.backgroundColor = colors[i % 4];
        token.innerHTML = '👤';
        
        let targetCell;
        if (p.pos === -1) {
            // In Base
            const bases = [[2,2], [2,12], [12,2], [12,12]];
            targetCell = document.getElementById(`cell-${bases[i%4][0]}-${bases[i%4][1]}`);
        } else if (p.pos >= ludoPath.length) {
            // Won/In Center
            targetCell = document.querySelector('.center-home');
        } else {
            // On Path (Shift starting point based on player index to simulate 4 paths)
            // For simplicity in this demo, everyone shares the Red starting path, just colored differently.
            const coord = ludoPath[p.pos];
            targetCell = document.getElementById(`cell-${coord.r}-${coord.c}`);
        }

        if (targetCell) targetCell.appendChild(token);
    });
}

// Duel Logic
socket.on('startDuel', (data) => {
    document.getElementById('duel-question').innerText = data.riddle.q;
    const optsBox = document.getElementById('duel-options');
    optsBox.innerHTML = '';
    
    data.riddle.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = () => {
            btn.classList.add('selected');
            document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
            socket.emit('submitDuelAnswer', { roomId: currentRoomId, answer: opt });
        };
        optsBox.appendChild(btn);
    });

    openModal('duel-modal');
    
    let timeLeft = 15;
    document.getElementById('duel-timer').innerText = timeLeft;
    duelTimerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('duel-timer').innerText = timeLeft;
        if(timeLeft <= 0) clearInterval(duelTimerInterval);
    }, 1000);
});

socket.on('duelEnded', (data) => {
    clearInterval(duelTimerInterval);
    closeModal('duel-modal');
    showToast(data.msg);
    updateBoardTokens(data.players);
});

function startGame() { socket.emit('startGame', currentRoomId); }

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
