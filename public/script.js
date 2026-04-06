const socket = io();

let currentUser = { isLoggedIn: false, name: "Guest", coins: 600, xp: 0, inventory: ['avatar_default', 'ability_none'], selectedAvatar: 'avatar_default', selectedAbility: 'ability_none' };
let currentRoomId = null;
let isHost = false;
let myId = null;
let duelTimer = null;
let duelActive = false;

// --- AUTH & MENUS ---
function playGuest() {
    currentUser.name = document.getElementById('guest-name').value.trim() || "Guest_" + Math.floor(Math.random()*999);
    transitionToLobby();
}
function login() { socket.emit('auth_login', { user: document.getElementById('auth-user').value.trim(), pass: document.getElementById('auth-pass').value.trim() }); }
function register() { socket.emit('auth_register', { user: document.getElementById('auth-user').value.trim(), pass: document.getElementById('auth-pass').value.trim() }); }

socket.on('auth_success', (userData) => {
    currentUser = { ...currentUser, ...userData, isLoggedIn: true };
    transitionToLobby();
});
socket.on('auth_error', (msg) => { document.getElementById('auth-message').innerText = msg; });

function transitionToLobby() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('display-name').innerText = currentUser.name;
    document.getElementById('coin-count').innerText = currentUser.coins;
    document.getElementById('xp-count').innerText = currentUser.xp;
}

// Fixed display property to flex for centering
function openRules() { document.getElementById('rules-modal').style.display = 'flex'; }
function openShop() { document.getElementById('shop-modal').style.display = 'flex'; }
function openVault() { document.getElementById('vault-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// --- ROOM LOGIC ---
function createRoom() {
    const limit = document.getElementById('player-limit').value;
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('joinRoom', { roomId: id, playerName: currentUser.name, avatar: currentUser.selectedAvatar, maxPlayers: limit });
    enterWaitingRoom(id);
}
function joinRoom() {
    const id = document.getElementById('room-input').value.trim().toUpperCase();
    if (id) {
        socket.emit('joinRoom', { roomId: id, playerName: currentUser.name, avatar: currentUser.selectedAvatar });
        enterWaitingRoom(id);
    }
}
function enterWaitingRoom(id) {
    currentRoomId = id;
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('waiting-room').classList.remove('hidden');
    document.getElementById('wait-room-id').innerText = `ROOM: ${id}`;
}
function requestStart() { socket.emit('startGameSignal', currentRoomId); }

socket.on('playerCountUpdate', (data) => {
    const me = data.players.find(p => p.name === currentUser.name);
    if(me) { myId = me.id; isHost = me.isHost; }
    
    document.getElementById('player-count-text').innerText = `Players: ${data.count}/${data.max}`;
    const startBtn = document.getElementById('start-game-btn');
    if (isHost) { startBtn.classList.remove('hidden'); startBtn.disabled = (data.count < 2); }
    
    document.getElementById('player-list').innerHTML = data.players.map((p, i) => `<li>👤 ${p.name} ${p.id === myId ? '(You)' : ''}</li>`).join('');
});

// --- GAME LOGIC ---
socket.on('initGame', (data) => {
    document.getElementById('waiting-room').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    generateBoard();
    updateUI(data.players);
});

socket.on('turnUpdate', (data) => {
    const statusText = document.getElementById('status');
    const rollBtn = document.getElementById('roll-btn');
    const diceDisplay = document.getElementById('dice-display');
    
    diceDisplay.innerText = "🎲";
    diceDisplay.classList.remove('rolling');

    if (data.activePlayerId === myId) {
        statusText.innerText = "YOUR TURN!";
        statusText.style.color = "var(--accent-green)";
        rollBtn.disabled = false;
        rollBtn.classList.remove('hidden');
    } else {
        statusText.innerText = `${data.name}'s Turn...`;
        statusText.style.color = "var(--text-dim)";
        rollBtn.disabled = true;
        rollBtn.classList.add('hidden');
    }
});

function triggerRoll() {
    document.getElementById('roll-btn').disabled = true;
    socket.emit('rollDice', currentRoomId);
}

socket.on('diceRolled', (data) => {
    const dice = document.getElementById('dice-display');
    dice.classList.add('rolling');
    
    let ticks = 0;
    const interval = setInterval(() => {
        dice.innerText = Math.floor(Math.random() * 6) + 1;
        ticks++;
        if(ticks > 10) {
            clearInterval(interval);
            dice.innerText = data.dice;
            dice.classList.remove('rolling');
            
            const pDiv = document.getElementById(`player-${data.id}`);
            const cell = document.getElementById('cell-' + data.pos);
            if (pDiv && cell) {
                pDiv.style.left = cell.offsetLeft + 10 + 'px';
                pDiv.style.top = cell.offsetTop + 10 + 'px';
            }
        }
    }, 100);
});

// --- DUEL MECHANIC ---
socket.on('duelStarted', (data) => {
    duelActive = true;
    const isDuelist = (myId === data.attackerId || myId === data.defenderId);
    
    document.getElementById('status').innerText = `⚔️ DUEL: ${data.attackerName} vs ${data.defenderName}! ⚔️`;
    document.getElementById('status').style.color = "var(--accent-red)";

    if (isDuelist) {
        showDuelModal(data.riddle);
    } else {
        showSpectatorOverlay(data.attackerName, data.defenderName);
    }
});

function showDuelModal(riddle) {
    const modal = document.getElementById('riddle-modal');
    const box = document.getElementById('options-box');
    const timerDisplay = document.getElementById('timer-display');
    
    document.getElementById('modal-title').innerText = "⚔️ DUEL TO THE DEATH ⚔️";
    document.getElementById('riddle-text').innerText = riddle.question;
    box.innerHTML = '';
    
    let timeLeft = 30;
    timerDisplay.innerText = `⏳ ${timeLeft}s`;
    clearInterval(duelTimer);
    duelTimer = setInterval(() => {
        timeLeft--;
        timerDisplay.innerText = `⏳ ${timeLeft}s`;
        if (timeLeft <= 0) clearInterval(duelTimer);
    }, 1000);

    ['option_a', 'option_b', 'option_c', 'option_d'].forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'option-btn duel-btn';
        btn.innerText = riddle[key];
        btn.onclick = () => {
            Array.from(box.children).forEach(b => b.disabled = true);
            btn.classList.add('selected');
            socket.emit('submitDuelAnswer', { roomId: currentRoomId, selected: btn.innerText });
        };
        box.appendChild(btn);
    });
    modal.style.display = 'flex'; // Fixed for centering
}

function showSpectatorOverlay(p1, p2) {
    const overlay = document.getElementById('spectator-overlay');
    document.getElementById('spectator-msg').innerText = `${p1} and ${p2} are dueling!`;
    overlay.style.display = 'flex';
}

socket.on('duelWrongGuess', () => {
    const selected = document.querySelector('.duel-btn.selected');
    if(selected) {
        selected.classList.remove('selected');
        selected.classList.add('wrong');
    }
    document.getElementById('modal-title').innerText = "❌ INCORRECT!";
});

socket.on('duelEnded', (data) => {
    duelActive = false;
    clearInterval(duelTimer);
    document.getElementById('riddle-modal').style.display = 'none';
    document.getElementById('spectator-overlay').style.display = 'none';
    
    showToast(data.msg);
    updateUI(data.players); 
});

socket.on('stunRecovered', (playerId) => {
    const pDiv = document.getElementById(`player-${playerId}`);
    if(pDiv) pDiv.classList.remove('stunned');
});

socket.on('gameOver', (winner) => {
    alert(`🎉 ${winner.name} reached the top and won the game!`);
    window.location.reload();
});

socket.on('playerDisconnected', (name) => {
    alert(`🚫 ${name} fled the battle. Game Over.`);
    window.location.reload();
});

// --- HELPERS ---
function generateBoard() {
    const b = document.getElementById('board');
    if (b.querySelectorAll('.cell').length > 0) return;
    for (let i = 1; i <= 100; i++) {
        const c = document.createElement('div');
        c.className = 'cell'; c.id = 'cell-' + i; c.innerText = i; b.appendChild(c);
    }
}

function updateUI(players) {
    const board = document.getElementById('board');
    players.forEach((p, i) => {
        let pDiv = document.getElementById(`player-${p.id}`);
        if (!pDiv) {
            pDiv = document.createElement('div');
            pDiv.id = `player-${p.id}`;
            pDiv.className = 'statue';
            pDiv.innerHTML = '👤';
            const colors = ['#ef4444', '#3b82f6', '#10b981', '#a855f7'];
            pDiv.style.borderColor = colors[i % colors.length];
            board.appendChild(pDiv);
        }

        const cell = document.getElementById('cell-' + p.pos);
        if (cell) {
            const countOnCell = players.filter(pl => pl.pos === p.pos).length;
            const offset = countOnCell > 1 ? (i * 8) : 10; 
            
            pDiv.style.left = cell.offsetLeft + offset + 'px';
            pDiv.style.top = cell.offsetTop + offset + 'px';
        }

        if (p.stunned) pDiv.classList.add('stunned');
        else pDiv.classList.remove('stunned');
    });
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast'; toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}
