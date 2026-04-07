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

// ==================== PAGE NAVIGATION ====================
function goToPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`page-${pageName}`);
    if (page) page.classList.add('active');
    
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

// ==================== AUTHENTICATION ====================
function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const msgEl = document.getElementById('login-message');
    
    if (!username || !password) {
        if (msgEl) msgEl.innerText = 'Please fill in all fields';
        return;
    }
    
    console.log('Logging in:', username);
    if (msgEl) msgEl.innerText = 'Logging in...';
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
    
    console.log('Registering:', username);
    if (msgEl) msgEl.innerText = 'Registering...';
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
    console.log('Logged in as guest:', name);
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
    console.log('Auth success:', data);
    currentUser = { ...currentUser, ...data, isLoggedIn: true };
    goToPage('lobby');
    updateProfileUI();
    showToast('✅ Welcome back, ' + data.username + '!');
});

socket.on('auth_error', (msg) => {
    console.log('Auth error:', msg);
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

// ==================== SHOP & VAULT ====================
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
    if (currentUser.isLoggedIn) socket.emit('save_data', currentUser);
    updateProfileUI();
    renderShop();
    renderVault();
    showToast('✅ Item purchased!');
}

function equipItem(id, type) {
    if (type === 'avatar') currentUser.selectedAvatar = id;
    if (type === 'ability') currentUser.selectedAbility = id;
    if (currentUser.isLoggedIn) socket.emit('save_data', currentUser);
    updateProfileUI();
    renderVault();
    showToast('✅ Item equipped!');
}

// ==================== ROOM MANAGEMENT ====================
function handleCreateRoom() {
    const roomName = document.getElementById('room-name').value.trim();
    console.log('Creating room');
    socket.emit('createRoom', { name: roomName });
}

function handleJoinRoom() {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    const msgEl = document.getElementById('join-message');
    
    if (!code) {
        if (msgEl) msgEl.innerText = 'Please enter a room code';
        return;
    }
    
    console.log('Joining room:', code);
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
    console.log('Room created:', data);
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
    console.log('Room joined:', data);
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
    console.log('Players updated:', players);
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
        console.log('Starting game');
        socket.emit('startGame', currentRoomId);
    }
}

socket.on('gameStarted', () => {
    console.log('Game started');
    buildLudoBoard();
    goToPage('game');
    document.getElementById('roll-btn').disabled = false;
    showToast('🎮 Game Started!');
});

// ==================== BOARD & GAME ====================
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
                cell.innerHTML = '🏁';
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
            targetCell = document.getElementById(`cell-${2 + idx * 6}-${2 + (idx % 2) * 10}`);
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
    document.getElementById
