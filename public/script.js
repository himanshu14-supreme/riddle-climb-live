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
    {r:0, c:6}, {r:1, c:6}, {r:2, c:6}, {r:3, c:6}, {r:4, c:6}, {r:5, c:6}, {r:6, c:6},
    {r:6, c:5}, {r:6, c:4}, {r:6, c:3}, {r:6, c:2}, {r:6, c:1}, {r:6, c:0},
    {r:5, c:0}, {r:4, c:0}, {r:3, c:0}, {r:2, c:0}, {r:1, c:0}, {r:0, c:0}, {r:0, c:1},
    {r:0, c:2}, {r:0, c:3}, {r:0, c:4}, {r:0, c:5}, {r:0, c:7}, {r:0, c:8},
    {r:1, c:8}, {r:2, c:8}, {r:3, c:8}, {r:4, c:8}, {r:5, c:8}, {r:6, c:8}, {r:6, c:9}, 
    {r:6, c:10}, {r:6, c:11}, {r:6, c:12}, {r:6, c:13}, {r:6, c:14}, {r:7, c:14},
    {r:8, c:14}, {r:9, c:14}, {r:10, c:14}, {r:11, c:14}, {r:12, c:14}, {r:13, c:14}, {r:14, c:14},
    {r:14, c:13}, {r:14, c:12}, {r:14, c:11}, {r:14, c:10}, {r:14, c:9}, {r:14, c:8}
];

const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47];

let currentUser = { 
    isLoggedIn: false, 
    name: "Guest", 
    username: "",
    coins: 600, 
    xp: 0, 
    inventory: ['avatar_default', 'ability_none'], 
    selectedAvatar: 'avatar_default', 
    selectedAbility: 'ability_none' 
};

let currentRoomId = null;
let isHost = false;
let myId = null;
let gameState = { players: [], gameStarted: false };

function goToPage(pageName) {
    console.log('📍 Going to page:', pageName);
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`page-${pageName}`);
    if (page) {
        page.classList.add('active');
        console.log('✅ Page active:', pageName);
    } else {
        console.error('❌ Page not found:', pageName);
    }
    
    if (pageName === 'shop') renderShop();
    if (pageName === 'vault') renderVault();
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
    const msgEl = document.getElementById('login-message');
    
    if (!username || !password) {
        if (msgEl) msgEl.innerText = 'Please fill in all fields';
        return;
    }
    
    socket.emit('auth_login', { user: username, pass: password });
}

function handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirm = document.getElementById('register-confirm').value.trim();
    const msgEl = document.getElementById('register-message');
    
    if (!username || !password || !confirm) {
        if (msgEl) msgEl.innerText = 'Please fill in all fields';
        return;
    }
    
    if (password !== confirm) {
        if (msgEl) msgEl.innerText = 'Passwords do not match';
        return;
    }
    
    if (password.length < 4) {
        if (msgEl) msgEl.innerText = 'Password must be at least 4 characters';
        return;
    }
    
    socket.emit('auth_register', { user: username, pass: password });
}

function handleGuest() {
    const name = document.getElementById('guest-name').value.trim() || `Guest_${Math.floor(Math.random()*9999)}`;
    const msgEl = document.getElementById('guest-message');
    
    if (!name) {
        if (msgEl) msgEl.innerText = 'Please enter a nickname';
        return;
    }
    
    currentUser.name = name;
    currentUser.isLoggedIn = false;
    currentUser.username = "";
    goToPage('lobby');
    updateProfileUI();
}

function handleLogout() {
    currentUser = { 
        isLoggedIn: false, 
        name: "Guest", 
        username: "",
        coins: 600, 
        xp: 0, 
        inventory: ['avatar_default', 'ability_none'], 
        selectedAvatar: 'avatar_default', 
        selectedAbility: 'ability_none' 
    };
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-message').innerText = '';
    goToPage('auth');
}

socket.on('auth_success', (data) => {
    currentUser = { ...currentUser, ...data, isLoggedIn: true };
    goToPage('lobby');
    updateProfileUI();
    showToast('✅ Welcome back, ' + data.username + '!');
});

socket.on('auth_error', (msg) => {
    showToast('❌ ' + msg);
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
        card.innerHTML = `
            <div class="icon">${item.icon}</div>
            <h4>${item.name}</h4>
            <p>${item.desc}</p>
            <div class="price">💰 ${item.price}</div>
            <button class="btn ${isOwned ? 'btn-secondary' : 'btn-primary'}" ${isOwned ? 'disabled' : ''} onclick="buyItem('${item.id}', ${item.price})">
                ${isOwned ? '✓ Owned' : 'Buy'}
            </button>
        `;
        box.appendChild(card);
    });
}

function renderVault() {
    const box = document.getElementById('vault-items');
    if (!box) return;
    box.innerHTML = '';
    
    const ownedItems = SHOP_ITEMS.filter(item => currentUser.inventory.includes(item.id));
    
    if (ownedItems.length === 0) {
        box.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-dim);">No items yet! Visit the Armory.</p>';
        return;
    }
    
    ownedItems.forEach(item => {
        const isEquipped = currentUser.selectedAvatar === item.id || currentUser.selectedAbility === item.id;
        const card = document.createElement('div');
        card.className = 'shop-item';
        card.innerHTML = `
            <div class="icon">${item.icon}</div>
            <h4>${item.name}</h4>
            <p>${item.desc}</p>
            <button class="btn ${isEquipped ? 'btn-primary' : 'btn-secondary'}" onclick="equipItem('${item.id}', '${item.type}')">
                ${isEquipped ? '✓ Equipped' : 'Equip'}
            </button>
        `;
        box.appendChild(card);
    });
}

function buyItem(id, price) {
    if (currentUser.coins < price) {
        showToast('❌ Not enough coins!');
        return;
    }
    currentUser.coins -= price;
    currentUser.inventory.push(id);
    socket.emit('save_data', currentUser);
    updateProfileUI();
    renderShop();
    renderVault();
    showToast('✅ Item purchased!');
}

function equipItem(id, type) {
    if (type === 'avatar') currentUser.selectedAvatar = id;
    if (type === 'ability') currentUser.selectedAbility = id;
    socket.emit('save_data', currentUser);
    updateProfileUI();
    renderVault();
    showToast('✅ Item equipped!');
}

function handleCreateRoom() {
    const roomName = document.getElementById('room-name').value.trim();
    console.log('📍 Create room button clicked');
    console.log('📍 Room name:', roomName);
    console.log('📍 Socket connected?', socket.connected);
    console.log('📍 Socket ID:', socket.id);
    
    if (!socket.connected) {
        console.error('❌ Socket not connected!');
        showToast('❌ Not connected to server!');
        return;
    }
    
    console.log('📍 Emitting createRoom event...');
    socket.emit('createRoom', { name: roomName });
    console.log('✅ createRoom event emitted');
}

function handleJoinRoom() {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    const msgEl = document.getElementById('join-message');
    
    if (!code) {
        if (msgEl) msgEl.innerText = 'Please enter a room code';
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
    console.log('✅ ROOM CREATED event received:', data);
    currentRoomId = data.roomId;
    isHost = true;
    myId = socket.id;
    document.getElementById('display-room-code').innerText = currentRoomId;
    document.getElementById('game-room-code').innerText = currentRoomId;
    document.getElementById('host-badge').innerText = '(Host)';
    document.getElementById('start-game-section').classList.remove('hidden');
    showToast('✅ Room created! Code: ' + currentRoomId);
    goToPage('waiting');
});

socket.on('roomJoined', (data) => {
    console.log('✅ ROOM JOINED event received:', data);
    currentRoomId = data.roomId;
    isHost = data.isHost;
    myId = socket.id;
    document.getElementById('display-room-code').innerText = currentRoomId;
    document.getElementById('game-room-code').innerText = currentRoomId;
    if (!isHost) {
        document.getElementById('start-game-section').classList.add('hidden');
        document.getElementById('host-badge').innerText = '';
    }
    showToast('✅ Joined room: ' + currentRoomId);
    goToPage('waiting');
});

socket.on('updatePlayers', (players) => {
    console.log('📍 updatePlayers received:', players);
    gameState.players = players;
    const list = document.getElementById('waiting-players-list');
    if (list) {
        list.innerHTML = players.map(p => `
            <div class="player-item ${p.id === myId ? 'active' : ''}">
                <div class="player-name">
                    <span class="player-avatar-small">${SHOP_ITEMS.find(sh => sh.id === p.selectedAvatar)?.icon || '👤'}</span>
                    <span>${p.name}${p.id === myId ? ' (You)' : ''}</span>
                </div>
            </div>
        `).join('');
    }
    const count = document.getElementById('player-count');
    if (count) count.innerText = players.length;
});

function handleStartGame() {
    if (isHost) {
        console.log('📍 Starting game in room:', currentRoomId);
        socket.emit('startGame', currentRoomId);
    }
}

socket.on('gameStarted', () => {
    console.log('🎮 Game started!');
    buildLudoBoard();
    goToPage('game');
    document.getElementById('roll-btn').disabled = false;
    showToast('🎮 Game Started!');
});

function buildLudoBoard() {
    const board = document.getElementById('ludo-board');
    if (!board) return;
    board.innerHTML = '';
    
    createHomeYard(board, 'red', 1, 7, 1, 7);
    createHomeYard(board, 'green', 10, 16, 1, 7);
    createHomeYard(board, 'yellow', 10, 16, 10, 16);
    createHomeYard(board, 'blue', 1, 7, 10, 16);
    
    LUDO_PATH.forEach((pos, idx) => {
        const cell = document.createElement('div');
        cell.className = `path path-${idx}`;
        
        const innerCell = document.createElement('div');
        innerCell.className = 'cell';
        innerCell.id = `cell-${idx}`;
        
        if (SAFE_ZONES.includes(idx)) {
            innerCell.classList.add('safe');
            innerCell.innerHTML = '★';
        }
        
        cell.appendChild(innerCell);
        board.appendChild(cell);
    });
    
    createHomeStretch(board, 'red', 5);
    createHomeStretch(board, 'green', 5);
    createHomeStretch(board, 'yellow', 5);
    createHomeStretch(board, 'blue', 5);
    
    const center = document.createElement('div');
    center.className = 'center-home';
    for (let i = 0; i < 4; i++) {
        const part = document.createElement('div');
        part.className = `home-part home-${['red', 'green', 'yellow', 'blue'][i]}`;
        center.appendChild(part);
    }
    board.appendChild(center);
}

function createHomeYard(board, color, colStart, colEnd, rowStart, rowEnd) {
    const yard = document.createElement('div');
    yard.className = `yard yard-${color}`;
    yard.style.gridColumn = `${colStart} / ${colEnd}`;
    yard.style.gridRow = `${rowStart} / ${rowEnd}`;
    
    const yardBox = document.createElement('div');
    yardBox.className = 'yard-box';
    yardBox.id = `${color}-base`;
    
    for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        slot.className = `yard-slot yard-slot-${color}`;
        yardBox.appendChild(slot);
    }
    
    yard.appendChild(yardBox);
    board.appendChild(yard);
}

function createHomeStretch(board, color, count) {
    for (let i = 0; i < count; i++) {
        const cell = document.createElement('div');
        cell.className = `path home-stretch-${color}-${i}`;
        
        const innerCell = document.createElement('div');
        innerCell.className = `cell bg-${color}`;
        innerCell.id = `${color}-home-${i}`;
        
        cell.appendChild(innerCell);
        board.appendChild(cell);
    }
}

function updateBoardTokens(players) {
    document.querySelectorAll('.token').forEach(t => t.remove());
    const playerColors = ['#dc2626', '#ca8a04', '#1d4ed8', '#059669'];
    
    players.forEach((player, idx) => {
        const token = document.createElement('div');
        token.className = `token ${player.stunned ? 'stunned' : ''}`;
        token.style.backgroundColor = playerColors[idx % 4];
        token.innerHTML = '👤';
        
        let targetCell;
        
        if (player.position === -1) {
            targetCell = document.getElementById(`${['red', 'green', 'yellow', 'blue'][idx]}-base`);
        } else if (player.position >= LUDO_PATH.length) {
            targetCell = document.querySelector('.center-home');
        } else if (player.position < LUDO_PATH.length) {
            targetCell = document.getElementById(`cell-${player.position}`);
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
        cube.style.transform = `translateZ(-60px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
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

socket.on('connect', () => {
    console.log('✅ Socket connected:', socket.id);
});

socket.on('disconnect', () => {
    console.log('❌ Socket disconnected');
});

socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
    showToast('Connection error');
});
