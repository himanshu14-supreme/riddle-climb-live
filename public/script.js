const socket = io();

let currentUser = {
    isLoggedIn: false,
    name: "Guest",
    coins: 300, 
    xp: 0,
    inventory: ['avatar_default', 'ability_none'],
    selectedAvatar: 'avatar_default',
    selectedAbility: 'ability_none'
};

let currentRoomId = null;
let isHost = false;
let localTimer = null;
let selectedOptionBtn = null;

// --- AUTH & UI ---
function playGuest() {
    const userInp = document.getElementById('guest-name').value.trim();
    currentUser.name = userInp || "Guest_" + Math.floor(Math.random() * 999);
    transitionToLobby();
}

function transitionToLobby() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    updateProfileUI();
}

function updateProfileUI() {
    document.getElementById('display-name').innerText = currentUser.name;
    document.getElementById('coin-count').innerText = currentUser.coins;
    document.getElementById('xp-count').innerText = currentUser.xp;
}

function openRules() { document.getElementById('rules-modal').style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// --- ROOM LOGIC ---
function createRoom() {
    const limit = document.getElementById('player-limit').value;
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('joinRoom', { 
        roomId: id, playerName: currentUser.name, 
        avatar: currentUser.selectedAvatar, maxPlayers: limit 
    });
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

// --- SOCKET EVENTS ---
socket.on('playerCountUpdate', (data) => {
    const me = data.players.find(p => p.id === socket.id);
    isHost = me ? me.isHost : false;
    
    document.getElementById('player-count-text').innerText = `Players: ${data.count}/${data.max}`;
    
    // Toggle Host vs Guest UI in Waiting Room
    const startBtn = document.getElementById('start-game-btn');
    const waitMsg = document.getElementById('host-wait-msg');
    if (isHost) {
        startBtn.classList.remove('hidden');
        waitMsg.classList.add('hidden');
        startBtn.disabled = (data.count < 2);
    } else {
        startBtn.classList.add('hidden');
        waitMsg.classList.remove('hidden');
    }
    
    document.getElementById('player-list').innerHTML = data.players.map(p => 
        `<li>${p.avatar === 'avatar_knight' ? '🛡️' : '👤'} ${p.name} ${p.id === socket.id ? '(You)' : ''}</li>`
    ).join('');
});

socket.on('initGame', (data) => {
    document.getElementById('waiting-room').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    generateBoard();
    
    data.players.forEach((p, i) => {
        const pDiv = document.getElementById(`player${i+1}`);
        pDiv.classList.remove('hidden');
        pDiv.innerHTML = p.avatar === 'avatar_knight' ? '🛡️' : '👤';
    });
    updateUI(data.players);
    syncHostControls();
});

function syncHostControls() {
    const rollBtn = document.getElementById('roll-btn');
    const rollMsg = document.getElementById('roll-wait-msg');

    if (isHost) {
        rollBtn.classList.remove('hidden');
        rollMsg.classList.add('hidden');
        rollBtn.onclick = () => socket.emit('requestRiddle', currentRoomId);
    } else {
        rollBtn.classList.add('hidden');
        rollMsg.classList.remove('hidden');
    }
}

socket.on('startRiddleRound', (riddle) => {
    const modal = document.getElementById('riddle-modal');
    const box = document.getElementById('options-box');
    const timerDisplay = document.getElementById('timer-display');
    
    selectedOptionBtn = null;
    document.getElementById('riddle-text').innerText = riddle.question;
    box.innerHTML = '';
    
    let timeLeft = 30;
    timerDisplay.innerText = `⏳ ${timeLeft}s`;

    clearInterval(localTimer);
    localTimer = setInterval(() => {
        timeLeft--;
        timerDisplay.innerText = `⏳ ${timeLeft}s`;
        if (timeLeft <= 0) clearInterval(localTimer);
    }, 1000);

    const startTime = Date.now();
    ['option_a', 'option_b', 'option_c', 'option_d'].forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = riddle[key];
        btn.onclick = () => {
            clearInterval(localTimer);
            selectedOptionBtn = btn;
            btn.classList.add('selected');
            socket.emit('submitAnswer', { roomId: currentRoomId, selected: btn.innerText, timeTaken: Date.now() - startTime });
            Array.from(box.children).forEach(b => b.disabled = true);
        };
        box.appendChild(btn);
    });
    modal.style.display = 'block';
});

socket.on('roundResults', (data) => {
    const box = document.getElementById('options-box');
    if(box) {
        Array.from(box.children).forEach(btn => {
            if (btn.innerText === data.correctAnswer) btn.classList.add('correct');
            else if (btn === selectedOptionBtn) btn.classList.add('wrong');
        });
    }

    setTimeout(() => {
        showMiniLeaderboard(data.results);
    }, 2000);

    setTimeout(() => {
        document.getElementById('leaderboard-overlay').classList.add('hidden');
        document.getElementById('riddle-modal').style.display = 'none';
        updateUI(data.players);
        syncHostControls();
    }, 5000); 
});

function updateUI(players) {
    players.forEach((p, i) => {
        const cell = document.getElementById('cell-' + p.pos);
        const div = document.getElementById('player' + (i + 1));
        if (cell && div) {
            div.style.left = (cell.offsetLeft + 10 + (i * 4)) + 'px';
            div.style.top = (cell.offsetTop + 10 + (i * 4)) + 'px';
        }
    });
}

function generateBoard() {
    const b = document.getElementById('board');
    if (b.querySelectorAll('.cell').length > 0) return;
    for (let i = 1; i <= 100; i++) {
        const c = document.createElement('div');
        c.className = 'cell'; c.id = 'cell-' + i; c.innerText = i; b.appendChild(c);
    }
}

function showMiniLeaderboard(results) {
    const list = document.getElementById('leaderboard-list');
    results.sort((a,b) => a.time - b.time);
    list.innerHTML = results.map((r, i) => `
        <div class="leaderboard-row">
            <span>#${i+1} ${r.name}</span>
            <span>${r.isCorrect ? r.time+'s' : '❌'}</span>
            <span style="color:var(--accent-green)">+${r.steps}</span>
        </div>
    `).join('');
    document.getElementById('leaderboard-overlay').classList.remove('hidden');
}
