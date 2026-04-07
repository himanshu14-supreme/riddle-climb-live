const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcrypt');
require('dotenv').config();

const { movePlayer, checkCollision } = require('./gameEngine');
const { rooms, createRoom, joinRoom } = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ✅ IMPORTANT
app.use(express.static('public'));

io.on('connection', (socket) => {

    socket.on('createRoom', () => {
        const room = createRoom(socket);

        socket.join(room.id);
        socket.emit('roomJoined', { roomId: room.id });

        io.to(room.id).emit('updateLobby', room.players);
    });

    socket.on('joinRoom', (id) => {
        const room = rooms[id];
        if (!room) return;

        joinRoom(room, socket);
        socket.join(id);

        io.to(id).emit('updateLobby', room.players);
    });

    socket.on('rollDice', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players[room.turnIndex];

        if (player.id !== socket.id) return;

        const roll = Math.floor(Math.random() * 6) + 1;

        movePlayer(player, roll);

        const hit = checkCollision(room.players, player);
        if (hit) hit.pos = -1;

        room.turnIndex = (room.turnIndex + 1) % room.players.length;

        io.to(roomId).emit('diceRolled', {
            roll,
            players: room.players
        });
    });

});

// ✅ CRITICAL FOR RENDER
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on", PORT));
