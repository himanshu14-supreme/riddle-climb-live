// public/game.js

export function buildBoard() {
    const board = document.getElementById('ludo-board');
    board.innerHTML = '';

    for (let i = 0; i < 225; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';

        if (i % 15 === 7 || Math.floor(i / 15) === 7) {
            cell.classList.add('path');
        }

        if ([112].includes(i)) {
            cell.classList.add('center');
            cell.innerHTML = "🏁";
        }

        board.appendChild(cell);
    }
}
