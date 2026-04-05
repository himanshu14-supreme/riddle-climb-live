const socket = io();

// --- Local State ---
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
let localTimer = null;
let selectedOptionBtn = null;

// --- 1. AUTHENTICATION ---
function playGuest() {
    const userInp = document.getElementById('guest-name').value.trim();
    currentUser.name = userInp || "Guest_" + Math.floor(Math.random() * 999);
    transitionToLobby();
}

function login() {
    const user = document.getElementById('auth-user').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    if (!user || !pass) return alert("Enter credentials");
    socket.emit('auth_login', { user, pass });
}

function register() {
    const user = document.getElementById('auth-user').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    if (!user || !pass) return alert("Enter credentials");
    socket.emit('auth_register', { user, pass });
}

socket.on('auth_success', (userData) => {
    currentUser = {
        isLoggedIn: true,
        name: userData.username,
        coins: userData.coins,
        xp: userData.xp,
        inventory: userData.inventory || ['avatar_default', 'ability_none'],
        selectedAvatar: userData.selectedAvatar || 'avatar_default',
        selectedAbility: userData.selectedAbility || 'ability_none'
    };
    transitionToLobby();
});

socket.on('auth_error', (msg) => {
    document.getElementById('auth-message').innerText = msg;
});

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

// --- 2. MODALS, SHOP & VAULT ---
function openRules() { document.getElementById('rules-modal').style.display = 'block'; }
function openShop() { document.getElementById('shop-modal').style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function openVault() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = currentUser.inventory.map(item => {
        let isEq = (currentUser.selectedAvatar === item || currentUser.selectedAbility === item);
        let label = item.replace('avatar_', '').replace('ability_', '').replace('_', ' ').toUpperCase();
        
        // Determine preview icon based on item name
        let icon = '👤';
        if (item.includes('knight')) icon = '🛡️';
        if (item.includes('fire')) icon = '🔥';

        return `
            <div class="shop-item">
                <div class="preview">${icon}</div>
                <p>${label}</p>
                <button class="menu-btn ${isEq ? 'join-variant' : ''}" onclick="equipItem('${item}')">
                    ${isEq ? 'Equipped' : 'Equip'}
                </button>
            </div>
        `;
    }).join('');
    document.getElementById('vault-modal').style.display = 'block';
}

function buyItem(item, price) {
    if (currentUser.inventory.includes(item)) return alert("Already owned!");
    if (currentUser.coins >= price) {
        currentUser.coins -= price;
        currentUser.inventory.push(item);
        updateProfileUI();
        saveUserData();
        alert("Purchased!");
    } else { alert("Not enough coins!"); }
}

function equipItem(item) {
    if (item.startsWith('avatar_')) currentUser.selectedAvatar = item;
    if (item.startsWith('ability_')) currentUser.selectedAbility = item;
    saveUserData();
    openVault(); // Refresh list
}

function saveUserData() {
    if (currentUser.isLoggedIn) {
        socket.emit('save_data', {
            coins: currentUser.coins, xp: currentUser.xp, inventory: currentUser.inventory,
            selectedAvatar: currentUser.selectedAvatar, selectedAbility: currentUser.selectedAbility
        });
    }
}

// --- 3. ROOM & GAME LOGIC ---
function createRoom() {
    const limit = document.getElementById('player-limit').value;
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('joinRoom', { 
        roomId: id, playerName: currentUser.name, 
        avatar: currentUser.selectedAvatar, ability: currentUser.selectedAbility, maxPlayers: limit 
    });
    enterWaitingRoom(id);
}

function joinRoom() {
    const id = document.getElementById('room-input').value.trim().toUpperCase();
    if (id) {
        socket.emit('joinRoom', { 
            roomId: id, playerName: currentUser.name, 
            avatar: currentUser.selectedAvatar, ability: currentUser.selectedAbility 
        });
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

// --- 4. SOCKET GAME EVENTS ---
socket.on('playerCountUpdate', (data) => {
    const me = data.players.find(p => p.id === socket.id);
    isHost = me ? me.isHost : false;
    
    document.getElementById('player-count-text').innerText = `Players: ${data.count}/${data.max}`;
    
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
    
    document.getElementById('player-list').innerHTML = data.players.map((p, i) => {
        let colorDot = ['🔴', '🔵', '🟢', '🟣'][i] || '⚪'; // Match statue colors roughly
        return `<li style="padding: 5px 0;">${colorDot} ${p.avatar === 'avatar_knight' ? '🛡️' : '👤'} ${p.name} ${p.id === socket.id ? '(You)' : ''}</li>`;
    }).join('');
});

socket.on('initGame', (data) => {
    document.getElementById('waiting-room').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    generateBoard();
    data.players.forEach((p, i) => {
        const div = document.getElementById(`player${i+1}`);
        div.classList.remove('hidden');
        div.innerHTML = p.avatar === 'avatar_knight' ? '🛡️' : '👤';
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
            
            // Feature 1: Turn yellow immediately upon click
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
            // Remove the yellow 'selected' class so green/red pops clearly
            btn.classList.remove('selected'); 
            
            if (btn.innerText === data.correctAnswer) btn.classList.add('correct');
            else if (btn === selectedOptionBtn) btn.classList.add('wrong');
        });
    }
    
    // Feature 2: Show leaderboard after 1.5 seconds (to view answers), then display leaderboard for 0.5 seconds
    setTimeout(() => {
        showMiniLeaderboard(data.results);
    }, 1500); 

    setTimeout(() => {
        document.getElementById('leaderboard-overlay').style.display = 'none'; // hide explicitly
        document.getElementById('riddle-modal').style.display = 'none';
        updateUI(data.players);
        syncHostControls();
    }, 2000); // 1500ms + 500ms (0.5 seconds) duration
});

// --- HELPER FUNCTIONS ---
function generateBoard() {
    const b = document.getElementById('board');
    if (b.querySelectorAll('.cell').length > 0) return;
    for (let i = 1; i <= 100; i++) {
        const c = document.createElement('div');
        c.className = 'cell'; c.id = 'cell-' + i; c.innerText = i; b.appendChild(c);
    }
}

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

function showMiniLeaderboard(results) {
    const list = document.getElementById('leaderboard-list');
    results.sort((a,b) => a.time - b.time);
    list.innerHTML = results.map((r, i) => `
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
            <span style="font-weight:bold;">#${i+1} ${r.name}</span>
            <span>${r.isCorrect ? r.time+'s' : '❌'}</span>
            <span style="color:var(--accent-green); font-weight:800;">+${r.steps}</span>
        </div>
    `).join('');
    document.getElementById('leaderboard-overlay').style.display = 'block';
}

// Feature 3: Disconnect Toast Logic
function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    
    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

socket.on('playerDisconnected', (playerName) => {
    showToast(`🚫 ${playerName} left the match.`);
});
