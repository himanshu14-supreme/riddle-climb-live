export function renderBoard() {
    const b = document.getElementById('board');
    b.innerHTML = '';

    for (let i = 0; i < 225; i++) {
        const d = document.createElement('div');
        d.className = 'cell';

        if (i % 15 === 7 || Math.floor(i / 15) === 7)
            d.classList.add('path');

        if (i === 112) d.innerHTML = '🏁';

        b.appendChild(d);
    }
}
