// server/gameEngine.js

function movePlayer(player, roll) {
    if (player.pos === -1) {
        if (roll === 6) player.pos = 0;
        return;
    }

    player.pos += roll;

    if (player.pos > 56) {
        player.pos = 56;
    }
}

function checkCollision(players, currentPlayer) {
    return players.find(
        p => p.id !== currentPlayer.id &&
        p.pos === currentPlayer.pos &&
        p.pos !== -1 &&
        p.pos !== 56
    );
}

module.exports = { movePlayer, checkCollision };
