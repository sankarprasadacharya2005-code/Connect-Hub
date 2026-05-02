const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    username: { type: String, unique: true },
    password: { type: String }, // Optional until registration is finalized
    name: { type: String, default: 'Anonymous' },
    bio: { type: String, default: '' },
    picture: { type: String, default: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });


// Hash password before saving
UserSchema.pre('save', async function() {
    if (this.isNew && !this.username) {
        this.username = this.phone;
    }
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

// Method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);

