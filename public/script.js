const socket = io();
let myName = "", isHost = false, currentRoomId = null, maxPlayersAllowed = 2;
let timerInterval;
let hasAnswered = false; 

function toggleRules(show) {
    document.getElementById('rules-modal').style.display = show ? 'block' : 'none';
}

function createRoom() {
    myName = document.getElementById('player-name-input').value.trim() || "Guest";
    maxPlayersAllowed = document.getElementById('player-limit').value;
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('joinRoom', { roomId: id, playerName: myName, maxPlayers: maxPlayersAllowed });
    enterWaitingRoom(id);
}

function joinRoom() {
    myName = document.getElementById('player-name-input').value.trim() || "Guest";
    const id = document.getElementById('room-input').value.trim().toUpperCase();
    if (id) {
        socket.emit('joinRoom', { roomId: id, playerName: myName });
        enterWaitingRoom(id);
    }
}

function enterWaitingRoom(id) {
    currentRoomId = id;
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('waiting-room').classList.remove('hidden');
    document.getElementById('wait-room-id').innerText = `ROOM ID: ${id}`;
}

function requestStart() {
    if (isHost && currentRoomId) {
        socket.emit('startGameSignal', currentRoomId);
    }
}

socket.on('playerCountUpdate', (data) => {
    maxPlayersAllowed = data.max;
    const me = data.players.find(p => p.id === socket.id);
    isHost = me ? me.isHost : false;
    
    document.getElementById('player-count-text').innerText = `Players Joined: ${data.count}/${data.max}`;
    document.getElementById('player-list').innerHTML = data.players.map(p => 
        `<li>${p.isHost ? '👑' : '👤'} ${p.name} ${p.id === socket.id ? '(You)' : ''}</li>`
    ).join('');
    
    document.getElementById('start-game-btn').disabled = !(isHost && data.count >= 2);
});

socket.on('initGame', (data) => {
    document.getElementById('waiting-room').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    generateBoard(); // CRITICAL: Generate board FIRST
    
    for(let i=1; i<=4; i++) {
        const pDiv = document.getElementById(`player${i}`);
        if (i <= data.players.length) pDiv.classList.remove('hidden');
        else pDiv.classList.add('hidden');
    }
    
    setTimeout(() => {
        updateUI(data.players); // Then move avatars
        syncRollButton();
    }, 100);
});

function syncRollButton() {
    const rollBtn = document.getElementById('roll-btn');
    if (isHost) {
        rollBtn.disabled = false;
        rollBtn.innerText = "Roll for Riddle";
        rollBtn.onclick = () => socket.emit('requestRiddle', currentRoomId);
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "Waiting for Host...";
    }
}

socket.on('startRiddleRound', (riddle) => {
    const modal = document.getElementById('riddle-modal');
    const box = document.getElementById('options-box');
    const startTime = Date.now();
    hasAnswered = false; 
    
    document.getElementById('riddle-text').innerText = riddle.question;
    box.innerHTML = '';

    [riddle.option_a, riddle.option_b, riddle.option_c, riddle.option_d].forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = () => {
            if (hasAnswered) return;
            hasAnswered = true; 
            const timeTaken = Date.now() - startTime;
            
            Array.from(box.children).forEach(b => b.disabled = true);
            btn.style.background = "var(--accent-gold)";
            btn.style.color = "var(--bg-dark)";
            socket.emit('submitAnswer', { roomId: currentRoomId, selected: opt, timeTaken });
        };
        box.appendChild(btn);
    });

    let timeLeft = 20; // Reduced to 20s for snappier gameplay
    clearInterval(timerInterval);
    document.getElementById('timer-display').innerText = `Time Left: ${timeLeft}s`;
    
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer-display').innerText = `Time Left: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (!hasAnswered) {
                hasAnswered = true;
                socket.emit('submitAnswer', { roomId: currentRoomId, selected: null, timeTaken: 30000 });
            }
        }
    }, 1000);
    modal.style.display = 'block';
});

socket.on('roundResults', (data) => {
    clearInterval(timerInterval);
    const box = document.getElementById('options-box');
    const buttons = box.querySelectorAll('.option-btn');

    buttons.forEach(btn => {
        if (btn.innerText === data.correctAnswer) {
            btn.style.background = "var(--accent-green)";
        } else if (btn.style.background.includes("var(--accent-gold)")) {
            btn.style.background = "var(--accent-red)";
        }
    });

    setTimeout(() => showMiniLeaderboard(data.results), 800);

    setTimeout(() => {
        document.getElementById('leaderboard-overlay').classList.add('hidden');
        document.getElementById('riddle-modal').style.display = 'none';
        updateUI(data.players);
        syncRollButton();
    }, 4000); 
});

function showMiniLeaderboard(results) {
    const overlay = document.getElementById('leaderboard-overlay');
    const list = document.getElementById('leaderboard-list');
    results.sort((a, b) => a.time - b.time);
    list.innerHTML = results.map((r, index) => `
        <div class="leaderboard-row">
            <span>#${index + 1} ${r.name}</span>
            <span style="color: ${r.isCorrect ? 'var(--accent-green)' : 'var(--text-dim)'}; font-weight: bold;">
                ${r.isCorrect ? `+${r.steps} Steps` : 'Incorrect'}
            </span>
        </div>
    `).join('');
    overlay.classList.remove('hidden');
}

function updateUI(players) {
    players.forEach((p, index) => {
        const target = document.getElementById('cell-' + p.pos);
        const pDiv = document.getElementById('player' + (index + 1));
        if (target && pDiv) {
            // Offset avatars slightly based on index so they don't overlap perfectly
            pDiv.style.left = (target.offsetLeft + 10 + (index * 4)) + 'px';
            pDiv.style.top = (target.offsetTop + 10 + (index * 4)) + 'px';
        }
    });
}

function generateBoard() {
    const board = document.getElementById('board');
    if (board.children.length > 4) return; // Prevent duplicate generation
    for (let i = 1; i <= 100; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = 'cell-' + i;
        cell.innerText = i;
        board.appendChild(cell);
    }
}

// WIN CONDITION LISTENER
socket.on('gameOver', (winner) => {
    setTimeout(() => {
        alert(`🏆 MATCH OVER! ${winner.name} has claimed victory!`);
        window.location.reload();
    }, 1000); // Wait 1 second for the final avatar jump to finish
});

socket.on('playerLeft', () => {
    alert("A player disconnected. The match has ended.");
    window.location.reload();
});

socket.on('error', (msg) => {
    alert(msg);
});
