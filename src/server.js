const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const config = require('./config/config');

const PORT = config.PORT;

const rooms = new Map();

app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', (roomId) => {
        if (rooms.has(roomId)) {
            socket.emit('error', 'Room already exists');
            return;
        }

        rooms.set(roomId, { users: [socket.id] });
        socket.join(roomId);
        socket.emit('room-created', roomId);
        console.log(`Room created: ${roomId} by ${socket.id}`);
    });

    socket.on('join-room', (roomId) => {
        const room = rooms.get(roomId);

        if (!room) {
            socket.emit('error', 'Room does not exist');
            return;
        }

        if (room.users.length >= 2) {
            socket.emit('room-full');
            return;
        }

        room.users.push(socket.id);
        socket.join(roomId);
        socket.emit('room-joined', roomId);

        socket.to(roomId).emit('user-connected');
        console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on('offer', ({ roomId, offer }) => {
        socket.to(roomId).emit('offer', offer);
    });

    socket.on('answer', ({ roomId, answer }) => {
        socket.to(roomId).emit('answer', answer);
    });

    socket.on('ice-candidate', ({ roomId, candidate }) => {
        socket.to(roomId).emit('ice-candidate', candidate);
    });

    socket.on('leave-room', (roomId) => {
        handleDisconnect(socket, roomId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        rooms.forEach((room, roomId) => {
            if (room.users.includes(socket.id)) {
                handleDisconnect(socket, roomId);
            }
        });
    });
});

function handleDisconnect(socket, roomId) {
    const room = rooms.get(roomId);
    
    if (room) {
        room.users = room.users.filter(id => id !== socket.id);
        
        socket.to(roomId).emit('user-disconnected');
        
        if (room.users.length === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted`);
        }
    }
    
    socket.leave(roomId);
}

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT}`);
});