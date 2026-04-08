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

const LUDO_COLORS = ['#dc2626', '#059669', '#ca8a04', '#1d4ed8']; // Red, Green, Yellow, Blue

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
// These arrays perfectly map a player's step count (0 to 56) to the HTML element IDs.
const PLAYER_PATHS = [
    // P1 (Red): Starts at global 0, goes to 50, then red home stretch
    [...Array.from({length: 51}, (_, i) => `cell-${i}`), 'red-home-0', 'red-home-1', 'red-home-2', 'red-home-3', 'red-home-4', 'center'],
    // P2 (Green): Starts at global 13, wraps around to 11, then green home stretch
    [...Array.from({length: 51}, (_, i) => `cell-${(i + 13) % 52}`), 'green-home-0', 'green-home-1', 'green-home-2', 'green-home-3', 'green-home-4', 'center'],
    // P3 (Yellow): Starts at global 26, wraps around to 24, then yellow home stretch
    [...Array.from({length: 51}, (_, i) => `cell-${(i + 26) % 52}`), 'yellow-home-0', 'yellow-home-1', 'yellow-home-2', 'yellow-home-3', 'yellow-home-4', 'center'],
    // P4 (Blue): Starts at global 39, wraps around to 37, then blue home stretch
    [...Array.from({length: 51}, (_, i) => `cell-${(i + 39) % 52}`), 'blue-home-0', 'blue-home-1', 'blue-home-2', 'blue-home-3', 'blue-home-4', 'center']
];

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
    
    if (!username || !password) return messageEl.textContent = 'Please fill in all fields!';
    socket.emit('auth_login', { username, password });
}

function handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirm = document.getElementById('register-confirm').value.trim();
    const messageEl = document.getElementById('register-message');
    messageEl.textContent = '';
    
    if (!username || !password || !confirm) return messageEl.textContent = 'Please fill in all fields!';
    if (username.length < 3) return messageEl.textContent = 'Username must be 3+ characters!';
    if (password.length < 4) return messageEl.textContent = 'Password must be 4+ characters!';
    if (password !== confirm) return messageEl.textContent = 'Passwords do not match!';
    
    socket.emit('auth_register', { username, password });
}

function handleGuest() {
    const guestName = document.getElementById('guest-name').value.trim() || `Guest_${Math.floor(Math.random() * 9999)}`;
    const messageEl = document.getElementById('guest-message');
    messageEl.textContent = '';
    
    if (!guestName) return messageEl.textContent = 'Please enter a name!';
    
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
        isLoggedIn: false, name: "Guest", username: "", coins: 600, xp: 0,
        inventory: ['avatar_peasant', 'ability_none'], selectedAvatar: 'avatar_peasant', selectedAbility: 'ability_none'
    };
    pageHistory = [];
    goToPage('auth');
    
    document.querySelectorAll('input').forEach(input => input.value = '');
    showToast('Logged out successfully!');
}

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
            <div class="icon">${item.icon}</div><h4>${item.name}</h4><p>${item.desc}</p>
            <div class="price">💰 ${item.price}</div>
            <button class="btn ${isOwned ? 'btn-secondary' : 'btn-primary'}" ${isOwned ? 'disabled' : ''} 
                    onclick="buyItem('${item.id}', ${item.price})">${isOwned ? '✓ Owned' : 'Buy'}</button>`;
        container.appendChild(shopItem);
    });
}

function renderVault() {
    const container = document.getElementById('vault-items');
    container.innerHTML = '';
    const owned = SHOP_ITEMS.filter(i => currentUser.inventory.includes(i.id));
    
    if (owned.length === 0) return container.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-dim); text-align: center;">No items yet! Buy from the Armory.</p>';
    
    owned.forEach(item => {
        const isEquipped = currentUser.selectedAvatar === item.id || currentUser.selectedAbility === item.id;
        const vaultItem = document.createElement('div');
        vaultItem.className = 'shop-item';
        vaultItem.innerHTML = `
            <div class="icon">${item.icon}</div><h4>${item.name}</h4><p>${item.desc}</p>
            <button class="btn ${isEquipped ? 'btn-primary' : 'btn-secondary'}" onclick="equipItem('${item.id}', '${item.type}')">
                ${isEquipped ? '✓ Equipped' : 'Equip'}
            </button>`;
        container.appendChild(vaultItem);
    });
}

function buyItem(id, price) {
    if (currentUser.coins < price) return showToast('❌ Not enough coins!');
    currentUser.coins -= price;
    currentUser.inventory.push(id);
    if (currentUser.isLoggedIn) socket.emit('save_data', currentUser);
    updateProfileUI();
    renderShop();
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
    socket.emit('createRoom', { playerData: currentUser, roomName });
}

function handleJoinRoom() {
    const roomCode = document.getElementById('join-code').value.trim().toUpperCase();
    if (!roomCode) return document.getElementById('join-message').textContent = 'Please enter a room code!';
    socket.emit('joinRoom', { roomCode, playerData: currentUser });
}

socket.on('roomJoined', (data) => {
    gameState.currentRoom = data.roomId;
    gameState.isHost = data.isHost;
    gameState.myId = socket.id;
    gameState.players = data.gameState.players;
    
    document.getElementById('display-room-code').textContent = data.roomId;
    document.getElementById('start-game-section').classList.toggle('hidden', !data.isHost);
    if(data.isHost) document.getElementById('host-badge').textContent = '👑 HOST';
    
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
    
    gameState.players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        const avatar = SHOP_ITEMS.find(i => i.id === player.selectedAvatar)?.icon || '👤';
        playerItem.innerHTML = `<div class="player-name"><span class="player-avatar-small">${avatar}</span><span>${player.name}</span>${player.id === gameState.myId ? ' <span>(You)</span>' : ''}</div>`;
        list.appendChild(playerItem);
    });
}

function handleStartGame() {
    socket.emit('startGame', gameState.currentRoom);
}

socket.on('gameStarted', () => {
    gameState.state = 'PLAYING';
    goToPage('game');
    updateBoardTokens();
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

function updateBoardTokens() {
    document.querySelectorAll('.token').forEach(t => t.remove());
    const bases = ['red-base', 'green-base', 'yellow-base', 'blue-base'];
    
    gameState.players.forEach((player, idx) => {
        const token = document.createElement('div');
        token.className = `token ${player.stunned ? 'stunned' : ''}`;
        token.style.backgroundColor = LUDO_COLORS[idx];
        
        const avatar = SHOP_ITEMS.find(i => i.id === player.selectedAvatar)?.icon || '👤';
        token.innerHTML = avatar;
        
        let targetCell;
        if (player.position === -1) {
            targetCell = document.getElementById(bases[idx]);
        } else {
            const cellId = PLAYER_PATHS[idx][player.position];
            targetCell = cellId === 'center' ? document.querySelector('.center-home') : document.getElementById(cellId);
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
            <div class="player-name"><span class="player-avatar-small">${avatar}</span><span>${player.name} ${player.id === gameState.myId ? '(You)' : ''}</span></div>
            <span class="player-status">${statusEmoji} ${player.position === -1 ? 'Base' : player.position >= 56 ? 'Home' : player.position}</span>`;
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
    
    document.getElementById('duel-question').textContent = data.riddle.q;
    const optionsBox = document.getElementById('duel-options');
    optionsBox.innerHTML = '';
    
    data.riddle.options.forEach(opt => {
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

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('page-auth').classList.add('active');
});
