const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const { movePlayer, checkCollision } = require('./gameEngine');
const { rooms, createRoom, joinRoom } = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

io.on('connection', (socket) => {

    console.log("User connected:", socket.id);

    socket.on('createRoom', () => {
        const room = createRoom(socket);

        socket.join(room.id);

        socket.emit('roomJoined', {
            roomId: room.id,
            isHost: true
        });

        io.to(room.id).emit('updateLobby', room.players);
    });

    socket.on('joinRoom', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        joinRoom(room, socket);
        socket.join(roomId);

        socket.emit('roomJoined', {
            roomId,
            isHost: false
        });

        io.to(roomId).emit('updateLobby', room.players);
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

    socket.on('disconnect', () => {
        console.log("User disconnected:", socket.id);
    });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port", PORT));
