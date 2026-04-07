const socket = io();

const SHOP_ITEMS = [
    { id: 'avatar_default', name: 'Peasant', icon: '👤', type: 'avatar', price: 0, desc: 'A simple traveler.' },
    { id: 'avatar_knight', name: 'Knight', icon: '🛡️', type: 'avatar', price: 150, desc: 'Armor forged in the arena.' },
    { id: 'avatar_mage', name: 'Mage', icon: '🧙', type: 'avatar', price: 200, desc: 'Master of riddles.' },
    { id: 'ability_none', name: 'No Ability', icon: '🚫', type: 'ability', price: 0, desc: 'No special abilities.' },
    { id: 'ability_haste', name: 'Boots of Haste', icon: '⚡', type: 'ability', price: 300, desc: 'Moves slightly faster.' },
    { id: 'ability_shield', name: 'Riddle Shield', icon: '🔰', type: 'ability', price: 400, desc: 'Block one stun.' }
];

const LUDO_PATH = [
    {r:6,c:6},{r:6,c:7},{r:6,c:8},{r:5,c:8},{r:4,c:8},{r:3,c:8},{r:2,c:8},{r:1,c:8},{r:0,c:8},
    {r:0,c:7},{r:0,c:6},{r:0,c:5},{r:0,c:4},{r:0,c:3},{r:0,c:2},{r:0,c:1},
    {r:1,c:1},{r:2,c:1},{r:3,c:1},{r:4,c:1},{r:5,c:1},{r:6,c:1},
    {r:6,c:2},{r:6,c:3},{r:6,c:4},{r:6,c:5},{r:7,c:6},{r:8,c:6},
    {r:8,c:7},{r:8,c:8},{r:8,c:9},{r:8,c:10},{r:8,c:11},{r:8,c:12},{r:8,c:13},{r:8,c:14},
    {r:9,c:14},{r:10,c:14},{r:11,c:14},{r:12,c:14},{r:13,c:14},
    {r:13,c:13},{r:13,c:12},{r:13,c:11},{r:13,c:10},{r:13,c:9},{r:13,c:8},
    {r:14,c:8},{r:14,c:7},{r:14,c:6},{r:14,c:5},{r:14,c:4},{r:14,c:3},{r:14,c:2},{r:14,c:1},{r:14,c:0},
    {r:13,c:1},{r:12,c:1},{r:11,c:1},{r:10,c:1},{r:9,c:1},
    {r:9,c:2},{r:9,c:3},{r:9,c:4},{r:9,c:5},{r:9,c:6},{r:9,c:7},{r:9,c:8}
];

const SAFE_ZONES = [6, 13, 20, 27, 34, 41, 48];

let currentUser = { isLoggedIn: false, name: "Guest", coins: 600, xp: 0, inventory: ['avatar_default', 'ability_none'], selectedAvatar: 'avatar_default', selectedAbility: 'ability_none' };
let currentRoomId = null;
let isHost = false;
let myId = null;
let gameState = { players: [], gameStarted: false };

function goToPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`page-${pageName}`);
    if (page) page.classList.add('active');
}

function goBack() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-lobby').classList.add('active');
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabEl = document.getElementById(`${tab}-tab`);
    if (tabEl) tabEl.classList.add('active');
    if (event && event.target) event.target.classList.add('active');
}

function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (!username || !password) {
        document.getElementById('login-message').innerText = 'Fill all fields';
        return;
    }
    socket.emit('auth_login', { user: username, pass: password });
}

function handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirm = document.getElementById('register-confirm').value.trim();
    if (!username || !password || !confirm) {
        document.getElementById('register-message').innerText = 'Fill all fields';
        return;
    }
    if (password !== confirm) {
        document.getElementById('register-message').innerText = 'Passwords do not match';
        return;
    }
    socket.emit('auth_register', { user: username, pass: password });
}

function handleGuest() {
    const name = document.getElementById('guest-name').value.trim() || `Guest_${Math.floor(Math.random()*9999)}`;
    currentUser.name = name;
    goToPage('lobby');
    updateProfileUI();
}

function handleLogout() {
    currentUser = { isLoggedIn: false, name: "Guest", coins: 600, xp: 0, inventory: ['avatar_default', 'ability_none'], selectedAvatar: 'avatar_default', selectedAbility: 'ability_none' };
    goToPage('auth');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
}

socket.on('auth_success', (data) => {
    currentUser = { ...currentUser, ...data, isLoggedIn: true };
    goToPage('lobby');
    updateProfileUI();
});

socket.on('auth_error', (msg) => {
    showToast(msg);
    document.getElementById('login-message').innerText = msg;
    document.getElementById('register-message').innerText = msg;
});

function updateProfileUI() {
    const nameEl = document.getElementById('player-name-display');
    const coinsEl = document.getElementById('player-coins-display');
    const xpEl = document.getElementById('player-xp-display');
    const avatarEl = document.getElementById('player-avatar-display');
    
    if (nameEl) nameEl.innerText = currentUser.name;
    if (coinsEl) coinsEl.innerText = currentUser.coins;
    if (xpEl) xpEl.innerText = currentUser.xp;
    if (avatarEl) {
        const avatar = SHOP_ITEMS.find(i => i.id === currentUser.selectedAvatar);
        avatarEl.innerText = avatar ? avatar.icon : '👤';
    }
}

function renderShop() {
    const box = document.getElementById('shop-items');
    if (!box) return;
    box.innerHTML = '';
    const coinsEl = document.getElementById('shop-coins');
    if (coinsEl) coinsEl.innerText = currentUser.coins;
    
    SHOP_ITEMS.forEach(item => {
        if (item.price === 0) return;
        const isOwned = currentUser.inventory.includes(item.id);
        const card = document.createElement('div');
        card.className = 'shop-item';
        card.innerHTML = `<div class="icon">${item.icon}</div><h4>${item.name}</h4><p>${item.desc}</p><div class="price">💰 ${item.price}</div><button class="btn btn-primary" ${isOwned ? 'disabled' : ''} onclick="buyItem('${item.id}', ${item.price})">${isOwned ? 'Owned' : 'Buy'}</button>`;
        box.appendChild(card);
    });
}

function renderVault() {
    const box = document.getElementById('vault-items');
    if (!box) return;
    box.innerHTML = '';
    SHOP_ITEMS.filter(item => currentUser.inventory.includes(item.id)).forEach(item => {
        const isEquipped = currentUser.selectedAvatar === item.id || currentUser.selectedAbility === item.id;
        const card = document.createElement('div');
        card.className = 'shop-item';
        card.innerHTML = `<div class="icon">${item.icon}</div><h4>${item.name}</h4><p>${item.desc}</p><button class="btn btn-primary" onclick="equipItem('${item.id}', '${item.type}')">${isEquipped ? 'Equipped' : 'Equip'}</button>`;
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
    if (currentUser.isLoggedIn) socket.emit('save_data', currentUser);
    updateProfileUI();
    renderShop();
    showToast('Item purchased!');
}

function equipItem(id, type) {
    if (type === 'avatar') currentUser.selectedAvatar = id;
    if (type === 'ability') currentUser.selectedAbility = id;
    if (currentUser.isLoggedIn) socket.emit('save_data', currentUser);
    updateProfileUI();
    renderVault();
    showToast('Item equipped!');
}

function handleCreateRoom() {
    const roomName = document.getElementById('room-name').value.trim();
    socket.emit('createRoom', { name: roomName });
}

function handleJoinRoom() {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!code) {
        document.getElementById('join-message').innerText = 'Enter room code';
        return;
    }
    socket.emit('joinRoom', code);
}

function handleLeaveRoom() {
    if (currentRoomId) socket.emit('leaveRoom', currentRoomId);
    currentRoomId = null;
    goToPage('lobby');
}

function handleLeaveGame() {
    if (currentRoomId) socket.emit('leaveGame', currentRoomId);
    currentRoomId = null;
    goToPage('lobby');
}

socket.on('roomCreated', (data) => {
    currentRoomId = data.roomId;
    isHost = true;
    myId = socket.id;
    document.getElementById('display-room-code').innerText = currentRoomId;
    document.getElementById('game-room-code').innerText = currentRoomId;
    document.getElementById('host-badge').innerText = '(Host)';
    document.getElementById('start-game-section').classList.remove('hidden');
    goToPage('waiting');
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
    }
    goToPage('waiting');
});

socket.on('updatePlayers', (players) => {
    gameState.players = players;
    const list = document.getElementById('waiting-players-list');
    if (list) {
        list.innerHTML = players.map(p => `<div class="player-item ${p.id === myId ? 'active' : ''}"><div class="player-name"><span class="player-avatar-small">${SHOP_ITEMS.find(sh => sh.id === p.selectedAvatar)?.icon || '👤'}</span><span>${p.name}${p.id === myId ? ' (You)' : ''}</span></div></div>`).join('');
    }
    const count = document.getElementById('player-count');
    if (count) count.innerText = players.length;
});

function handleStartGame() {
    if (isHost) socket.emit('startGame', currentRoomId);
}

socket.on('gameStarted', () => {
    buildLudoBoard();
    goToPage('game');
    document.getElementById('roll-btn').disabled = false;
    showToast('Game Started!');
});

function buildLudoBoard() {
    const board = document.getElementById('ludo-board');
    if (!board) return;
    board.innerHTML = '';
    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
            const cell = document.createElement('div');
            cell.className = 'ludo-cell';
            cell.id = `cell-${r}-${c}`;
            if (r < 6 && c < 6) cell.classList.add('base', 'base-red');
            else if (r < 6 && c > 8) cell.classList.add('base', 'base-green');
            else if (r > 8 && c < 6) cell.classList.add('base', 'base-blue');
            else if (r > 8 && c > 8) cell.classList.add('base', 'base-yellow');
            if (r >= 7 && r < 10 && c >= 7 && c < 10) {
                cell.classList.add('home-section');
                cell.innerHTML = '●';
            }
            const isOnPath = LUDO_PATH.some(p => p.r === r && p.c === c);
            if (isOnPath) cell.classList.add('path');
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
            targetCell = document.getElementById(`cell-${2 + idx * 6}-${2 + idx % 2 * 10}`);
        } else if (player.position >= LUDO_PATH.length) {
            targetCell = document.querySelector('.home-section');
        } else {
            const pos = LUDO_PATH[player.position];
            targetCell = document.getElementById(`cell-${pos.r}-${pos.c}`);
        }
        if (targetCell) targetCell.appendChild(token);
    });
}

function rollDice() {
    document.getElementById('roll-btn').disabled = true;
    socket.emit('rollDice', currentRoomId);
}

function animateDice(result) {
    const cube = document.getElementById('dice-cube');
    if (!cube) return;
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
});

socket.on('turnUpdate', (data) => {
    const isMyTurn = data.activePlayerId === myId;
    const info = document.getElementById('turn-info');
    if (info) info.innerText = isMyTurn ? '⚡ Your Turn!' : `${data.activePlayerName}'s Turn`;
    const btn = document.getElementById('roll-btn');
    if (btn) btn.disabled = !isMyTurn;
});

socket.on('startDuel', (data) => {
    const question = document.getElementById('duel-question');
    if (question) question.innerText = data.riddle.q;
    const optsBox = document.getElementById('duel-options');
    if (optsBox) {
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
    }
    const overlay = document.getElementById('duel-overlay');
    if (overlay) overlay.classList.remove('hidden');
    let timeLeft = 15;
    const timer = document.getElementById('duel-timer');
    if (timer) timer.innerText = timeLeft;
    const interval = setInterval(() => {
        timeLeft--;
        if (timer) timer.innerText = timeLeft;
        if (timeLeft <= 0) clearInterval(interval);
    }, 1000);
});

socket.on('duelEnded', (data) => {
    const overlay = document.getElementById('duel-overlay');
    if (overlay) overlay.classList.add('hidden');
    showToast(data.msg);
    updateBoardTokens(data.players);
    gameState.players = data.players;
});

socket.on('gameEnded', (data) => {
    showToast('🏆 ' + data.msg);
    setTimeout(() => handleLeaveGame(), 3000);
});

function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

socket.on('connect', () => console.log('Connected'));
socket.on('disconnect', () => console.log('Disconnected'));
