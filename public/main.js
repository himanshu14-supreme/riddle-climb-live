import socket from './socket.js';
import { renderBoard } from './board.js';
import { initGame } from './gameClient.js';

window.login = () => {
    socket.emit('auth_login', {
        user: user.value,
        pass: pass.value
    });
};

window.register = () => {
    socket.emit('auth_register', {
        user: user.value,
        pass: pass.value
    });
};

window.createRoom = () => socket.emit('createRoom');
window.joinRoom = () => socket.emit('joinRoom', room.value);
window.roll = () => socket.emit('rollDice', window.roomId);

socket.on('auth_success', () => {
    auth.classList.add('hidden');
    lobby.classList.remove('hidden');
});

socket.on('roomJoined', d => {
    window.roomId = d.roomId;
    lobby.classList.add('hidden');
    game.classList.remove('hidden');
});

renderBoard();
initGame();
