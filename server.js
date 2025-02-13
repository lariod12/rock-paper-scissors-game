require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
// Add PORT configuration at the top of server.js
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const rooms = new Map();

io.on('connection', (socket) => {
    socket.on('createRoom', () => {
        const roomId = Math.random().toString(36).substring(7);
        rooms.set(roomId, {
            players: [socket.id],
            choices: {}
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

        // Thông báo cho tất cả người chơi trong phòng
        io.to(roomId).emit('gameStart', {
            roomId: roomId,
            playerCount: room.players.length
        });
    });

    socket.on('makeChoice', ({ roomId, choice }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.choices[socket.id] = choice;

            // Kiểm tra xem đã đủ 2 lượt chọn chưa
            if (Object.keys(room.choices).length === 2) {
                const [player1, player2] = room.players;
                const result = determineWinner(
                    room.choices[player1],
                    room.choices[player2]
                );
                io.to(roomId).emit('gameResult', {
                    player1Choice: room.choices[player1],
                    player2Choice: room.choices[player2],
                    result
                });
                room.choices = {};
            } else {
                // Thông báo cho người chơi còn lại biết đối thủ đã chọn
                socket.to(roomId).emit('opponentMadeChoice');
            }
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            if (room.players.includes(socket.id)) {
                io.to(roomId).emit('playerDisconnected');
                rooms.delete(roomId);
            }
        });
    });
});

function determineWinner(choice1, choice2) {
    if (choice1 === choice2) return 'Hòa!';
    if ((choice1 === 'kéo' && choice2 === 'bao') ||
        (choice1 === 'búa' && choice2 === 'kéo') ||
        (choice1 === 'bao' && choice2 === 'búa')) {
        return 'Người chơi 1 thắng!';
    }
    return 'Người chơi 2 thắng!';
}

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});