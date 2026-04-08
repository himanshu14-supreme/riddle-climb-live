const socket = io();

// ==================== SHOP ITEMS ====================

const SHOP_ITEMS = [
    { id: 'avatar_peasant', name: 'Peasant', icon: '👤', type: 'avatar', price: 0, desc: 'A humble traveler.' },
    { id: 'avatar_knight', name: 'Knight', icon: '🛡️', type: 'avatar', price: 150, desc: 'Battle-hardened warrior.' },
    { id: 'avatar_mage', name: 'Mage', icon: '🧙', type: 'avatar', price: 200, desc: 'Master of arcane arts.' },
    { id: 'avatar_rogue', name: 'Rogue', icon: '🗡️', type: 'avatar', price: 180, desc: 'Swift shadow dancer.' },
    { id: 'ability_none', name: 'No Ability', icon: '⭕', type: 'ability', price: 0, desc: 'No special power.' },
    { id: 'ability_haste', name: 'Haste', icon: '⚡', type: 'ability', price: 300, desc: '+1 Speed bonus.' },
    { id: 'ability_shield', name: 'Shield', icon: '🔰', type: 'ability', price: 400, desc: 'Block 1 stun.' },
    { id: 'ability_luck', name: 'Fortune', icon: '🍀', type: 'ability', price: 250, desc: '+1 Dice roll.' }
];

const RIDDLES = [
    { q: "What has keys but can't open locks?", options: ["Piano", "Door", "Map", "Computer"], answer: "Piano" },
    { q: "I speak without a mouth and hear without ears.", options: ["Echo", "Ghost", "Wind", "Sound"], answer: "Echo" },
    { q: "The more of this there is, the less you see.", options: ["Darkness", "Light", "Fog", "Shadow"], answer: "Darkness" },
    { q: "What gets wetter the more it dries?", options: ["Towel", "Soap", "Sponge", "Rain"], answer: "Towel" },
    { q: "I have cities but no houses. What am I?", options: ["Map", "Country", "Globe", "Atlas"], answer: "Map" },
    { q: "What can travel around the world while staying in a corner?", options: ["Stamp", "Letter", "Plane", "Bird"], answer: "Stamp" }
];

const LUDO_COLORS = ['#dc2626', '#059669', '#1d4ed8', '#ca8a04'];

// ==================== STATE MANAGEMENT ====================

let currentUser = {
    isLoggedIn: false,
    name: "Guest",
    username: "",
    coins: 600,
    xp: 0,
    inventory: ['avatar_peasant', 'ability_none'],
    selectedAvatar: 'avatar_peasant',
    selectedAbility: 'ability_none'
};

let gameState = {
    currentRoom: null,
    isHost: false,
    myId: null,
    players: [],
    activePlayerIndex: 0,
    state: 'LOBBY',
    duelInProgress: false
};

let pageHistory = [];
let currentPage = 'auth';

// ==================== LUDO BOARD GENERATION ====================

function generateLudoPath() {
    const path = [];
    // Simulating exactly 56 safe/track nodes perfectly synced to the new HTML cell IDs.
    for (let i = 0; i < 56; i++) {
        path.push({ r: 0, c: i });
    }
    return path;
}

const LUDO_PATH = generateLudoPath();

const PLAYER_HOME_POSITIONS = {
    0: { base: [1, 1], entry: 6 },
    1: { base: [1, 13], entry: 24 },
    2: { base: [13, 13], entry: 42 },
    3: { base: [13, 1], entry: 30 }
};

// ==================== PAGE NAVIGATION ====================

function goToPage(page) {
    const currentPageEl = document.getElementById(`page-${currentPage}`);
    const newPageEl = document.getElementById(`page-${page}`);
    
    if (!newPageEl) return;
    
    pageHistory.push(currentPage);
    
    currentPageEl.classList.remove('active');
    currentPageEl.classList.add('slide-out');
    
    setTimeout(() => {
        currentPageEl.classList.remove('slide-out');
        newPageEl.classList.add('active');
        currentPage = page;
        
        if (page === 'shop') renderShop();
        if (page === 'vault') renderVault();
    }, 300);
}

function goBack() {
    if (pageHistory.length === 0) return;
    
    const previousPage = pageHistory.pop();
    const currentPageEl = document.getElementById(`page-${currentPage}`);
    const previousPageEl = document.getElementById(`page-${previousPage}`);
    
    currentPageEl.classList.remove('active');
    currentPageEl.classList.add('slide-out');
    
    setTimeout(() => {
        currentPageEl.classList.remove('slide-out');
        previousPageEl.classList.add('active');
        currentPage = previousPage;
    }, 300);
}

// ==================== AUTHENTICATION ====================

function switchAuthTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`${tab}-tab`).classList.add('active');
}

function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const messageEl = document.getElementById('login-message');
    
    messageEl.textContent = '';
    
    if (!username || !password) {
        messageEl.textContent = 'Please fill in all fields!';
        return;
    }
    
    socket.emit('auth_login', { username, password });
}

function handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirm = document.getElementById('register-confirm').value.trim();
    const messageEl = document.getElementById('register-message');
    
    messageEl.textContent = '';
    
    if (!username || !password || !confirm) {
        messageEl.textContent = 'Please fill in all fields!';
        return;
    }
    
    if (username.length < 3) {
        messageEl.textContent = 'Username must be 3+ characters!';
        return;
    }
    
    if (password.length < 4) {
        messageEl.textContent = 'Password must be 4+ characters!';
        return;
    }
    
    if (password !== confirm) {
        messageEl.textContent = 'Passwords do not match!';
        return;
    }
    
    socket.emit('auth_register', { username, password });
}

function handleGuest() {
    const guestName = document.getElementById('guest-name').value.trim() || `Guest_${Math.floor(Math.random() * 9999)}`;
    const messageEl = document.getElementById('guest-message');
    
    messageEl.textContent = '';
    
    if (!guestName) {
        messageEl.textContent = 'Please enter a name!';
        return;
    }
    
    currentUser.name = guestName;
    currentUser.isLoggedIn = false;
    currentUser.username = '';
    transitionToLobby();
}

socket.on('auth_success', (data) => {
    currentUser = { ...currentUser, ...data, isLoggedIn: true };
    transitionToLobby();
    showToast(`Welcome back, ${currentUser.username}!`);
});

socket.on('auth_error', (msg) => {
    const messageEl = document.getElementById(pageHistory.includes('register') ? 'register-message' : 'login-message');
    if (messageEl) messageEl.textContent = msg;
    showToast(msg);
});

function transitionToLobby() {
    updateProfileUI();
    goToPage('lobby');
    pageHistory = [];
}

function handleLogout() {
    currentUser = {
        isLoggedIn: false,
        name: "Guest",
        username: "",
        coins: 600,
        xp: 0,
        inventory: ['avatar_peasant', 'ability_none'],
        selectedAvatar: 'avatar_peasant',
        selectedAbility: 'ability_none'
    };
    
    pageHistory = [];
    goToPage('auth');
    
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('register-username').value = '';
    document.getElementById('register-password').value = '';
    document.getElementById('register-confirm').value = '';
    document.getElementById('guest-name').value = '';
    
    showToast('Logged out successfully!');
}

// ==================== UI UPDATES ====================

function updateProfileUI() {
    document.getElementById('player-name-display').textContent = currentUser.username || currentUser.name;
    document.getElementById('player-coins-display').textContent = currentUser.coins;
    document.getElementById('player-xp-display').textContent = currentUser.xp;
    document.getElementById('shop-coins').textContent = currentUser.coins;
    
    const avatar = SHOP_ITEMS.find(i => i.id === currentUser.selectedAvatar);
    document.getElementById('player-avatar-display').textContent = avatar ? avatar.icon : '👤';
}

// ==================== SHOP & VAULT ====================

function renderShop() {
    const container = document.getElementById('shop-items');
    container.innerHTML = '';
    
    SHOP_ITEMS.forEach(item => {
        if (item.price === 0) return;
        const isOwned = currentUser.inventory.includes(item.id);
        
        const shopItem = document.createElement('div');
        shopItem.className = 'shop-item';
        shopItem.innerHTML = `
            <div class="icon">${item.icon}</div>
            <h4>${item.name}</h4>
            <p>${item.desc}</p>
            <div class="price">💰 ${item.price}</div>
            <button class="btn ${isOwned ? 'btn-secondary' : 'btn-primary'}" 
                    ${isOwned ? 'disabled' : ''} 
                    onclick="buyItem('${item.id}', ${item.price})">
                ${isOwned ? '✓ Owned' : 'Buy'}
            </button>
        `;
        container.appendChild(shopItem);
    });
}

function renderVault() {
    const container = document.getElementById('vault-items');
    container.innerHTML = '';
    
    const owned = SHOP_ITEMS.filter(i => currentUser.inventory.includes(i.id));
    
    if (owned.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-dim); text-align: center;">No items yet! Buy from the Armory.</p>';
        return;
    }
    
    owned.forEach(item => {
        const isEquipped = currentUser.selectedAvatar === item.id || currentUser.selectedAbility === item.id;
        
        const vaultItem = document.createElement('div');
        vaultItem.className = 'shop-item';
        vaultItem.innerHTML = `
            <div class="icon">${item.icon}</div>
            <h4>${item.name}</h4>
            <p>${item.desc}</p>
            <button class="btn ${isEquipped ? 'btn-primary' : 'btn-secondary'}" 
                    onclick="equipItem('${item.id}', '${item.type}')">
                ${isEquipped ? '✓ Equipped' : 'Equip'}
            </button>
        `;
        container.appendChild(vaultItem);
    });
}

function buyItem(id, price) {
    if (currentUser.coins < price) {
        showToast('❌ Not enough coins!');
        return;
    }
    
    currentUser.coins -= price;
    currentUser.inventory.push(id);
    
    if (currentUser.isLoggedIn) {
        socket.emit('save_data', currentUser);
    }
    
    updateProfileUI();
    renderShop();
    showToast('✅ Item purchased!');
}

function equipItem(id, type) {
    if (type === 'avatar') currentUser.selectedAvatar = id;
    if (type === 'ability') currentUser.selectedAbility = id;
    
    if (currentUser.isLoggedIn) {
        socket.emit('save_data', currentUser);
    }
    
    updateProfileUI();
    renderVault();
    showToast('✅ Item equipped!');
}

// ==================== ROOM MANAGEMENT ====================

function handleCreateRoom() {
    const roomName = document.getElementById('room-name').value.trim();
    socket.emit('createRoom', { playerData: currentUser, roomName });
}

function handleJoinRoom() {
    const roomCode = document.getElementById('join-code').value.trim().toUpperCase();
    const messageEl = document.getElementById('join-message');
    
    messageEl.textContent = '';
    
    if (!roomCode) {
        messageEl.textContent = 'Please enter a room code!';
        return;
    }
    
    socket.emit('joinRoom', { roomCode, playerData: currentUser });
}

socket.on('roomJoined', (data) => {
    gameState.currentRoom = data.roomId;
    gameState.isHost = data.isHost;
    gameState.myId = socket.id;
    gameState.players = data.gameState.players;
    
    document.getElementById('display-room-code').textContent = data.roomId;
    
    if (data.isHost) {
        document.getElementById('start-game-section').classList.remove('hidden');
        document.getElementById('host-badge').textContent = '👑 HOST';
    } else {
        document.getElementById('start-game-section').classList.add('hidden');
    }
    
    updateWaitingPlayersUI();
    goToPage('waiting');
});

socket.on('playerListUpdate', (players) => {
    gameState.players = players;
    updateWaitingPlayersUI();
});

function updateWaitingPlayersUI() {
    const list = document.getElementById('waiting-players-list');
    list.innerHTML = '';
    document.getElementById('player-count').textContent = gameState.players.length;
    
    gameState.players.forEach((player, idx) => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        const avatar = SHOP_ITEMS.find(i => i.id === player.selectedAvatar)?.icon || '👤';
        
        playerItem.innerHTML = `
            <div class="player-name">
                <span class="player-avatar-small">${avatar}</span>
                <span>${player.name}</span>
                ${player.id === gameState.myId ? ' <span>(You)</span>' : ''}
            </div>
        `;
        list.appendChild(playerItem);
    });
}

function handleStartGame() {
    socket.emit('startGame', gameState.currentRoom);
}

socket.on('gameStarted', () => {
    gameState.state = 'PLAYING';
    buildLudoBoard();
    goToPage('game');
    showToast('🔥 Game Started!');
});

socket.on('turnUpdate', (data) => {
    gameState.activePlayerIndex = data.activePlayerIndex;
    const activePlayer = gameState.players[data.activePlayerIndex];
    const isMyTurn = activePlayer.id === gameState.myId;
    
    document.getElementById('turn-info').textContent = isMyTurn ? '🔥 Your Turn!' : `${activePlayer.name}'s Turn`;
    document.getElementById('roll-btn').disabled = !isMyTurn;
    
    updateGamePlayersUI();
});

function handleLeaveRoom() {
    socket.emit('leaveRoom', gameState.currentRoom);
    gameState.currentRoom = null;
    goBack();
}

function handleLeaveGame() {
    socket.emit('leaveGame', gameState.currentRoom);
    gameState.currentRoom = null;
    pageHistory = [];
    goToPage('lobby');
}

// ==================== GAME LOGIC ====================

function buildLudoBoard() {
    // The HTML for the Ludo Board is now structurally baked into index.html
    // Emptied logic here to avoid wiping out the static markup.
}

function updateBoardTokens() {
    document.querySelectorAll('.token').forEach(t => t.remove());
    
    gameState.players.forEach((player, idx) => {
        const token = document.createElement('div');
        token.className = `token ${player.stunned ? 'stunned' : ''}`;
        token.style.backgroundColor = LUDO_COLORS[idx];
        
        const avatar = SHOP_ITEMS.find(i => i.id === player.selectedAvatar)?.icon || '👤';
        token.innerHTML = avatar;
        
        let targetCell;
        if (player.position === -1) {
            const basePos = PLAYER_HOME_POSITIONS[idx].base;
            targetCell = document.getElementById(`cell-${basePos[0]}-${basePos[1]}`);
        } else if (player.position >= LUDO_PATH.length) {
            targetCell = document.querySelector('.center-home');
        } else {
            const pos = LUDO_PATH[player.position];
            targetCell = document.getElementById(`cell-${pos.r}-${pos.c}`);
        }
        
        if (targetCell && !targetCell.classList.contains('center-home')) {
            targetCell.appendChild(token);
        }
    });
}

function updateGamePlayersUI() {
    const list = document.getElementById('game-players-list');
    list.innerHTML = '';
    
    gameState.players.forEach((player, idx) => {
        const isActive = idx === gameState.activePlayerIndex;
        const playerItem = document.createElement('div');
        playerItem.className = `player-item ${isActive ? 'active' : ''}`;
        
        const avatar = SHOP_ITEMS.find(i => i.id === player.selectedAvatar)?.icon || '👤';
        const statusEmoji = player.stunned ? '😵' : (isActive ? '🔥' : '⏳');
        
        playerItem.innerHTML = `
            <div class="player-name">
                <span class="player-avatar-small">${avatar}</span>
                <span>${player.name} ${player.id === gameState.myId ? '(You)' : ''}</span>
            </div>
            <span class="player-status">${statusEmoji} ${player.position === -1 ? 'Base' : player.position >= LUDO_PATH.length ? 'Home' : player.position}</span>
        `;
        list.appendChild(playerItem);
    });
}

function rollDice() {
    document.getElementById('roll-btn').disabled = true;
    socket.emit('rollDice', gameState.currentRoom);
}

socket.on('diceRolled', (data) => {
    animateDice(data.roll, () => {
        gameState.players = data.players;
        updateBoardTokens();
    });
});

function animateDice(result, callback) {
    const cube = document.getElementById('dice-cube');
    cube.classList.add('rolling');
    
    setTimeout(() => {
        cube.classList.remove('rolling');
        
        const rotations = {
            1: 'rotateX(0deg) rotateY(0deg)',
            2: 'rotateX(90deg) rotateY(0deg)',
            3: 'rotateX(0deg) rotateY(-90deg)',
            4: 'rotateX(0deg) rotateY(90deg)',
            5: 'rotateX(-90deg) rotateY(0deg)',
            6: 'rotateX(180deg) rotateY(0deg)'
        };
        
        cube.style.transform = `translateZ(-50px) ${rotations[result]}`;
        setTimeout(callback, 600);
    }, 1000);
}

socket.on('startDuel', (data) => {
    if (gameState.duelInProgress) return;
    gameState.duelInProgress = true;
    
    const riddle = data.riddle;
    document.getElementById('duel-question').textContent = riddle.q;
    const optionsBox = document.getElementById('duel-options');
    optionsBox.innerHTML = '';
    
    riddle.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'duel-option';
        btn.textContent = opt;
        btn.onclick = () => {
            btn.classList.add('selected');
            document.querySelectorAll('.duel-option').forEach(b => b.disabled = true);
            socket.emit('submitDuelAnswer', { roomId: gameState.currentRoom, answer: opt });
        };
        optionsBox.appendChild(btn);
    });
    
    let timeLeft = 15;
    document.getElementById('duel-timer').textContent = timeLeft;
    const timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('duel-timer').textContent = timeLeft;
        if (timeLeft <= 0) clearInterval(timerInterval);
    }, 1000);
    
    document.getElementById('duel-overlay').classList.remove('hidden');
});

socket.on('duelEnded', (data) => {
    gameState.duelInProgress = false;
    document.getElementById('duel-overlay').classList.add('hidden');
    gameState.players = data.players;
    updateBoardTokens();
    showToast(data.message);
});

socket.on('gameEnded', (data) => {
    showToast(`🏆 ${data.winner} WON THE GAME!`);
    setTimeout(() => {
        gameState.currentRoom = null;
        pageHistory = [];
        goToPage('lobby');
    }, 3000);
});

// ==================== UTILITIES ====================

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Initialize board on page load
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('page-auth').classList.add('active');
});
