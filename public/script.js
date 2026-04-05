const socket = io();

let myName = "";
let isHost = false;
let currentRoomId = null;
let playerList = [];
let timerInterval;

function createRoom() {
    myName = document.getElementById('player-name-input').value.trim() || "Guest";
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('joinRoom', { roomId: id, playerName: myName });
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

socket.on('playerCountUpdate', (data) => {
    playerList = data.players;
    const me = playerList.find(p => p.id === socket.id);
    isHost = me ? me.isHost : false;
    document.getElementById('player-count-text').innerText = `Players Joined: ${data.count}/2`;
    document.getElementById('player-list').innerHTML = playerList.map(p => 
        `<li>${p.isHost ? '👑' : '👤'} ${p.name} ${p.id === socket.id ? '(You)' : ''}</li>`
    ).join('');
    document.getElementById('start-game-btn').disabled = !(isHost && data.count >= 2);
});

function requestStart() {
    socket.emit('startGameSignal', currentRoomId);
}

socket.on('initGame', (players) => {
    document.getElementById('waiting-room').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    generateBoard();
    updateUI(players);
    syncRollButton();
});

function syncRollButton() {
    const rollBtn = document.getElementById('roll-btn');
    if (isHost) {
        rollBtn.style.display = 'block';
        rollBtn.disabled = false;
        rollBtn.innerText = "Roll for Riddle (Everyone)";
        rollBtn.onclick = () => socket.emit('requestRiddle', currentRoomId);
    } else {
        rollBtn.style.display = 'block';
        rollBtn.disabled = true;
        rollBtn.innerText = "Waiting for Host...";
    }
}

socket.on('startRiddleRound', (riddle) => {
    const modal = document.getElementById('riddle-modal');
    const box = document.getElementById('options-box');
    const startTime = Date.now();
    
    document.getElementById('modal-title').innerText = "SPEED ROUND!";
    document.getElementById('riddle-text').innerText = riddle.question;
    box.innerHTML = '';

    [riddle.option_a, riddle.option_b, riddle.option_c, riddle.option_d].forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;
        btn.onclick = () => {
            const timeTaken = Date.now() - startTime;
            Array.from(box.children).forEach(b => b.disabled = true);
            btn.style.background = "#f1c40f"; // Yellow for "Selected"
            socket.emit('submitAnswer', { roomId: currentRoomId, selected: opt, timeTaken });
        };
        box.appendChild(btn);
    });

    let timeLeft = 30;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('timer-display').innerText = `Time Left: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            socket.emit('submitAnswer', { roomId: currentRoomId, selected: null, timeTaken: 30000 });
        }
    }, 1000);
    modal.style.display = 'block';
});

socket.on('roundResults', (data) => {
    clearInterval(timerInterval);
    const box = document.getElementById('options-box');
    const buttons = box.querySelectorAll('.option-btn');

    // Color code results: Green for correct, Red for incorrect
    buttons.forEach(btn => {
        if (btn.innerText === data.correctAnswer) {
            btn.style.background = "#27ae60"; 
            btn.style.color = "white";
        } else if (btn.style.background.includes("rgb(241, 196, 15)")) { // if it was yellow/clicked
             btn.style.background = "#e74c3c";
             btn.style.color = "white";
        }
    });

    // Show leaderboard after a brief delay
    setTimeout(() => {
        showMiniLeaderboard(data.results);
    }, 600);

    // Hide everything and update board after 1.5s
    setTimeout(() => {
        document.getElementById('leaderboard-overlay').classList.add('hidden');
        document.getElementById('riddle-modal').style.display = 'none';
        updateUI(data.players);
        syncRollButton();
    }, 2500);
});

function showMiniLeaderboard(results) {
    const overlay = document.getElementById('leaderboard-overlay');
    const list = document.getElementById('leaderboard-list');
    
    // Sort ascending by time
    results.sort((a, b) => a.time - b.time);

    list.innerHTML = results.map((r, index) => `
        <div class="leaderboard-row">
            <span>#${index + 1} ${r.name}</span>
            <span>${r.time}s</span>
            <span class="step-count">+${r.steps} Steps</span>
        </div>
    `).join('');

    overlay.classList.remove('hidden');
}

function updateUI(players) {
    players.forEach((p, index) => {
        const target = document.getElementById('cell-' + p.pos);
        const pDiv = document.getElementById('player' + (index + 1));
        if (target && pDiv) {
            pDiv.style.left = target.offsetLeft + (index === 0 ? 5 : 20) + 'px';
            pDiv.style.top = target.offsetTop + (index === 0 ? 5 : 20) + 'px';
        }
    });
}

function generateBoard() {
    const board = document.getElementById('board');
    if (board.children.length > 2) return;
    for (let i = 1; i <= 100; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = 'cell-' + i;
        cell.innerText = i;
        board.appendChild(cell);
    }
}

socket.on('playerLeft', (data) => {
    alert(`${data.name} left. Game Over.`);
    window.location.reload();
});
