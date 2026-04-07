const rooms = {};

function generateRoomId() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function createRoom(socket) {
    const id = generateRoomId();

    rooms[id] = {
        id,
        players: [
            {
                id: socket.id,
                name: "Player1",
                pos: -1
            }
        ],
        turnIndex: 0
    };

    return rooms[id];
}

function joinRoom(room, socket) {
    room.players.push({
        id: socket.id,
        name: "Player" + (room.players.length + 1),
        pos: -1
    });
}

module.exports = { rooms, createRoom, joinRoom };
