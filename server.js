require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const User = require('./models/User');
const Message = require('./models/Message');
const Contact = require('./models/Contact');

const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');
const { appendUserToSheet, updateLastLogin } = require('./utils/googleSheets');

const app = express();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const server = http.createServer(app);
const io = socketIo(server);

// Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'a_very_secret_key_123',
    resave: false,
    saveUninitialized: true,
}));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// --- Auth Routes ---

// 1. Signup Route
app.post('/auth/signup', async (req, res) => {
    const { phone, name, password } = req.body;
    
    // Validate phone number format (international)
    const phoneRegex = /^\+\d{1,4}\d{7,14}$/;
    if (!phoneRegex.test(phone)) {
        return res.status(400).json({ success: false, message: 'Invalid phone format. Must include valid country code and number.' });
    }

    if (!password || password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    try {
        let user = await User.findOne({ phone });
        if (user) {
            return res.status(400).json({ success: false, message: 'Phone number already exists.' });
        }

        user = new User({ phone, name, password });
        
        // First user is Admin
        const userCount = await User.countDocuments();
        user.role = userCount <= 0 ? 'admin' : 'user';
        
        await user.save();

        // Log to Google Sheet
        try {
            await appendUserToSheet(user);
        } catch (e) {
            console.error('Google sheet append error', e);
        }

        const token = jwt.sign({ userId: user._id }, JWT_SECRET);
        res.json({ success: true, token, user });
    } catch (err) {
        console.error('Signup Error:', err);
        res.status(500).json({ success: false, message: 'Signup failed' });
    }
});

// 2. Login Route
app.post('/auth/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        const user = await User.findOne({ phone });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid phone number or password' });
        }

        const token = jwt.sign({ userId: user._id }, JWT_SECRET);
        try {
            await updateLastLogin(user.phone);
        } catch (e) {
            console.error('Google sheet update error', e);
        }

        res.json({ success: true, token, user });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


// 5. Get/Update Profile
app.get('/api/profile', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId)
            .populate('friends', 'name phone picture isOnline bio')
            .populate('friendRequests', 'name phone picture');
        res.json({ success: true, user });
    } catch (err) {
        res.status(401).json({ success: false });
    }
});

app.post('/api/profile/update', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { name, bio, picture } = req.body;
        const user = await User.findByIdAndUpdate(decoded.userId, { name, bio, picture }, { new: true });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});


// Search Users
app.get('/api/users/search', async (req, res) => {
    const { query } = req.query;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        console.log(`Searching for: "${query}" (Escaped: "${escapedQuery}")`);

        const users = await User.find({
            $or: [
                { name: { $regex: escapedQuery, $options: 'i' } },
                { phone: { $regex: escapedQuery, $options: 'i' } },
                { username: { $regex: escapedQuery, $options: 'i' } }
            ],
            _id: { $ne: decoded.userId }
        }).select('name picture phone username');
        
        console.log(`Found ${users.length} users`);
        res.json({ success: true, users });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ success: false });
    }
});

// Send Friend Request
app.post('/api/friends/request', async (req, res) => {
    const { targetUserId } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const sender = await User.findById(decoded.userId);
        const target = await User.findById(targetUserId);

        if (!target) return res.status(404).json({ success: false, message: 'User not found' });
        if (target._id.equals(sender._id)) return res.status(400).json({ success: false, message: 'Cannot add yourself' });
        if (target.friendRequests.includes(sender._id)) return res.status(400).json({ success: false, message: 'Request already sent' });
        if (target.friends.includes(sender._id)) return res.status(400).json({ success: false, message: 'Already friends' });

        target.friendRequests.push(sender._id);
        await target.save();
        res.json({ success: true, message: 'Friend request sent' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Accept/Reject Request
app.post('/api/friends/respond', async (req, res) => {
    const { senderId, action } = req.body; // action: 'accept' or 'reject'
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);

        user.friendRequests = user.friendRequests.filter(id => !id.equals(senderId));

        let newFriend = null;
        if (action === 'accept') {
            const sender = await User.findById(senderId);
            if (sender) {
                user.friends.push(senderId);
                sender.friends.push(user._id);
                await sender.save();
                newFriend = { _id: sender._id, name: sender.name, picture: sender.picture, phone: sender.phone, isOnline: sender.isOnline };
            }
        }
        await user.save();
        res.json({ success: true, newFriend });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

const users = new Map(); // socket.id -> user object

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    socket.on('authenticate', async (userId) => {
        try {
            const user = await User.findById(userId);
            if (user) {
                user.isOnline = true;
                await user.save();
                users.set(socket.id, user);
                
                // socket.join('public'); // Global room disabled
                socket.join(`user_${user._id}`); // Join personal room for private messages
                
                // Broadcast online status to friends
                const friends = await User.find({ _id: { $in: user.friends } });
                friends.forEach(friend => {
                    io.to(`user_${friend._id}`).emit('friend_status', { userId: user._id, isOnline: true });
                });

                // Public history broadcast disabled

                // Send friends list with online status
                const friendsList = await User.find({ _id: { $in: user.friends } }).select('name username picture isOnline bio');
                socket.emit('friends_list', friendsList);

                // Mark messages as delivered
                await Message.updateMany(
                    { receiver: user._id, status: 'sent' },
                    { status: 'delivered' }
                );
                // Notify senders that messages were delivered
                friends.forEach(friend => {
                    io.to(`user_${friend._id}`).emit('messages_delivered', { to: user._id });
                });
            }
        } catch (err) {
            console.error('Socket auth error:', err);
        }
    });

    socket.on('join_private', async (friendId) => {
        const user = users.get(socket.id);
        if (!user) return;

        // Security: Check if they are actually friends
        const isFriend = user.friends.some(id => id.toString() === friendId.toString());
        if (!isFriend) return;

        const room = [user._id.toString(), friendId.toString()].sort().join('_');
        socket.join(room);
        
        const history = await Message.find({ room })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('sender', 'name username picture');
        socket.emit('chat_history', { room, messages: history.reverse() });

        // Mark messages as read
        await Message.updateMany(
            { room, receiver: user._id, status: { $ne: 'read' } },
            { status: 'read' }
        );
        // Notify the other user in the room
        socket.to(room).emit('messages_read', { room, by: user._id });
    });

    socket.on('send_message', async (data) => {
        const user = users.get(socket.id);
        if (!user) return;

        const { content, room, receiverId } = data;
        
        // Determine initial status based on receiver online status
        let initialStatus = 'sent';
        const isReceiverOnline = Array.from(users.values()).some(u => u._id.toString() === receiverId);
        if (isReceiverOnline) initialStatus = 'delivered';

        const msg = new Message({
            sender: user._id,
            content,
            room: room,
            receiver: receiverId || null,
            status: initialStatus
        });

        await msg.save();
        const populatedMsg = await msg.populate('sender', 'name username picture role');
        
        // Emit to the specific chat room (for people currently in the chat)
        if (room) {
            io.to(room).emit('receive_message', populatedMsg);
        }
        
        // Also emit directly to the receiver's personal room (for notifications/sidebar updates)
        if (receiverId) {
            io.to(`user_${receiverId}`).emit('receive_message', populatedMsg);
        }
    });


    socket.on('typing', (data) => {
        const user = users.get(socket.id);
        if (!user) return;
        socket.to(data.room).emit('typing', { username: user.username, room: data.room, isTyping: data.isTyping });
    });

    socket.on('admin_delete_message', async (messageId) => {
        const user = users.get(socket.id);
        if (!user || user.role !== 'admin') return;

        try {
            await Message.findByIdAndDelete(messageId);
            io.emit('message_deleted', messageId);
        } catch (err) {
            console.error('Delete error:', err);
        }
    });

    socket.on('disconnect', async () => {
        const user = users.get(socket.id);
        if (user) {
            user.isOnline = false;
            user.lastSeen = new Date();
            await user.save();
            
            // Broadcast offline status to friends
            const friends = await User.find({ _id: { $in: user.friends } });
            friends.forEach(friend => {
                io.to(`user_${friend._id}`).emit('friend_status', { userId: user._id, isOnline: false });
            });

            users.delete(socket.id);
        }
    });

});

const os = require('os');
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    const interfaces = os.networkInterfaces();
    let networkIP = null;
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                networkIP = iface.address;
            }
        }
    }
    
    if (networkIP) {
        console.log(`Network Host Link: http://${networkIP}:${PORT}`);
    }
});
