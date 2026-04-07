// public/main.js

import { buildBoard } from './game.js';
import { setupSocket } from './socket.js';

const socket = setupSocket();

window.start = () => {
    socket.emit('createRoom');
};

window.roll = () => {
    socket.emit('rollDice');
};

buildBoard();
