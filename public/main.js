import { buildBoard } from './game.js';
import { setupSocket } from './socket.js';

const socket = setupSocket();

window.createRoom = () => {
    socket.emit('createRoom');
};

window.joinRoom = () => {
    const code = document.getElementById('roomInput').value;
    socket.emit('joinRoom', code);
};

window.rollDice = () => {
    socket.emit('rollDice', window.currentRoom);
};

buildBoard();

socket.on('roomJoined', (data) => {
    window.currentRoom = data.roomId;
});
