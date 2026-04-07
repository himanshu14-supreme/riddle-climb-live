const rooms = {};

function createRoom(socket) {
    const id = Math.random().toString(36).substring(2, 6).toUpperCase();

    rooms[id] = {
        id,
        players: [{
            id: socket.id,
            name: socket.username || "Guest",
            pos: -1
        }],
        turn: 0
    };

    return rooms[id];
}

function joinRoom(room, socket) {
    room.players.push({
        id: socket.id,
        name: socket.username || "Guest",
        pos: -1
    });
}

module.exports = { rooms, createRoom, joinRoom };
