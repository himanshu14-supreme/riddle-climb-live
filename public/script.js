const socket = io();

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
const LUDO_COLOR_NAMES = ['Red', 'Green', 'Blue', 'Yellow'];

let currentUser = { isLoggedIn: false, name: "Guest", coins: 600, xp: 0, inventory: ['avatar_peasant', 'ability_none'], selectedAvatar: 'avatar_peasant', selectedAbility: 'ability_none' };
let currentRoomId = null;
let isHost = false;
let myId = null;
let gameState = { players: [], activePlayerIndex: 0, state: 'LOBBY' };
let duelInProgress = false;

const LUDO_PATH = generateLudoPath();
const PLAYER_HOME_POSITIONS = {
    0: { base: [1, 1], entry: 6 },      // Red
    1: { base: [1, 13], entry: 24 },    // Green
    2: { base: [13, 13], entry: 42 },   // Blue
    3: { base: [13, 1], entry: 30 }     // Yellow
};

function generateLudoPath() {
    const path = [];
    
    // Starting from top middle and going around clockwise
    for (let i = 0; i < 6; i++) path.push({ r: i, c: 6 });      // Top straight down
    for (let i = 7; i < 14; i++) path.push({ r: 6, c: i });     // Top right horizontal
    for (let i = 6; i >= 0; i--) path.push({ r: i, c: 14 });    // Right side up
    
    for (let i = 1; i < 6; i++) path.push({ r: 0, c: 14 - i }); // Top left horizontal
    for (let i = 1; i < 6; i++) path.push({ r: i, c: 8 });      // Left side down
    
    for (let i = 7; i < 14; i++) path.push({ r: 6, c: i });     // Middle right horizontal
    for (let i = 7; i < 14; i++) path.push({ r: i, c: 6 });     // Bottom straight down
    
    for (let i = 7; i < 14; i++) path.push({ r: 14, c: i });    // Bottom horizontal
    for (let i = 13; i >= 7; i--) path.push({ r: i, c: 14 });   // Right side up again
    
    for (let i = 13; i >= 7; i--) path.push({ r: 14, c: i });   // Bottom horizontal back
    for (let i = 13; i >= 7; i--) path.push({ r: i, c: 8 });    // Left side down again
    
    for (let i = 13; i >= 0; i--) path.push({ r: 8, c: i });    // Middle left horizontal
    
    return path.slice(0, 52);
}

// ========== AUTHENTICATION ==========

function playGuest() {
    const name = document.getElementById('guest-name').value.trim() || `Guest_${Math.floor(Math.random() * 9999)}`;
    currentUser = { ...currentUser, name, isLoggedIn: false };
    transitionToLobby();
}

function login() {
    const user = document.getElementById('auth-user').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    if (!user || !pass) return showToast("Fill in all fields!");
    socket.emit('auth_login', { user, pass });
}

function register() {
    const user = document.getElementById('auth-user').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    if (!user || !pass) return showToast("Fill in all fields!");
    if (pass.length < 4) return showToast("Password too short!");
    socket.emit('auth_register', { user, pass });
}

socket.on('auth_success', (data) => {
    currentUser = { ...currentUser, ...data, isLoggedIn: true };
    transitionToLobby();
    showToast(`Welcome back, ${currentUser.name}!`);
});

socket.on('auth_error', (msg) => {
    document.getElementById('auth-message').innerText = msg;
    showToast(msg);
});

function transitionToLobby() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    updateProfileUI();
}

function updateProfileUI() {
    document.getElementById('player-name').innerText = currentUser.name;
    document.getElementById('player-coins').innerText = currentUser.coins;
    document.getElementById('player-xp').innerText = currentUser.xp;
    
    const avatar = SHOP_ITEMS.find(i => i.id === currentUser.selectedAvatar);
    document.getElementById('player-avatar').innerText = avatar ? avatar.icon : '👤';
}

// ========== SHOP & VAULT ==========

function openModal(id) {
    if (id === 'shop-modal') renderShop();
    if (id === 'vault-modal') renderVault();
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function renderShop() {
    const container = document.getElementById('shop-items-container');
    container.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        if (item.price === 0) return;
        const isOwned = currentUser.inventory.includes(item.id);
        container.innerHTML += `
            <div class="shop-card">
                <div class="icon">${item.icon}</div>
                <h4>${item.name}</h4>
                <p>${item.desc}</p>
                <p style="color: var(--accent-gold); font-weight: bold;">💰 ${item.price}</p>
                <button class="menu-btn ${isOwned ? '' : 'join-variant'}" ${isOwned ? 'disabled' : ''} onclick="buyItem('${item.id}', ${item.price})">
                    ${isOwned ? '✓ Owned' : 'Buy'}
                </button>
            </div>
        `;
    });
}

function renderVault() {
    const container = document.getElementById('vault-items');
    container.innerHTML = '';
    const owned = SHOP_ITEMS.filter(i => currentUser.inventory.includes(i.id));
    if (owned.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-dim);">No items yet!</p>';
        return;
    }
    owned.forEach(item => {
        const isEquipped = currentUser.selectedAvatar === item.id || currentUser.selectedAbility === item.id;
        container.innerHTML += `
            <div class="shop-card">
                <div class="icon">${item.icon}</div>
                <h4>${item.name}</h4>
                <p>${item.desc}</p>
                <button class="menu-btn ${isEquipped ? 'join-variant' : ''}" onclick="equipItem('${item.id}', '${item.type}')">
                    ${isEquipped ? '✓ Equipped' : 'Equip'}
                </button>
            </div>
        `;
    });
}

function buyItem(id, price) {
    if (currentUser.coins < price) return showToast("Not enough coins!");
    currentUser.coins -= price;
    currentUser.inventory.push(id);
    if (currentUser.isLoggedIn) socket.emit('save_data', currentUser);
    updateProfileUI();
    renderShop();
    showToast("✓ Item purchased!");
}

function equipItem(id, type) {
    if (type === 'avatar') currentUser.selectedAvatar = id;
    if (type === 'ability') currentUser.selectedAbility = id;
    if (currentUser.isLoggedIn) socket.emit('save_data', currentUser);
    updateProfileUI();
    renderVault();
    showToast("✓ Item equipped!");
}

// ========== GAME LOGIC ==========

function hostGame() {
    socket.emit('createRoom', { playerData: currentUser });
}

function joinGame() {
    const code = document.getElementById('room-code').value.trim().toUpperCase();
    if (!code) return showToast("Enter a room code!");
    socket.emit('joinRoom', { roomCode: code, playerData: currentUser });
}

socket.on('roomJoined', (data) => {
    currentRoomId = data.roomId;
    isHost = data.isHost;
    myId = socket.id;
    gameState = data.gameState;
    
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('display-room-id').innerText = currentRoomId;
    
    if (isHost) document.getElementById('start-btn').classList.remove('hidden');
    else document.getElementById('start-btn').classList.add('hidden');
    
    buildLudoBoard();
    updateGameUI();
});

socket.on('playerListUpdate', (players) => {
    gameState.players = players;
    updatePlayersList();
    updateBoardTokens();
});

socket.on('gameStarted', () => {
    showToast("🔥 Game Started!");
    document.getElementById('start-btn').classList.add('hidden');
    gameState.state = 'PLAYING';
    updateGameUI();
});

socket.on('turnUpdate', (data) => {
    gameState.activePlayerIndex = data.activePlayerIndex;
    updateGameUI();
});

socket.on('diceRolled', (data) => {
    animateDice(data.roll, () => {
        gameState.players = data.players;
        updateBoardTokens();
        updateGameUI();
    });
});

socket.on('startDuel', (data) => {
    if (duelInProgress) return;
    duelInProgress = true;
    
    const riddle = data.riddle;
    document.getElementById('duel-question').innerText = riddle.q;
    const optionsBox = document.getElementById('duel-options');
    optionsBox.innerHTML = '';
    
    riddle.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = () => {
            btn.classList.add('selected');
            document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
            socket.emit('submitDuelAnswer', { roomId: currentRoomId, answer: opt });
        };
        optionsBox.appendChild(btn);
    });
    
    let timeLeft = 15;
    document.getElementById('duel-timer').innerText = timeLeft;
    const timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('duel-timer').innerText = timeLeft;
        if (timeLeft <= 0) clearInterval(timerInterval);
    }, 1000);
    
    openModal('duel-modal');
});

socket.on('duelEnded', (data) => {
    duelInProgress = false;
    closeModal('duel-modal');
    showToast(data.message);
    gameState.players = data.players;
    updateBoardTokens();
    setTimeout(updateGameUI, 1000);
});

socket.on('gameEnded', (data) => {
    showToast(`🏆 ${data.winner} WON THE GAME!`);
    setTimeout(() => {
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('lobby').classList.remove('hidden');
    }, 3000);
});

function startGame() {
    if (!isHost) return;
    socket.emit('startGame', currentRoomId);
}

function rollDice() {
    const rollBtn = document.getElementById('roll-btn');
    rollBtn.disabled = true;
    socket.emit('rollDice', currentRoomId);
}

// ========== BOARD & RENDERING ==========

function buildLudoBoard() {
    const board = document.getElementById('ludo-board');
    board.innerHTML = '';
    
    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.id = `cell-${r}-${c}`;
            
            // Base areas
            if (r < 6 && c < 6) cell.classList.add('base-red');
            else if (r < 6 && c > 8) cell.classList.add('base-green');
            else if (r > 8 && c < 6) cell.classList.add('base-blue');
            else if (r > 8 && c > 8) cell.classList.add('base-yellow');
            
            // Path
            const isPath = LUDO_PATH.some(p => p.r === r && p.c === c);
            if (isPath) {
                cell.classList.add('path');
                if ([6, 24, 42, 30].includes(LUDO_PATH.findIndex(p => p.r === r && p.c === c))) {
                    cell.classList.add('safe');
                }
            }
            
            // Home
            if (r === 7 && c === 7) cell.classList.add('home');
            
            board.appendChild(cell);
        }
    }
    
    const center = document.createElement('div');
    center.className = 'cell center-home';
    center.innerHTML = '🏁';
    board.appendChild(center);
}

function updateBoardTokens() {
    document.querySelectorAll('.token').forEach(t => t.remove());
    
    gameState.players.forEach((player, idx) => {
        const token = document.createElement('div');
        token.className = `token ${player.stunned ? 'stunned' : ''}`;
        token.style.backgroundColor = LUDO_COLORS[idx];
        token.innerHTML = SHOP_ITEMS.find(i => i.id === player.selectedAvatar)?.icon || '👤';
        
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

function updatePlayersList() {
    const list = document.getElementById('players-list');
    list.innerHTML = '';
    
    gameState.players.forEach((p, idx) => {
        const isActive = idx === gameState.activePlayerIndex;
        const row = document.createElement('div');
        row.className = `player-row ${isActive ? 'active' : ''}`;
        
        const avatar = SHOP_ITEMS.find(i => i.id === p.selectedAvatar)?.icon || '👤';
        const statusEmoji = p.stunned ? '😵' : (isActive ? '🔥' : '⏳');
        
        row.innerHTML = `
            <div>
                <span style="font-size: 1.2rem; margin-right: 8px;">${avatar}</span>
                <strong>${p.name}</strong> ${p.id === myId ? '(You)' : ''}
            </div>
            <span class="player-status">${statusEmoji} Pos: ${p.position === -1 ? 'Base' : p.position >= LUDO_PATH.length ? 'Home' : p.position}</span>
        `;
        list.appendChild(row);
    });
}

function updateGameUI() {
    const activePlayer = gameState.players[gameState.activePlayerIndex];
    const isMyTurn = activePlayer && activePlayer.id === myId;
    
    document.getElementById('turn-indicator').innerText = isMyTurn ? "🔥 Your Turn!" : `${activePlayer?.name}'s Turn`;
    document.getElementById('roll-btn').disabled = !isMyTurn || gameState.state !== 'PLAYING';
    
    updatePlayersList();
}

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
        
        cube.style.transform = `translateZ(-40px) ${rotations[result]}`;
        setTimeout(callback, 600);
    }, 1000);
}

// ========== UTILITIES ==========

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
