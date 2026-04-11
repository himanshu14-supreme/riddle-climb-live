const socket = io();

const SHOP_ITEMS = [
    { id: 'avatar_default', name: 'Peasant', icon: '👤', type: 'avatar', price: 0, desc: 'A simple traveler.' },
    { id: 'avatar_knight', name: 'Knight', icon: '🛡️', type: 'avatar', price: 150, desc: 'Armor forged in the arena.' },
    { id: 'avatar_mage', name: 'Mage', icon: '🧙', type: 'avatar', price: 200, desc: 'Master of riddles.' },
    { id: 'avatar_ninja', name: 'Ninja', icon: '🥷', type: 'avatar', price: 250, desc: 'Silent and deadly.' },
    { id: 'avatar_king', name: 'King', icon: '👑', type: 'avatar', price: 500, desc: 'Rule the board.' },
    
    { id: 'ability_none', name: 'No Ability', icon: '🚫', type: 'ability', price: 0, desc: 'Play fair and square.' },
    { id: 'ability_haste', name: 'Boots of Haste', icon: '⚡', type: 'ability', price: 300, desc: 'No exact roll needed to reach Home! (Over-rolls just stop at Home).' },
    { id: 'ability_shield', name: 'Riddle Shield', icon: '🔰', type: 'ability', price: 400, desc: 'Never get stunned when you lose a duel.' },
    { id: 'ability_lucky', name: 'Lucky Dice', icon: '🍀', type: 'ability', price: 450, desc: 'Rolling a 1 grants you an extra turn, just like rolling a 6!' },
    { id: 'ability_fortune', name: 'Thief\'s Glove', icon: '🧤', type: 'ability', price: 500, desc: 'Winning a duel steals 50 coins from the loser.' }
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
let myValidMoves = [];

function goToPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`page-${pageName}`);
    if (page) {
        page.classList.add('active');
    }
    
    if (pageName === 'shop') renderShop();
    if (pageName === 'vault') renderVault();
    if (pageName === 'leaderboard') socket.emit('getLeaderboard');
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
    if (!username || !password) { if (msgEl) msgEl.innerText = 'Please fill in all fields'; return; }
    socket.emit('auth_login', { user: username, pass: password });
}

function handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const confirm = document.getElementById('register-confirm').value.trim();
    const msgEl = document.getElementById('register-message');
    if (!username || !password || !confirm) { if (msgEl) msgEl.innerText = 'Please fill in all fields'; return; }
    if (password !== confirm) { if (msgEl) msgEl.innerText = 'Passwords do not match'; return; }
    if (password.length < 4) { if (msgEl) msgEl.innerText = 'Password must be at least 4 characters'; return; }
    socket.emit('auth_register', { user: username, pass: password });
}

function handleGuest() {
    const name = document.getElementById('guest-name').value.trim() || `Guest_${Math.floor(Math.random()*9999)}`;
    const msgEl = document.getElementById('guest-message');
    if (!name) { if (msgEl) msgEl.innerText = 'Please enter a nickname'; return; }
    currentUser.name = name;
    currentUser.isLoggedIn = false;
    currentUser.username = "";
    goToPage('lobby');
    updateProfileUI();
}

function handleLogout() {
    currentUser = { isLoggedIn: false, name: "Guest", username: "", coins: 600, xp: 0, inventory: ['avatar_default', 'ability_none'], selectedAvatar: 'avatar_default', selectedAbility: 'ability_none' };
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-message').innerText = '';
    goToPage('auth');
}

socket.on('auth_success', (data) => {
    // FIX: Client side JSON parser for safety
    let safeInventory = data.inventory;
    if (typeof safeInventory === 'string') {
        try { safeInventory = JSON.parse(safeInventory); }
        catch (e) { safeInventory = ['avatar_default', 'ability_none']; }
    }
    data.inventory = safeInventory;

    currentUser = { ...currentUser, ...data, isLoggedIn: true };
    
    // FIX: Updates display name from 'Guest' to actual username
    currentUser.name = data.username;
    currentUser.username = data.username;

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
    
    // Safety check
    if(!Array.isArray(currentUser.inventory)) currentUser.inventory = ['avatar_default', 'ability_none'];

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
    
    // Safety check
    if(!Array.isArray(currentUser.inventory)) currentUser.inventory = ['avatar_default', 'ability_none'];

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
    if (currentUser.coins < price) { showToast('❌ Not enough coins!'); return; }
    
    // Safety check before push
    if (!Array.isArray(currentUser.inventory)) currentUser.inventory = ['avatar_default', 'ability_none'];
    
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
    updateProfileUI(); renderVault();
    showToast('✅ Item equipped!');
}

socket.on('leaderboardData', (data) => {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    if (data.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-dim);">No ranked players yet.</p>';
        return;
    }
    list.innerHTML = data.map((u, i) => `
        <div class="lb-item">
            <span class="lb-rank">#${i + 1}</span>
            <span class="lb-name">${u.username}</span>
            <span class="lb-xp">${u.xp} XP</span>
        </div>
    `).join('');
});

function handleCreateRoom() {
    const roomName = document.getElementById('room-name').value.trim();
    if (!socket.connected) { showToast('❌ Not connected to server!'); return; }
    socket.emit('createRoom', { name: roomName });
}

function handleJoinRoom() {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    const msgEl = document.getElementById('join-message');
    if (!code) { if (msgEl) msgEl.innerText = 'Please enter a room code'; return; }
    socket.emit('joinRoom', code);
}

function handleLeaveRoom() { if (currentRoomId) socket.emit('leaveRoom', currentRoomId); currentRoomId = null; goToPage('lobby'); }
function handleLeaveGame() { if (currentRoomId) socket.emit('leaveGame', currentRoomId); currentRoomId = null; goToPage('lobby'); }

socket.on('roomCreated', (data) => {
    currentRoomId = data.roomId; isHost = true; myId = socket.id;
    document.getElementById('display-room-code').innerText = currentRoomId;
    document.getElementById('game-room-code').innerText = currentRoomId;
    document.getElementById('host-badge').innerText = '(Host)';
    document.getElementById('start-game-section').classList.remove('hidden');
    showToast('✅ Room created! Code: ' + currentRoomId); goToPage('waiting');
});

socket.on('roomJoined', (data) => {
    currentRoomId = data.roomId; isHost = data.isHost; myId = socket.id;
    document.getElementById('display-room-code').innerText = currentRoomId;
    document.getElementById('game-room-code').innerText = currentRoomId;
    if (!isHost) {
        document.getElementById('start-game-section').classList.add('hidden');
        document.getElementById('host-badge').innerText = '';
    }
    showToast('✅ Joined room: ' + currentRoomId); goToPage('waiting');
});

socket.on('updatePlayers', (players) => {
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
    const gameList = document.getElementById('game-players-list');
    if (gameList) {
        const hexColors = ['#dc2626', '#059669', '#ca8a04', '#1d4ed8'];
        gameList.innerHTML = players.map((p, idx) => `
            <div class="player-item" style="border-left: 4px solid ${hexColors[idx % 4]}">
                <div class="player-name">
                    <span class="player-avatar-small">${SHOP_ITEMS.find(sh => sh.id === p.selectedAvatar)?.icon || '👤'}</span>
                    <span>${p.name} ${p.stunned ? '😵' : ''}</span>
                </div>
            </div>
        `).join('');
    }
    const count = document.getElementById('player-count');
    if (count) count.innerText = players.length;
});

function handleStartGame() { if (isHost) socket.emit('startGame', currentRoomId); }

socket.on('gameStarted', () => { goToPage('game'); document.getElementById('roll-btn').disabled = false; showToast('🎮 Game Started!'); });

function updateBoardTokens(players) {
    document.querySelectorAll('.token').forEach(t => t.remove());
    const colorNames = ['red', 'green', 'yellow', 'blue'];
    const hexColors = ['#dc2626', '#059669', '#ca8a04', '#1d4ed8'];
    const startOffsets = [0, 13, 26, 39];
    
    players.forEach((player, pIdx) => {
        const colorName = colorNames[pIdx % 4];
        const hexColor = hexColors[pIdx % 4];
        
        player.tokens.forEach((token, tIdx) => {
            const tokenEl = document.createElement('div');
            tokenEl.className = `token`;
            tokenEl.style.backgroundColor = hexColor;
            tokenEl.innerHTML = SHOP_ITEMS.find(sh => sh.id === player.selectedAvatar)?.icon || '👤';
            
            if (player.stunned) tokenEl.classList.add('stunned');

            if (player.id === myId && myValidMoves.includes(tIdx)) {
                tokenEl.classList.add('valid-move');
                tokenEl.onclick = () => {
                    socket.emit('moveToken', { roomId: currentRoomId, tokenIdx: tIdx });
                    myValidMoves = [];
                    updateBoardTokens(gameState.players); 
                };
            }
            
            let targetCell;
            if (token.progress === -1) {
                const slots = document.querySelectorAll(`#${colorName}-base .yard-slot`);
                targetCell = slots[tIdx];
            } else if (token.progress >= 0 && token.progress <= 50) {
                const absPos = (startOffsets[pIdx % 4] + token.progress) % 52;
                targetCell = document.getElementById(`cell-${absPos}`);
            } else if (token.progress >= 51 && token.progress <= 55) {
                targetCell = document.getElementById(`${colorName}-home-${token.progress - 51}`);
            } else if (token.progress === 56) {
                targetCell = document.querySelector(`.home-${colorName}`);
            }
            if (targetCell) targetCell.appendChild(tokenEl);
        });
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
        let visualResult = result > 6 ? 6 : result;
        switch(visualResult) {
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
    setTimeout(() => {
        gameState.players = data.players;
        myValidMoves = data.validMoves || [];
        updateBoardTokens(data.players);
        if(myValidMoves.length > 0) {
            showToast(`Rolled ${data.roll}! Tap a glowing token to move!`);
        }
    }, 1000);
});

socket.on('boardUpdated', (data) => {
    gameState.players = data.players;
    myValidMoves = [];
    updateBoardTokens(data.players);
});

socket.on('turnUpdate', (data) => {
    const isMyTurn = data.activePlayerId === myId;
    const info = document.getElementById('turn-info');
    let turnText = isMyTurn ? '⚡ Your Turn!' : `${data.activePlayerName}'s Turn`;
    if (data.msg) turnText += ` - ${data.msg}`;
    if (info) info.innerText = turnText;
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
    gameState.players = data.players;
    updateBoardTokens(data.players);
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

socket.on('connect', () => { console.log('✅ Socket connected:', socket.id); });
socket.on('disconnect', () => { console.log('❌ Socket disconnected'); });
socket.on('error', (error) => { showToast('Connection error'); });
