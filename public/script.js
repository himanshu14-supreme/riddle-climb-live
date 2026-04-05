const socket = io();

// Local State (In a real app, this would come from a Database)
let currentUser = {
    name: "Guest",
    coins: 600, 
    xp: 0,
    inventory: ['default'],
    selectedAvatar: 'default'
};

let currentRoomId = null;
let isHost = false;
let timerInterval;

// --- 1. AUTH & UI UPDATES ---
function handleAuth(type) {
    const userInp = document.getElementById('username-input').value.trim();
    currentUser.name = userInp || "Guest_" + Math.floor(Math.random() * 999);
    
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    updateProfileUI();
}

function updateProfileUI() {
    document.getElementById('display-name').innerText = currentUser.name;
    document.getElementById('coin-count').innerText = currentUser.coins;
    document.getElementById('xp-count').innerText = currentUser.xp;
}

// --- 2. SHOP & VAULT ---
function openShop() { document.getElementById('shop-modal').style.display = 'block'; }
function openVault() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = currentUser.inventory.map(item => `
        <div class="shop-item">
            <div class="preview">${item === 'knight' ? '🛡️' : '👤'}</div>
            <p>${item.toUpperCase()}</p>
            <button class="menu-btn ${currentUser.selectedAvatar === item ? 'join-variant' : ''}" 
                onclick="equipItem('${item}')">
                ${currentUser.selectedAvatar === item ? 'Equipped' : 'Equip'}
            </button>
        </div>
    `).join('');
    document.getElementById('vault-modal').style.display = 'block';
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function buyItem(item, price) {
    if (currentUser.coins >= price && !currentUser.inventory.includes(item)) {
        currentUser.coins -= price;
        currentUser.inventory.push(item);
        updateProfileUI();
        alert(`${item} purchased! Find it in your Vault.`);
    } else {
        alert("Cannot purchase: Insufficient coins or already owned.");
    }
}

function equipItem(item) {
    currentUser.selectedAvatar = item;
    openVault(); // Refresh UI
}

// --- 3. ROOM LOGIC ---
function createRoom() {
    const limit = document.getElementById('player-limit').value;
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('joinRoom', { 
        roomId: id, 
        playerName: currentUser.name, 
        avatar: currentUser.selectedAvatar, // Send avatar to server
        maxPlayers: limit 
    });
    enterWaitingRoom(id);
}

function joinRoom() {
    const id = document.getElementById('room-input').value.trim().toUpperCase();
    if (id) {
        socket.emit('joinRoom', { 
            roomId: id, 
            playerName: currentUser.name,
            avatar: currentUser.selectedAvatar 
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

// --- 4. SOCKET EVENTS ---
socket.on('playerCountUpdate', (data) => {
    const me = data.players.find(p => p.id === socket.id);
    isHost = me ? me.isHost : false;
    document.getElementById('player-count-text').innerText = `Players: ${data.count}/${data.max}`;
    document.getElementById('start-game-btn').disabled = !(isHost && data.count >= 2);
    
    document.getElementById('player-list').innerHTML = data.players.map(p => 
        `<li>${p.avatar === 'knight' ? '🛡️' : '👤'} ${p.name} ${p.id === socket.id ? '(You)' : ''}</li>`
    ).join('');
});

socket.on('initGame', (data) => {
    document.getElementById('waiting-room').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    generateBoard();
    
    data.players.forEach((p, i) => {
        const pDiv = document.getElementById(`player${i+1}`);
        pDiv.classList.remove('hidden');
        pDiv.innerHTML = p.avatar === 'knight' ? '🛡️' : '👤';
        if (p.avatar === 'knight') pDiv.classList.add('fire-active');
    });
    updateUI(data.players);
    syncRollButton();
});

socket.on('startRiddleRound', (riddle) => {
    const modal = document.getElementById('riddle-modal');
    const box = document.getElementById('options-box');
    const startTime = Date.now();
    
    document.getElementById('riddle-text').innerText = riddle.question;
    box.innerHTML = '';

    ['option_a', 'option_b', 'option_c', 'option_d'].forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = riddle[key];
        btn.onclick = () => {
            const timeTaken = Date.now() - startTime;
            socket.emit('submitAnswer', { roomId: currentRoomId, selected: btn.innerText, timeTaken });
            Array.from(box.children).forEach(b => b.disabled = true);
        };
        box.appendChild(btn);
    });
    modal.style.display = 'block';
});

socket.on('abilityTriggered', (data) => {
    // data.victimIdx is the index (0-3) of the player hit
    const victimDiv = document.getElementById(`player${data.victimIdx + 1}`);
    if (victimDiv) {
        victimDiv.classList.add('hit-effect');
        setTimeout(() => victimDiv.classList.remove('hit-effect'), 600);
    }
});

socket.on('roundResults', (data) => {
    setTimeout(() => showMiniLeaderboard(data.results), 800);
    setTimeout(() => {
        document.getElementById('leaderboard-overlay').classList.add('hidden');
        document.getElementById('riddle-modal').style.display = 'none';
        updateUI(data.players);
        syncRollButton();
    }, 2000);
});

socket.on('gameOver', (winner) => {
    // Reward Logic
    if (winner.id === socket.id) {
        currentUser.coins += 100;
        currentUser.xp += 50;
    } else {
        currentUser.coins += 20;
        currentUser.xp += 10;
    }
    updateProfileUI();
    alert(`🏆 ${winner.name} Reached the Summit!`);
    window.location.reload();
});

// --- HELPER FUNCTIONS ---
function syncRollButton() {
    const btn = document.getElementById('roll-btn');
    btn.disabled = !isHost;
    btn.onclick = () => socket.emit('requestRiddle', currentRoomId);
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
