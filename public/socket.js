// public/socket.js

import { updatePlayers } from './ui.js';

const socket = io();

export function setupSocket() {

    socket.on('diceRolled', (data) => {
        updatePlayers(data.players);
    });

    return socket;
}
