const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('Player Connected');
    socket.on('playerMove', (data) => {
        socket.broadcast.emit('updateBoard', data);
    });
});

http.listen(3000, () => {
    console.log('🚀 Game Server: http://localhost:3000');
});