// public/ui.js

export function updatePlayers(players) {
    document.getElementById('players').innerHTML =
        players.map(p => `<div>${p.name} (${p.pos})</div>`).join('');
}
