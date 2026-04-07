const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2');
require('dotenv').config();

const { move, collision } = require('./gameEngine');
const { rooms, createRoom, joinRoom } = require('./roomManager');
const setupAuth = require('./auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

setupAuth(io, db);

io.on('connection', (socket) => {

    socket.on('createRoom', () => {
        const room = createRoom(socket);
        socket.join(room.id);

        socket.emit('roomJoined', { roomId: room.id });
        io.to(room.id).emit('updatePlayers', room.players);
    });

    socket.on('joinRoom', (id) => {
        const room = rooms[id];
        if (!room) return;

        joinRoom(room, socket);
        socket.join(id);

        io.to(id).emit('updatePlayers', room.players);
    });

    socket.on('rollDice', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players[room.turn];
        if (player.id !== socket.id) return;

        const roll = Math.floor(Math.random() * 6) + 1;

        move(player, roll);

        const hit = collision(room.players, player);
        if (hit) hit.pos = -1;

        room.turn = (room.turn + 1) % room.players.length;

        io.to(roomId).emit('gameUpdate', {
            roll,
            players: room.players
        });
    });

});

server.listen(process.env.PORT || 3000);
