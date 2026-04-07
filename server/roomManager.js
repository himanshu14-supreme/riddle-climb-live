// server/roomManager.js

const rooms = {};

function createRoom(socket) {
    const id = Math.random().toString(36).substring(2, 6).toUpperCase();

    rooms[id] = {
        id,
        players: [{
            id: socket.id,
            name: socket.username || "Guest",
            pos: -1,
            stunned: false
        }],
        turnIndex: 0,
        state: "LOBBY"
    };

    return rooms[id];
}

function joinRoom(room, socket) {
    room.players.push({
        id: socket.id,
        name: socket.username || "Guest",
        pos: -1,
        stunned: false
    });
}

module.exports = { rooms, createRoom, joinRoom };
