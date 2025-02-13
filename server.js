require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const rooms = new Map();

function determineWinner(choice1, choice2) {
    if (choice1 === choice2) return 'Hòa!';
    if ((choice1 === 'kéo' && choice2 === 'bao') ||
        (choice1 === 'búa' && choice2 === 'kéo') ||
        (choice1 === 'bao' && choice2 === 'búa')) {
        return 'player1';
    }
    return 'player2';
}

io.on('connection', (socket) => {
    socket.on('createRoom', () => {
        const roomId = Math.random().toString(36).substring(7);
        rooms.set(roomId, {
            players: [socket.id],
            choices: {},
            votes: {},
            player1Health: 100,
            player2Health: 100
        });
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('roomError', 'Phòng không tồn tại');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('roomError', 'Phòng đã đầy');
            return;
        }

        room.players.push(socket.id);
        socket.join(roomId);

        io.to(roomId).emit('gameStart', {
            roomId: roomId,
            playerCount: room.players.length
        });
    });

    socket.on('makeChoice', ({ roomId, choice }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.choices[socket.id] = choice;

            if (Object.keys(room.choices).length === 2) {
                const [player1, player2] = room.players;
                const result = determineWinner(
                    room.choices[player1],
                    room.choices[player2]
                );

                if (result === 'player2') {
                    room.player1Health -= 20;
                } else if (result === 'player1') {
                    room.player2Health -= 20;
                }

                const gameOver = room.player1Health <= 0 || room.player2Health <= 0;
                const winner = room.player1Health <= 0 ? 'player2' : 'player1';

                io.to(roomId).emit('gameResult', {
                    player1Choice: room.choices[player1],
                    player2Choice: room.choices[player2],
                    result,
                    gameOver,
                    winner
                });

                io.to(roomId).emit('healthSync', {
                    player1Health: room.player1Health,
                    player2Health: room.player2Health
                });

                room.choices = {};
            } else {
                socket.to(roomId).emit('opponentMadeChoice');
            }
        }
    });

    // In server.js, modify the playerVote event handler:
    socket.on('playerVote', ({ roomId, wantsRematch }) => {
        const room = rooms.get(roomId);
        if (room) {
            if (!wantsRematch) {
                // Immediately notify all players and close the room
                io.to(roomId).emit('forceRoomExit', 'Một người chơi đã thoát phòng, trận đấu kết thúc.');
                rooms.delete(roomId);
                return;
            }

            room.votes[socket.id] = wantsRematch;
            socket.to(roomId).emit('playerVoted');

            if (Object.keys(room.votes).length === 2) {
                const rematch = Object.values(room.votes).every(vote => vote === true);
                io.to(roomId).emit('rematchResult', { rematch });

                if (rematch) {
                    // Reset the room state for rematch
                    room.choices = {};
                    room.votes = {};
                    room.player1Health = 100;
                    room.player2Health = 100;
                    io.to(roomId).emit('healthSync', {
                        player1Health: 100,
                        player2Health: 100
                    });
                } else {
                    // Clean up the room if not everyone wants to rematch
                    io.to(roomId).emit('forceRoomExit', 'Không đủ người chơi muốn tiếp tục, trận đấu kết thúc.');
                    rooms.delete(roomId);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            if (room.players.includes(socket.id)) {
                io.to(roomId).emit('forceRoomExit', 'Một người chơi đã mất kết nối, trận đấu kết thúc.');
                rooms.delete(roomId);
            }
        });
    });
});

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});