const socket = io();

const SHOP_ITEMS = [
    { id: 'avatar_default', name: 'Peasant', icon: '👤', type: 'avatar', price: 0, desc: 'A simple traveler.' },
    { id: 'avatar_knight', name: 'Knight', icon: '🛡️', type: 'avatar', price: 150, desc: 'Armor forged in the arena.' },
    { id: 'avatar_mage', name: 'Mage', icon: '🧙', type: 'avatar', price: 200, desc: 'Master of riddles.' },
    { id: 'ability_none', name: 'No Ability', icon: '🚫', type: 'ability', price: 0, desc: 'No special abilities.' },
    { id: 'ability_haste', name: 'Boots of Haste', icon: '⚡', type: 'ability', price: 300, desc: 'Passive: Moves slightly faster.' },
    { id: 'ability_shield', name: 'Riddle Shield', icon: '🔰', type: 'ability', price: 400, desc: 'Passive: Block one stun.' }
];

let currentUser = { isLoggedIn: false, name: "Guest", coins: 600, xp: 0, inventory: ['avatar_default', 'ability_none'], selectedAvatar: 'avatar_default', selectedAbility: 'ability_none' };
let currentRoomId = null, isHost = false, myId = null, duelTimerInterval = null;

const ludoPath = [
    {r:6,c:1},{r:6,c:2},{r:6,c:3},{r:6,c:4},{r:6,c:5},{r:5,c:6},{r:4,c:6},{r:3,c:6},{r:2,c:6},{r:1,c:6},{r:0,c:6},
    {r:0,c:7},{r:0,c:8},{r:1,c:8},{r:2,c:8},{r:3,c:8},{r:4,c:8},{r:5,c:8},{r:6,c:9},{r:6,c:10},{r:6,c:11},{r:6,c:12},
    {r:6,c:13},{r:6,c:14},{r:7,c:14},{r:8,c:14},{r:8,c:13},{r:8,c:12},{r:8,c:11},{r:8,c:10},{r:8,c:9},{r:9,c:8},
    {r:10,c:8},{r:11,c:8},{r:12,c:8},{r:13,c:8},{r:14,c:8},{r:14,c:7},{r:14,c:6},{r:13,c:6},{r:12,c:6},{r:11,c:6},
    {r:10,c:6},{r:9,c:6},{r:8,c:5},{r:8,c:4},{r:8,c:3},{r:8,c:2},{r:8,c:1},{r:8,c:0},{r:7,c:0},
    {r:7,c:1},{r:7,c:2},{r:7,c:3},{r:7,c:4},{r:7,c:5} 
];
const colors = ['#ef4444', '#10b981', '#3b82f6', '#fbbf24'];

// --- AUTHENTICATION ---
function playGuest() {
    currentUser.name = document.getElementById('guest-name').value.trim() || "Guest_" + Math.floor(Math.random()*999);
    transitionToLobby();
}
function login() { socket.emit('auth_login', { user: document.getElementById('auth-user').value.trim(), pass: document.getElementById('auth-pass').value.trim() }); }
function register() { socket.emit('auth_register', { user: document.getElementById('auth-user').value.trim(), pass: document.getElementById('auth-pass').value.trim() }); }

socket.on('auth_success', (data) => {
    currentUser = { ...currentUser, ...data, isLoggedIn: true };
    transitionToLobby();
});
socket.on('auth_error', (msg) => document.getElementById('auth-message').innerText = msg);

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

// --- SHOP & VAULT ---
function openModal(id) { 
    if(id === 'shop-modal') renderShop();
    if(id === 'vault-modal') renderVault();
    document.getElementById(id).classList.remove('hidden'); 
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function renderShop() {
    const box = document.getElementById('shop-items-container');
    box.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        if(item.price === 0) return;
        const isOwned = currentUser.inventory.includes(item.id);
        box.innerHTML += `
            <div class="shop-card">
                <div class="tooltip-btn">? <span class="tooltip-text">${item.desc}</span></div>
                <div style="font-size: 2.5rem;">${item.icon}</div>
                <h4>${item.name}</h4>
                <p style="color: var(--accent-gold); margin: 5px 0;">🪙 ${item.price}</p>
                <button class="menu-btn ${isOwned ? '' : 'join-variant'}" ${isOwned ? 'disabled' : ''} onclick="buyItem('${item.id}', ${item.price})">
                    ${isOwned ? 'Owned' : 'Buy'}
                </button>
            </div>`;
    });
}

function renderVault() {
    const box = document.getElementById('vault-items');
    box.innerHTML = '';
    SHOP_ITEMS.filter(item => currentUser.inventory.includes(item.id)).forEach(item => {
        const isEquipped = (currentUser.selectedAvatar === item.id || currentUser.selectedAbility === item.id);
        box.innerHTML += `
            <div class="shop-card">
                <div class="tooltip-btn">? <span class="tooltip-text">${item.desc}</span></div>
                <div style="font-size: 2.5rem;">${item.icon}</div>
                <h4>${item.name}</h4>
                <button class="menu-btn ${isEquipped ? 'join-variant' : ''}" onclick="equipItem('${item.id}', '${item.type}')">
                    ${isEquipped ? 'Equipped' : 'Equip'}
                </button>
            </div>`;
    });
}

function buyItem(id, price) {
    if(currentUser.coins < price) return showToast("Not enough coins!");
    currentUser.coins -= price;
    currentUser.inventory.push(id);
    if(currentUser.isLoggedIn) socket.emit('save_data', currentUser);
    updateProfileUI(); renderShop(); showToast("Item Purchased!");
}

function equipItem(id, type) {
    if(type === 'avatar') currentUser.selectedAvatar = id;
    if(type === 'ability') currentUser.selectedAbility = id;
    if(currentUser.isLoggedIn) socket.emit('save_data', currentUser);
    updateProfileUI(); renderVault(); showToast("Item Equipped!");
}

// --- GAME LOGIC ---
function hostGame() { socket.emit('createRoom'); }
function joinGame() { socket.emit('joinRoom', document.getElementById('room-code').value.trim().toUpperCase()); }

socket.on('roomJoined', (data) => {
    currentRoomId = data.roomId; isHost = data.isHost; myId = socket.id;
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('display-room-id').innerText = currentRoomId;
    if (isHost) document.getElementById('start-btn').classList.remove('hidden');
    buildLudoBoard();
});

socket.on('updateLobby', (players) => {
    document.getElementById('players-list').innerHTML = players.map((p, i) => 
        `<div style="padding: 10px; background: rgba(0,0,0,0.3); border-left: 4px solid ${colors[i%4]}; margin-bottom: 5px;">
            ${p.name} ${p.id === myId ? '(You)' : ''} ${p.stunned ? '😵' : ''}
        </div>`
    ).join('');
    updateBoardTokens(players);
});

socket.on('gameStarted', () => { document.getElementById('start-btn').classList.add('hidden'); showToast("Game Started!"); });

socket.on('turnUpdate', (data) => {
    const isMyTurn = data.activePlayerId === myId;
    document.getElementById('turn-indicator').innerText = isMyTurn ? "Your Turn!" : `${data.activePlayerName}'s Turn`;
    document.getElementById('roll-btn').disabled = !isMyTurn;
});

function rollDice() {
    document.getElementById('roll-btn').disabled = true;
    socket.emit('rollDice', currentRoomId);
}

socket.on('diceRolled', (data) => {
    animateDice(data.roll, () => { updateBoardTokens(data.players); });
});

function animateDice(result, callback) {
    const cube = document.getElementById('dice-cube');
    cube.classList.add('rolling');
    setTimeout(() => {
        cube.classList.remove('rolling');
        let rotX = 0, rotY = 0;
        switch(result) {
            case 1: rotX=0; rotY=0; break; case 6: rotX=0; rotY=180; break;
            case 3: rotX=0; rotY=-90; break; case 4: rotX=0; rotY=90; break;
            case 5: rotX=-90; rotY=0; break; case 2: rotX=90; rotY=0; break;
        }
        cube.style.transform = `translateZ(-50px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        setTimeout(callback, 500);
    }, 1000);
}

function buildLudoBoard() {
    const board = document.getElementById('ludo-board');
    board.innerHTML = '';
    
    for(let r = 0; r < 15; r++) {
        for(let c = 0; c < 15; c++) {
            const cell = document.createElement('div');
            cell.className = 'ludo-cell';
            cell.id = `cell-${r}-${c}`;
            
            // Paint Bases
            if(r<6 && c<6) cell.className += ' base-red';
            else if(r<6 && c>8) cell.className += ' base-green';
            else if(r>8 && c<6) cell.className += ' base-blue';
            else if(r>8 && c>8) cell.className += ' base-yellow';
            
            // Paint Path & Bridges
            const isPath = ludoPath.some(p => p.r === r && p.c === c);
            if(isPath) {
                cell.className += ' path-cell';
                if((r===6&&c===2) || (r===8&&c===12)) cell.className += ' bridge-cell'; // Aesthetic bridges
            }
            board.appendChild(cell);
        }
    }
    const center = document.createElement('div');
    center.className = 'center-home'; center.innerHTML = '🏁';
    board.appendChild(center);
}

function updateBoardTokens(players) {
    document.querySelectorAll('.token').forEach(el => el.remove());
    players.forEach((p, i) => {
        const token = document.createElement('div');
        token.className = `token ${p.stunned ? 'stunned' : ''}`;
        token.style.backgroundColor = colors[i % 4];
        token.innerHTML = '👤';
        
        let targetCell;
        if (p.pos === -1) {
            const bases = [[2,2], [2,12], [12,2], [12,12]];
            targetCell = document.getElementById(`cell-${bases[i%4][0]}-${bases[i%4][1]}`);
        } else if (p.pos >= ludoPath.length) targetCell = document.querySelector('.center-home');
        else targetCell = document.getElementById(`cell-${ludoPath[p.pos].r}-${ludoPath[p.pos].c}`);

        if(targetCell) targetCell.appendChild(token);
    });
}

// --- DUEL LOGIC ---
socket.on('startDuel', (data) => {
    document.getElementById('duel-question').innerText = data.riddle.q;
    const optsBox = document.getElementById('duel-options');
    optsBox.innerHTML = '';
    
    data.riddle.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn'; btn.innerText = opt;
        btn.onclick = () => {
            btn.classList.add('selected');
            document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
            socket.emit('submitDuelAnswer', { roomId: currentRoomId, answer: opt });
        };
        optsBox.appendChild(btn);
    });

    openModal('duel-modal');
    let timeLeft = 15; document.getElementById('duel-timer').innerText = timeLeft;
    duelTimerInterval = setInterval(() => {
        timeLeft--; document.getElementById('duel-timer').innerText = timeLeft;
        if(timeLeft <= 0) clearInterval(duelTimerInterval);
    }, 1000);
});

socket.on('duelEnded', (data) => {
    clearInterval(duelTimerInterval); closeModal('duel-modal');
    showToast(data.msg); updateBoardTokens(data.players);
});

function startGame() { socket.emit('startGame', currentRoomId); }
function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div'); toast.className = 'toast'; toast.innerText = msg;
    container.appendChild(toast); setTimeout(() => toast.remove(), 4000);
}
