import socket from './socket.js';
import { updatePlayers } from './ui.js';

export function initGame() {

    socket.on('gameUpdate', data => {
        updatePlayers(data.players);
    });

    socket.on('updatePlayers', players => {
        updatePlayers(players);
    });

}
