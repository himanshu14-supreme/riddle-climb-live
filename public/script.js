const socket = io();

// Define items with new 'desc' for the Info Tooltip
const SHOP_ITEMS = [
    { id: 'avatar_default', name: 'Peasant', icon: '👤', type: 'avatar', price: 0, desc: 'A simple traveler looking for glory.' },
    { id: 'avatar_knight', name: 'Knight', icon: '🛡️', type: 'avatar', price: 100, desc: 'Knocks rivals back 5 steps if you land on their square.' },
    { id: 'avatar_mage', name: 'Mage', icon: '🧙‍♂️', type: 'avatar', price: 150, desc: 'Immune to hazard traps on the battlefield.' },
    { id: 'avatar_king', name: 'King', icon: '👑', type: 'avatar', price: 300, desc: 'Gains 1 extra step on every successful roll.' },
    { id: 'ability_none', name: 'None', icon: '🚫', type: 'ability', price: 0, desc: 'No active ability equipped.' },
    { id: 'ability_haste', name: 'Haste', icon: '⚡', type: 'ability', price: 200, desc: 'Passive: 20% chance to roll again after a correct answer.' },
    { id: 'ability_shield', name: 'Shield', icon: '🛡️', type: 'ability', price: 250, desc: 'Passive: Protects you from being stunned in a duel once per game.' }
];

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

// --- 1. AUTH & UI ---
function playGuest() {
    const name = document.getElementById('guest-name').value.trim() || "Guest_" + Math.floor(Math.random()*999);
    currentUser.name = name;
    currentUser.isLoggedIn = true;
    showLobby();
}

function login() { playGuest(); } // Simplified for client side
function register() { playGuest(); }

function showLobby() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    updateProfileUI();
}

function updateProfileUI() {
    document.getElementById('display-name').innerText = currentUser.name;
    document.getElementById('coin-count').innerText = currentUser.coins;
    document.getElementById('xp-count').innerText = currentUser.xp;
    renderShop();
    renderVault();
}

// --- 2. SHOP & VAULT (With Tooltips) ---
function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function showInfo(desc) {
    document.getElementById('info-desc-text').innerText = desc;
    openModal('info-modal');
}

function renderShop() {
    const avatars = document.getElementById('shop-avatars');
    const abilities = document.getElementById('shop-abilities');
    avatars.innerHTML = ''; abilities.innerHTML = '';

    SHOP_ITEMS.forEach(item => {
        const isOwned = currentUser.inventory.includes(item.id);
        const card = `
            <div class="item-card">
                <span class="info-btn" onclick="showInfo('${item.desc}')">?</span>
                <div class="item-icon">${item.icon}</div>
                <div class="item-name">${item.name}</div>
                <div class="item-price">${isOwned ? 'Owned' : item.price + ' 💰'}</div>
                <button class="btn btn-outline mt-3" style="width:100%; padding: 8px;" 
                    onclick="buyItem('${item.id}')" ${isOwned ? 'disabled' : ''}>Buy</button>
            </div>
        `;
        if (item.type === 'avatar') avatars.innerHTML += card;
        else abilities.innerHTML += card;
    });
}

function renderVault() {
    const avatars = document.getElementById('vault-avatars');
    const abilities = document.getElementById('vault-abilities');
    avatars.innerHTML = ''; abilities.innerHTML = '';

    currentUser.inventory.forEach(itemId => {
        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (!item) return;
        
        const isSelected = (currentUser.selectedAvatar === itemId || currentUser.selectedAbility === itemId);
        const card = `
            <div class="item-card" style="border-color: ${isSelected ? 'var(--gold)' : ''}">
                <span class="info-btn" onclick="showInfo('${item.desc}')">?</span>
                <div class="item-icon">${item.icon}</div>
                <div class="item-name">${item.name}</div>
                <button class="btn ${isSelected ? 'btn-primary' : 'btn-outline'} mt-3" 
                    style="width:100%; padding: 8px;" onclick="equipItem('${item.id}', '${item.type}')">
                    ${isSelected ? 'Equipped' : 'Equip'}
                </button>
            </div>
        `;
        if (item.type === 'avatar') avatars.innerHTML += card;
        else abilities.innerHTML += card;
    });
}

function buyItem(id) {
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (currentUser.coins >= item.price && !currentUser.inventory.includes(id)) {
        currentUser.coins -= item.price;
        currentUser.inventory.push(id);
        updateProfileUI();
        showToast(`Purchased ${item.name}!`, 'success');
    } else {
        showToast("Not enough coins!", 'error');
    }
}

function equipItem(id, type) {
    if (type === 'avatar') currentUser.selectedAvatar = id;
    else currentUser.selectedAbility = id;
    renderVault();
}

// --- 3. BATTLEFIELD BOARD GENERATION (LUDO/SNAKE STYLE) ---
function generateBoard() {
    const board = document.getElementById('board');
    if (board.querySelectorAll('.cell').length > 0) return;

    for (let i = 1; i <= 100; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = 'cell-' + i;
        cell.innerText = i;
        
        // Calculate S-Shape Winding Track (Boustrophedon)
        let row = Math.floor((i - 1) / 10); // 0 to 9
        let col = (i - 1) % 10; // 0 to 9
        
        if (row % 2 === 1) col = 9 - col; // Reverse column for odd rows
        
        // Grid starts at 1, Row 1 is top. We want Row 0 to be at bottom.
        cell.style.gridRow = 10 - row;
        cell.style.gridColumn = col + 1;
        
        // Add Battlefield Features
        if (i === 1) cell.classList.add('start-cell');
        else if (i === 100) cell.classList.add('end-cell');
        else if (i % 13 === 0) cell.classList.add('hazard-cell'); // Random hazard traps
        else if (i % 20 === 0) cell.classList.add('safe-zone'); // Random safe zones
        
        board.appendChild(cell);
    }
}

function updateUI(players) {
    const board = document.getElementById('board');
    players.forEach((p, i) => {
        let pDiv = document.getElementById(`player-${p.id}`);
        if (!pDiv) {
            pDiv = document.createElement('div');
            pDiv.id = `player-${p.id}`;
            pDiv.className = 'statue';
            const colors = ['#ef4444', '#3b82f6', '#10b981', '#fbbf24'];
            pDiv.style.borderColor = colors[i % colors.length];
            board.appendChild(pDiv);
        }
        
        const avatarItem = SHOP_ITEMS.find(item => item.id === p.avatar);
        pDiv.innerHTML = avatarItem ? avatarItem.icon : '👤';

        const cell = document.getElementById('cell-' + p.pos);
        if (cell) {
            const countOnCell = players.filter(pl => pl.pos === p.pos).length;
            const offset = countOnCell > 1 ? (i * 8) : 10; 
            pDiv.style.left = cell.offsetLeft + offset + 'px';
            pDiv.style.top = cell.offsetTop + offset + 'px';
        }
        if (p.stunned) pDiv.classList.add('stunned');
        else pDiv.classList.remove('stunned');
    });
}

// --- 4. DICE ANIMATION LOGIC ---
const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
function rollDiceAction() {
    const btn = document.getElementById('roll-btn');
    const visual = document.getElementById('dice-visual');
    if (btn.disabled) return;

    btn.disabled = true;
    visual.classList.add('dice-animating');
    
    let rolls = 0;
    const interval = setInterval(() => {
        visual.innerText = diceFaces[Math.floor(Math.random() * 6)];
        rolls++;
        if (rolls > 12) {
            clearInterval(interval);
            visual.classList.remove('dice-animating');
            // Final face
            visual.innerText = diceFaces[Math.floor(Math.random() * 6)];
            
            // Trigger server request after dice roll finishes
            socket.emit('requestRiddle', currentRoomId);
        }
    }, 80); // Fast flashing
}

// --- 5. ROOM & SOCKET LOGIC ---
function createRoom() {
    const limit = document.getElementById('player-limit').value;
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('joinRoom', { roomId: id, playerName: currentUser.name, maxPlayers: limit, avatar: currentUser.selectedAvatar });
    enterWaitingRoom(id);
}

function joinRoom() {
    const id = document.getElementById('room-input').value.trim().toUpperCase();
    if (id) {
        socket.emit('joinRoom', { roomId: id, playerName: currentUser.name, avatar: currentUser.selectedAvatar });
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

socket.on('playerCountUpdate', (data) => {
    const me = data.players.find(p => p.id === socket.id);
    isHost = me ? me.isHost : false;
    myId = socket.id;
    document.getElementById('player-count-text').innerText = `Players: ${data.count}/${data.max}`;
    document.getElementById('start-game-btn').disabled = !(isHost && data.count >= 2);
    
    document.getElementById('player-list').innerHTML = data.players.map(p => 
        `<li>${p.name} ${p.id === socket.id ? '(You)' : ''} ${p.isHost ? '👑' : ''}</li>`
    ).join('');
});

socket.on('initGame', (data) => {
    document.getElementById('waiting-room').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    generateBoard();
    updateUI(data.players);
    document.getElementById('roll-btn').disabled = !isHost; // Host rolls first
});

// Assuming your server sends 'startRiddleRound' after requestRiddle
socket.on('startRiddleRound', (riddle) => {
    document.getElementById('riddle-text').innerText = riddle.question;
    const box = document.getElementById('options-box');
    box.innerHTML = '';
    
    ['option_a', 'option_b', 'option_c', 'option_d'].forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = riddle[opt] || opt; // Fallback if data structure varies
        btn.onclick = () => {
            socket.emit('submitAnswer', { roomId: currentRoomId, selected: btn.innerText });
            Array.from(box.children).forEach(b => b.disabled = true);
        };
        box.appendChild(btn);
    });
    
    openModal('riddle-modal');
});

socket.on('roundResults', (data) => {
    closeModal('riddle-modal');
    updateUI(data.players);
    document.getElementById('roll-btn').disabled = false; // Re-enable for next turn
});

// Toast Helper
function showToast(msg, type='info') {
    const cont = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderLeftColor = type === 'error' ? 'var(--danger)' : 'var(--primary)';
    toast.innerText = msg;
    cont.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
