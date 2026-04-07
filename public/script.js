const socket = io();

// ==================== SHOP ITEMS ====================
const SHOP_ITEMS = [
    { id: 'avatar_default', name: 'Peasant', icon: '👤', type: 'avatar', price: 0, desc: 'A simple traveler.' },
    { id: 'avatar_knight', name: 'Knight', icon: '🛡️', type: 'avatar', price: 150, desc: 'Armor forged in the arena.' },
    { id: 'avatar_mage', name: 'Mage', icon: '🧙', type: 'avatar', price: 200, desc: 'Master of riddles.' },
    { id: 'ability_none', name: 'No Ability', icon: '🚫', type: 'ability', price: 0, desc: 'No special abilities.' },
    { id: 'ability_haste', name: 'Boots of Haste', icon: '⚡', type: 'ability', price: 300, desc: 'Passive: Moves slightly faster.' },
    { id: 'ability_shield', name: 'Riddle Shield', icon: '🔰', type: 'ability', price: 400, desc: 'Passive: Block one stun.' }
];

// ==================== LUDO PATH ====================
const LUDO_PATH = [
    {r: 6, c: 6}, {r: 6, c: 7}, {r: 6, c: 8},
    {r: 5, c: 8}, {r: 4, c: 8}, {r: 3, c: 8}, {r: 2, c: 8}, {r: 1, c: 8}, {r: 0, c: 8},
    {r: 0, c: 7}, {r: 0, c: 6}, {r: 0, c: 5}, {r: 0, c: 4}, {r: 0, c: 3}, {r: 0, c: 2}, {r: 0, c: 1},
    {r: 1, c: 1}, {r: 2, c: 1}, {r: 3, c: 1}, {r: 4, c: 1}, {r: 5, c: 1}, {r: 6, c: 1},
    {r: 6, c: 2}, {r: 6, c: 3}, {r: 6, c: 4}, {r: 6, c: 5},
    {r: 7, c: 6}, {r: 8, c: 6},
    {r: 8, c: 7}, {r: 8, c: 8}, {r: 8, c: 9}, {r: 8, c: 10}, {r: 8, c: 11}, {r: 8, c: 12}, {r: 8, c: 13}, {r: 8, c: 14},
    {r: 9, c: 14}, {r: 10, c: 14}, {r: 11, c: 14}, {r: 12, c: 14}, {r: 13, c: 14},
    {r: 13, c: 13}, {r: 13, c: 12}, {r: 13, c: 11}, {r: 13, c: 10}, {r: 13, c: 9}, {r: 13, c: 8},
    {r: 14, c: 8}, {r: 14, c: 7}, {r: 14, c: 6}, {r: 14, c: 5}, {r: 14, c: 4}, {r: 14, c: 3}, {r: 14, c: 2}, {r: 14, c: 1}, {r: 14, c: 0},
    {r: 13, c: 1}, {r: 12, c: 1}, {r: 11, c: 1}, {r: 10, c: 1}, {r: 9, c: 1},
    {r: 9, c: 2}, {r: 9, c: 3}, {r: 9, c: 4}, {r: 9, c: 5}, {r: 9, c: 6}, {r: 9, c: 7}, {r: 9, c: 8}
];

const SAFE_ZONES = [6, 13, 20, 27, 34, 41, 48];

// ==================== STATE MANAGEMENT ====================
let currentUser = { 
    isLoggedIn: false, 
    name: "Guest", 
    coins: 600, 
    xp: 0, 
    inventory: ['avatar_default', 'ability_none'], 
    selectedAvatar: 'avatar_default', 
    selectedAbility: 'ability_none' 
};

let currentRoomId = null;
let isHost = false;
let myId = null;
let duelTimerInterval = null;
let gameState = {
    players: [],
    gameStarted: false,
    currentTurn: 0
};
// ==================== PAGE NAVIGATION ====================
function goToPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageName}`).classList.add('active');
}

function goBack() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    if (currentRoomId) {
        document.getElementById('page-waiting').classList.add('active');
    } else {
        document.getElementById('page-lobby').classList.add('active');
    }
}

// ==================== AUTHENTICATION ====================
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`${tab}-tab`).classList.add('active');
    event.target.classList.add('active');
}

function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    
    if (!username || !password) {
        document.getElementById('login-message').innerText = 'Please fill in all fields';
        return;
    }
    
    socket.emit('auth_login', { user: username, pass: password });
}

function handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirm = document.getElementById('register-confirm').value.trim();
    
    if (!username || !password || !confirm) {
        document.getElementById('register-message').innerText = 'Please fill in all fields';
        return;
    }
    
    if (password !== confirm) {
        document.getElementById('register-message').innerText = 'Passwords do not match';
        return;
    }
    
    if (password.length < 4) {
        document.getElementById('register-message').innerText = 'Password must be at least 4 characters';
        return;
    }
    
    socket.emit('auth_register', { user: username, pass: password });
}

function handleGuest() {
    const name = document.getElementById('guest-name').value.trim();
    
    if (!name) {
        document.getElementById('guest-message').innerText = 'Please enter a nickname';
        return;
    }
    
    currentUser.name = name;
    transitionToLobby();
}

function handleLogout() {
    currentUser = { 
        isLoggedIn: false, 
        name: "Guest", 
        coins: 600, 
        xp: 0, 
        inventory: ['avatar_default', 'ability_none'], 
        selectedAvatar: 'avatar_default', 
        selectedAbility: 'ability_none' 
    };
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-auth').classList.add('active');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-message').innerText = '';
}

socket.on('auth_success', (data) => {
    currentUser = { ...currentUser, ...data, isLoggedIn: true };
    transitionToLobby();
});

socket.on('auth_error', (msg) => {
    document.getElementById('login-message').innerText = msg;
    document.getElementById('register-message').innerText = msg;
});

function transitionToLobby() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-lobby').classList.add('active');
    updateProfileUI();
}

function updateProfileUI() {
    document.getElementById('player-name-display').innerText = currentUser.name;
    document.getElementById('player-coins-display').innerText = currentUser.coins;
    document.getElementById('player-xp-display').innerText = currentUser.xp;
    
    const avatar = SHOP_ITEMS.find(i => i.id === currentUser.selectedAvatar);
    document.getElementById('player-avatar-display').innerText = avatar ? avatar.icon : '👤';
}

// ==================== SHOP & VAULT ====================
function renderShop() {
    const box = document.getElementById('shop-items');
    box.innerHTML = '';
    document.getElementById('shop-coins').innerText = currentUser.coins;
    
    SHOP_ITEMS.forEach(item => {
        if (item.price === 0) return;
        const isOwned = currentUser.inventory.includes(item.id);
        
        const card = document.createElement('div');
        card.className = 'shop-item';
        card.innerHTML = `
            <div class="icon">${item.icon}</div>
            <h4>${item.name}</h4>
            <p>${item.desc}</p>
            <div class="price">💰 ${item.price}</div>
            <button class="btn btn-primary" ${isOwned ? 'disabled' : ''} onclick="buyItem('${item.id}', ${item.price})">
                ${isOwned ? 'Owned' : 'Buy'}
            </button>
        `;
        box.appendChild(card);
    });
}

function renderVault() {
    const box = document.getElementById('vault-items');
    box.innerHTML = '';
    
    SHOP_ITEMS.filter(item => currentUser.inventory.includes(item.id)).forEach(item => {
        const isEquipped = (currentUser.selectedAvatar === item.id || currentUser.selectedAbility === item.id);
        
        const card = document.createElement('div');
        card.className = 'shop-item';
        card.innerHTML = `
            <div class="icon">${item.icon}</div>
            <h4>${item.name}</h4>
            <p>${item.desc}</p>
            <button class="btn ${isEquipped ? 'btn-primary' : 'btn-secondary'}" onclick="equipItem('${item.id}', '${item.type}')">
                ${isEquipped ? 'Equipped' : 'Equip'}
            </button>
        `;
        box.appendChild(card);
    });
}

function buyItem(id, price) {
    if (currentUser.coins < price) {
        showToast('Not enough coins!');
        return;
    }
    
    currentUser.coins -= price;
    currentUser.inventory.push(id);
    
    if (currentUser.isLoggedIn) {
        socket.emit('save_data', currentUser);
    }
    
    updateProfileUI();
    renderShop();
    showToast('Item purchased!');
}

function equipItem(id, type) {
    if (type === 'avatar') currentUser.selectedAvatar = id;
    if (type === 'ability') currentUser.selectedAbility = id;
    
    if (currentUser.isLoggedIn) {
        socket.emit('save_data', currentUser);
    }
    
    updateProfileUI();
    renderVault();
    showToast('Item equipped!');
}
// ==================== MULTIPLAYER ROOM LOGIC ====================
function handleCreateRoom() {
    const roomName = document.getElementById('room-name').value.trim();
    socket.emit('createRoom', { name: roomName });
    document.getElementById('room-name').value = '';
}

function handleJoinRoom() {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    
    if (!code) {
        document.getElementById('join-message').innerText = 'Please enter a room code';
        return;
    }
    
    socket.emit('joinRoom', code);
    document.getElementById('join-code').value = '';
}

function handleLeaveRoom() {
    if (currentRoomId) {
        socket.emit('leaveRoom', currentRoomId);
        currentRoomId = null;
        isHost = false;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-lobby').classList.add('active');
}

function handleLeaveGame() {
    if (currentRoomId) {
        socket.emit('leaveGame', currentRoomId);
        currentRoomId = null;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-lobby').classList.add('active');
}

socket.on('roomCreated', (data) => {
    currentRoomId = data.roomId;
    isHost = true;
    myId = socket.id;
    
    document.getElementById('display-room-code').innerText = currentRoomId;
    document.getElementById('host-badge').innerText = '(Host)';
    document.getElementById('start-game-section').classList.remove('hidden');
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-waiting').classList.add('active');
});

socket.on('roomJoined', (data) => {
    currentRoomId = data.roomId;
    isHost = data.isHost;
    myId = socket.id;
    
    document.getElementById('display-room-code').innerText = currentRoomId;
    document.getElementById('game-room-code').innerText = currentRoomId;
    
    if (!isHost) {
        document.getElementById('start-game-section').classList.add('hidden');
        document.getElementById('host-badge').innerText = '';
    } else {
        document.getElementById('start-game-section').classList.remove('hidden');
        document.getElementById('host-badge').innerText = '(Host)';
    }
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-waiting').classList.add('active');
});

socket.on('updatePlayers', (players) => {
    gameState.players = players;
    
    document.getElementById('player-count').innerText = players.length;
    document.getElementById('waiting-players-list').innerHTML = players.map((p, i) => `
        <div class="player-item ${p.id === myId ? 'active' : ''}">
            <div class="player-name">
                <span class="player-avatar-small">${SHOP_ITEMS.find(sh => sh.id === p.selectedAvatar)?.icon || '👤'}</span>
                <span>${p.name} ${p.id === myId ? '(You)' : ''}</span>
            </div>
            <span class="player-status">${p.id === players[0]?.id ? 'Host' : 'Player'}</span>
        </div>
    `).join('');
    
    updateGameRosterUI(players);
});

function handleStartGame() {
    if (isHost) {
        socket.emit('startGame', currentRoomId);
    }
}

socket.on('gameStarted', () => {
    buildLudoBoard();
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-game').classList.add('active');
    
    document.getElementById('roll-btn').disabled = false;
    showToast('Game Started!');
});

// ==================== LUDO BOARD BUILDING ====================
function buildLudoBoard() {
    const board = document.getElementById('ludo-board');
    board.innerHTML = '';

    for (let row = 0; row < 15; row++) {
        for (let col = 0; col < 15; col++) {
            const cell = document.createElement('div');
            cell.className = 'ludo-cell';
            cell.id = `cell-${row}-${col}`;

            if (row < 6 && col < 6) {
                cell.classList.add('base', 'base-red');
            } else if (row < 6 && col > 8) {
                cell.classList.add('base', 'base-green');
            } else if (row > 8 && col < 6) {
                cell.classList.add('base', 'base-blue');
            } else if (row > 8 && col > 8) {
                cell.classList.add('base', 'base-yellow');
            }

            if (row >= 7 && row < 10 && col >= 7 && col < 10) {
                cell.classList.add('home-section');
                if (row === 7 && col === 7) cell.classList.add('home-red');
                else if (row === 7 && col === 9) cell.classList.add('home-green');
                else if (row === 9 && col === 7) cell.classList.add('home-blue');
                else if (row === 9 && col === 9) cell.classList.add('home-yellow');
                cell.innerHTML = '●';
            }

            const isOnPath = LUDO_PATH.some(p => p.r === row && p.c === col);
            if (isOnPath) {
                cell.classList.add('path');
                const pathIndex = LUDO_PATH.findIndex(p => p.r === row && p.c === col);
                if (SAFE_ZONES.includes(pathIndex)) {
                    cell.classList.add('path-safe');
                }
            }

            board.appendChild(cell);
        }
    }
}

function updateBoardTokens(players) {
    document.querySelectorAll('.token').forEach(t => t.remove());

    const playerColors = ['#dc2626', '#059669', '#1d4ed8', '#ca8a04'];

    players.forEach((player, idx) => {
        const token = document.createElement('div');
        token.className = `token ${player.stunned ? 'stunned' : ''}`;
        token.style.backgroundColor = playerColors[idx % 4];
        token.innerHTML = '👤';

        let targetCell;

        if (player.position === -1) {
            const baseCells = [
                {r: 1, c: 1}, {r: 1, c: 4}, {r: 4, c: 1}, {r: 4, c: 4},
                {r: 1, c: 10}, {r: 1, c: 13}, {r: 4, c: 10}, {r: 4, c: 13},
                {r: 10, c: 1}, {r: 10, c: 4}, {r: 13, c: 1}, {r: 13, c: 4},
                {r: 10, c: 10}, {r: 10, c: 13}, {r: 13, c: 10}, {r: 13, c: 13}
            ];
            const baseCell = baseCells[idx * 4 + Math.floor(Math.random() * 4)];
            targetCell = document.getElementById(`cell-${baseCell.r}-${baseCell.c}`);
        } else if (player.position >= LUDO_PATH.length) {
            targetCell = document.querySelector('.home-section');
        } else {
            const pos = LUDO_PATH[player.position];
            targetCell = document.getElementById(`cell-${pos.r}-${pos.c}`);
        }

        if (targetCell) {
            targetCell.appendChild(token);
        }
    });
}

function updateGameRosterUI(players) {
    const list = document.getElementById('game-players-list');
    if (list) {
        list.innerHTML = players.map((p, i) => `
            <div class="player-item ${p.id === myId ? 'active' : ''}">
                <div class="player-name">
                    <span class="player-avatar-small">${SHOP_ITEMS.find(sh => sh.id === p.selectedAvatar)?.icon || '👤'}</span>
                    <span>${p.name}</span>
                </div>
                <span class="player-status">${p.stunned ? '😵' : '✓'}</span>
            </div>
        `).join('');
    }
}

// ==================== GAME LOGIC ====================
function rollDice() {
    document.getElementById('roll-btn').disabled = true;
    socket.emit('rollDice', currentRoomId);
}

function animateDice(result) {
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
    }, 1000);
}

socket.on('diceRolled', (data) => {
    animateDice(data.roll);
    updateBoardTokens(data.players);
    gameState.players = data.players;
    updateGameRosterUI(data.players);
});

socket.on('turnUpdate', (data) => {
    const isMyTurn = data.activePlayerId === myId;
    document.getElementById('turn-info').innerText = isMyTurn ? '⚡ Your Turn!' : `${data.activePlayerName}'s Turn`;
    document.getElementById('roll-btn').disabled = !isMyTurn;
});

// ==================== DUEL LOGIC ====================
socket.on('startDuel', (data) => {
    document.getElementById('duel-question').innerText = data.riddle.q;
    const optsBox = document.getElementById('duel-options');
    optsBox.innerHTML = '';
    
    data.riddle.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'duel-option';
        btn.innerText = opt;
        btn.onclick = () => {
            btn.classList.add('selected');
            document.querySelectorAll('.duel-option').forEach(b => b.disabled = true);
            socket.emit('submitDuelAnswer', { roomId: currentRoomId, answer: opt });
        };
        optsBox.appendChild(btn);
    });

    document.getElementById('duel-overlay').classList.remove('hidden');
    
    let timeLeft = 15;
    document.getElementById('duel-timer').innerText = timeLeft;
    
    duelTimerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('duel-timer').innerText = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(duelTimerInterval);
        }
    }, 1000);
});

socket.on('duelEnded', (data) => {
    clearInterval(duelTimerInterval);
    document.getElementById('duel-overlay').classList.add('hidden');
    document.getElementById('duel-options').innerHTML = '';
    
    showToast(data.msg);
    updateBoardTokens(data.players);
    gameState.players = data.players;
    updateGameRosterUI(data.players);
});

socket.on('gameEnded', (data) => {
    showToast('🏆 ' + data.msg);
    setTimeout(() => {
        handleLeaveGame();
    }, 3000);
});

// ==================== UTILITIES ====================
function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// ==================== FIX: Auto-enable roll button ====================
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    goToPage('lobby');
});

// ==================== FIX: Handle errors ====================
socket.on('error', (error) => {
    console.error('Socket error:', error);
    showToast('Connection error: ' + error);
});
