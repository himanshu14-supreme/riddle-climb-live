const socket = io();

// Game State
let positions = { 1: 100, 2: 100 };
let officialTurn = 1;
let activeAnsweringPlayer = 1;
let isStealAttempt = false;

// Board Configuration
const traps = [15, 32, 48, 62, 85, 94];   
const boosts = [10, 25, 42, 58, 75, 88];  

const board = document.getElementById('board');
const modal = document.getElementById('riddle-modal');
const modalContent = document.querySelector('.modal-content');
const title = document.getElementById('modal-title');
const statusText = document.getElementById('status');

// 1. GENERATE THE BOARD
// This ensures the 10x10 grid appears (Fixes Screenshot 95)
for (let i = 1; i <= 100; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (traps.includes(i)) cell.classList.add('trap');
    if (boosts.includes(i)) cell.classList.add('boost');
    cell.id = 'cell-' + i;
    cell.innerText = i;
    board.appendChild(cell);
}

// 2. VISUAL UPDATES
function updateUI() {
    [1, 2].forEach(num => {
        const target = document.getElementById('cell-' + positions[num]);
        const p = document.getElementById('player' + num);
        if (target && p) {
            // Offset slightly so players don't perfectly overlap
            p.style.left = (target.offsetLeft + (num === 1 ? 5 : 25)) + 'px';
            p.style.top = (target.offsetTop + (num === 1 ? 5 : 25)) + 'px';
        }
    });
}
window.onload = updateUI;

// 3. MULTIPLAYER SYNC
// Listen for moves from the other player via Node.js
socket.on('updateBoard', (data) => {
    positions = data.positions;
    officialTurn = data.nextTurn;
    updateUI();
    syncStatus();
});

// 4. GAME LOGIC
async function playTurn() {
    const rollBtn = document.getElementById('roll-btn');
    rollBtn.disabled = true;

    try {
        // Fetching from XAMPP (Fixes Screenshot 96, 98, 100)
        const response = await fetch('http://localhost/get_riddle.php');
        const riddle = await response.json();
        
        if (riddle.error) throw new Error(riddle.error);

        isStealAttempt = false;
        activeAnsweringPlayer = officialTurn;
        showModal(riddle);
    } catch (e) {
        console.error("Connection Error:", e);
        alert("Check if XAMPP is running and the 'riddle_game' database exists!");
        rollBtn.disabled = false;
    }
}

function showModal(riddle) {
    title.innerText = isStealAttempt ? "✨ STEAL ATTEMPT! ✨" : `Player ${activeAnsweringPlayer}'s Riddle`;
    document.getElementById('riddle-text').innerText = riddle.question;
    
    const box = document.getElementById('options-box');
    box.innerHTML = '';

    const options = [
        { text: riddle.option_a, key: riddle.option_a },
        { text: riddle.option_b, key: riddle.option_b },
        { text: riddle.option_c, key: riddle.option_c },
        { text: riddle.option_d, key: riddle.option_d }
    ];

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt.text;
        btn.onclick = () => checkAnswer(opt.text, riddle.answer, riddle);
        box.appendChild(btn);
    });
    
    modal.style.display = 'block';
}

function checkAnswer(selected, correct, riddleData) {
    if (selected === correct) {
        modalContent.classList.add('correct-flash');
        
        // Move forward: 3 steps for normal, 1 step for steal
        const moveAmount = isStealAttempt ? 1 : 3;
        positions[activeAnsweringPlayer] = Math.max(1, positions[activeAnsweringPlayer] - moveAmount);

        // Apply Boost
        if (boosts.includes(positions[activeAnsweringPlayer])) {
            positions[activeAnsweringPlayer] = Math.max(1, positions[activeAnsweringPlayer] - 4);
        }
        
        setTimeout(finishTurn, 800);
    } else {
        modalContent.classList.add('wrong-flash');
        
        setTimeout(() => {
            modalContent.classList.remove('wrong-flash');
            if (!isStealAttempt) {
                // Apply Trap penalty for the original player
                if (traps.includes(positions[officialTurn])) {
                    positions[officialTurn] = Math.min(100, positions[officialTurn] + 5);
                }
                
                // Trigger Steal Mode for the other player
                isStealAttempt = true;
                activeAnsweringPlayer = (officialTurn === 1) ? 2 : 1;
                showModal(riddleData); 
            } else {
                finishTurn();
            }
        }, 800);
    }
}

function finishTurn() {
    modalContent.classList.remove('correct-flash');
    modal.style.display = 'none';
    
    // Switch turns
    officialTurn = (officialTurn === 1) ? 2 : 1;
    
    // BROADCAST TO SERVER (Syncs everyone else)
    socket.emit('playerMove', {
        positions: positions,
        nextTurn: officialTurn
    });
    
    updateUI();
    syncStatus();
    document.getElementById('roll-btn').disabled = false;
}

function syncStatus() {
    statusText.innerText = `Player ${officialTurn}'s Turn`;
    statusText.style.color = (officialTurn === 1) ? "#e74c3c" : "#3498db";
}
