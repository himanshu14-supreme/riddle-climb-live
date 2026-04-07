export function updatePlayers(players) {
    const box = document.getElementById('players');

    box.innerHTML = players.map(p =>
        `<div>${p.name} → Position: ${p.pos}</div>`
    ).join('');
}
