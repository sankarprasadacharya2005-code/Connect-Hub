// Connect Hub - App Logic
const socket = io();
let currentUser = null;
let activeChatUser = null;
const processedMessageIds = new Set(); // To prevent duplicates from multiple room emits

// ─── On Page Load ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkToken();
    initCountrySelects();
});

const countryData = [
    { code: '+91', flag: '🇮🇳', name: 'India' },
    { code: '+1',  flag: '🇺🇸', name: 'USA' },
    { code: '+44', flag: '🇬🇧', name: 'UK' },
    { code: '+971',flag: '🇦🇪', name: 'UAE' },
    { code: '+61', flag: '🇦🇺', name: 'Australia' },
    { code: '+86', flag: '🇨🇳', name: 'China' },
    { code: '+33', flag: '🇫🇷', name: 'France' },
    { code: '+49', flag: '🇩🇪', name: 'Germany' },
    { code: '+81', flag: '🇯🇵', name: 'Japan' },
    { code: '+7',  flag: '🇷🇺', name: 'Russia' },
    { code: '+65', flag: '🇸🇬', name: 'Singapore' },
    { code: '+27', flag: '🇿🇦', name: 'South Africa' },
];

function initCountrySelects() {
    const loginSelect = document.getElementById('login-country');
    const regSelect = document.getElementById('reg-country');
    
    [loginSelect, regSelect].forEach(select => {
        if (!select) return;
        countryData.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.code;
            opt.textContent = `${c.flag} ${c.code}`;
            select.appendChild(opt);
        });
    });
}

function updateFlag(type) {
    // This can be used for additional UI updates when country changes
}

// ─── Token Check ─────────────────────────────────────────────────────────────
async function checkToken() {
    const token = localStorage.getItem('chatToken');
    if (!token) return;

    try {
        const res = await fetch('/api/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            showApp(data.user);
        } else {
            localStorage.removeItem('chatToken');
        }
    } catch (e) {
        localStorage.removeItem('chatToken');
    }
}

// ─── App UI Logic ─────────────────────────────────────────────────────────────
function showApp(user) {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    
    updateRequestUI(user.friendRequests || []);
    socket.emit('authenticate', user._id);
}

function updateRequestUI(requests) {
    const list = document.getElementById('requests-list');
    const badge = document.getElementById('request-badge');
    
    if (requests.length > 0) {
        badge.textContent = requests.length;
        badge.classList.remove('d-none');
    } else {
        badge.classList.add('d-none');
    }

    list.innerHTML = '';
    if (requests.length === 0) {
        list.innerHTML = '<div class="list-placeholder">No pending requests.</div>';
        return;
    }

    requests.forEach(req => {
        const item = document.createElement('div');
        item.className = 'user-item';
        item.innerHTML = `
            <img src="${req.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="avatar-sm">
            <div class="user-info">
                <h5>${req.name}</h5>
                <p>${req.phone}</p>
            </div>
            <div class="btn-group-sm ms-auto">
                <button class="btn btn-success btn-sm" onclick="respondRequest('${req._id}', 'accept', this)">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="respondRequest('${req._id}', 'reject', this)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        list.appendChild(item);
    });
}

function toggleRequests() {
    const container = document.getElementById('requests-container');
    const search = document.getElementById('search-container');
    search.classList.add('d-none');
    container.classList.toggle('d-none');
}

async function respondRequest(senderId, action, btn) {
    const token = localStorage.getItem('chatToken');
    try {
        btn.disabled = true;
        const res = await fetch('/api/friends/respond', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ senderId, action })
        });
        const data = await res.json();
        if (data.success) {
            // Refresh profile to get updated friends/requests
            checkToken();
            if (action === 'accept' && data.newFriend) {
                selectUser(data.newFriend);
            }
        }
    } catch (e) {
        console.error('Response error', e);
        btn.disabled = false;
    }
}

function logout() {
    localStorage.removeItem('chatToken');
    location.reload();
}

// ─── Socket Events ───────────────────────────────────────────────────────────
socket.on('friends_list', (friends) => {
    updateChatList(friends);
});

socket.on('receive_message', (msg) => {
    // Deduplicate
    if (msg._id && processedMessageIds.has(msg._id)) return;
    if (msg._id) processedMessageIds.add(msg._id);

    const senderId = msg.sender._id || msg.sender;
    
    // 1. If this message is from the user we are CURRENTLY chatting with
    if (activeChatUser && senderId === activeChatUser._id) {
        appendMessage(msg);
        scrollToBottom();
    }
    
    // 2. Always update the sidebar last message snippet
    updateSidebarMessage(msg);
});

socket.on('chat_history', ({ room, messages }) => {
    const container = document.getElementById('message-container');
    container.innerHTML = '';
    messages.forEach(msg => appendMessage(msg));
    scrollToBottom();
});

socket.on('friend_status', ({ userId, isOnline }) => {
    const statusEl = document.getElementById(`status-${userId}`);
    if (statusEl) {
        statusEl.textContent = isOnline ? 'online' : 'offline';
        statusEl.className = `status-indicator ${isOnline ? 'status-online' : ''}`;
    }
    if (activeChatUser && activeChatUser._id === userId) {
        const headStatus = document.getElementById('chat-status');
        headStatus.textContent = isOnline ? 'online' : 'offline';
        headStatus.className = `status-indicator ${isOnline ? 'status-online' : ''}`;
    }
});

// ─── Chat Functions ──────────────────────────────────────────────────────────
function updateChatList(friends) {
    const list = document.getElementById('chat-list');
    if (friends.length === 0) {
        list.innerHTML = '<div class="list-placeholder">No friends yet. Search and add someone!</div>';
        return;
    }

    list.innerHTML = '';
    friends.forEach(friend => {
        const item = document.createElement('div');
        item.className = `user-item ${activeChatUser && activeChatUser._id === friend._id ? 'active' : ''}`;
        item.onclick = () => selectUser(friend);
        item.innerHTML = `
            <img src="${friend.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="avatar-sm">
            <div class="user-info">
                <h5>${friend.name}</h5>
                <p id="last-msg-${friend._id}">${friend.bio || 'Available'}</p>
            </div>
            <div id="status-${friend._id}" class="status-indicator ${friend.isOnline ? 'status-online' : ''}">
                ${friend.isOnline ? 'online' : 'offline'}
            </div>
        `;
        list.appendChild(item);
    });
}

function selectUser(user) {
    activeChatUser = user;
    
    document.getElementById('no-chat-selected').classList.add('d-none');
    document.getElementById('active-chat').classList.remove('d-none');
    
    document.getElementById('chat-name').textContent = user.name;
    document.getElementById('chat-avatar').src = user.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    
    const headStatus = document.getElementById('chat-status');
    headStatus.textContent = user.isOnline ? 'online' : 'offline';
    headStatus.className = `status-indicator ${user.isOnline ? 'status-online' : ''}`;

    // Join private room and fetch history
    socket.emit('join_private', user._id);
    
    // Update active state in sidebar
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
    updateChatList(currentUser.friends || []); // Refresh to show active

    // Mobile: hide sidebar when chat selected
    if (window.innerWidth <= 768) {
        document.querySelector('.chat-sidebar').classList.add('hidden-mobile');
    }
}

function backToSidebar() {
    document.querySelector('.chat-sidebar').classList.remove('hidden-mobile');
}

async function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('msg-input');
    const content = input.value.trim();
    if (!content || !activeChatUser) return;

    const room = [currentUser._id, activeChatUser._id].sort().join('_');
    const msgData = {
        content,
        room,
        receiverId: activeChatUser._id
    };

    socket.emit('send_message', msgData);
    
    // Optimistic local append
    appendMessage({
        sender: currentUser,
        content,
        createdAt: new Date()
    }, true);
    
    input.value = '';
    scrollToBottom();
}

function appendMessage(msg, isSent = null) {
    if (msg._id) processedMessageIds.add(msg._id);
    const container = document.getElementById('message-container');
    const div = document.createElement('div');
    
    const senderId = msg.sender._id || msg.sender;
    const isMyMsg = isSent !== null ? isSent : (senderId === currentUser._id);
    
    div.className = `message ${isMyMsg ? 'sent' : 'received'}`;
    
    const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    div.innerHTML = `
        <div class="message-content">${msg.content}</div>
        <span class="message-time">${time}</span>
    `;
    
    container.appendChild(div);
}

function updateSidebarMessage(msg) {
    const senderId = msg.sender._id || msg.sender;
    const otherId = senderId === currentUser._id ? msg.receiver : senderId;
    const lastMsgEl = document.getElementById(`last-msg-${otherId}`);
    if (lastMsgEl) {
        lastMsgEl.textContent = msg.content;
    }
}

function scrollToBottom() {
    const container = document.getElementById('message-container');
    container.scrollTop = container.scrollHeight;
}

// ─── Search Logic ────────────────────────────────────────────────────────────
let searchTimeout;
function toggleSearch() {
    const container = document.getElementById('search-container');
    const requests = document.getElementById('requests-container');
    requests.classList.add('d-none');
    container.classList.toggle('d-none');
    if (!container.classList.contains('d-none')) {
        document.getElementById('user-search-input').focus();
    }
}

function handleSearch(query) {
    clearTimeout(searchTimeout);
    if (!query.trim()) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }

    searchTimeout = setTimeout(async () => {
        const token = localStorage.getItem('chatToken');
        try {
            const res = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                displaySearchResults(data.users);
            }
        } catch (e) {
            console.error('Search error', e);
        }
    }, 300);
}

function displaySearchResults(users) {
    const results = document.getElementById('search-results');
    results.innerHTML = '';
    
    if (users.length === 0) {
        results.innerHTML = '<div class="list-placeholder">No users found.</div>';
        return;
    }

    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'user-item';
        item.innerHTML = `
            <img src="${user.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="avatar-sm">
            <div class="user-info">
                <h5>${user.name}</h5>
                <p>${user.phone}</p>
            </div>
            <button class="btn btn-primary btn-sm ms-auto" onclick="sendFriendRequest('${user._id}', this)">
                <i class="fas fa-user-plus"></i>
            </button>
        `;
        results.appendChild(item);
    });
}

async function sendFriendRequest(targetUserId, btn) {
    const token = localStorage.getItem('chatToken');
    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        const res = await fetch('/api/friends/request', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ targetUserId })
        });
        const data = await res.json();
        if (data.success) {
            btn.className = 'btn btn-success btn-sm ms-auto';
            btn.innerHTML = '<i class="fas fa-check"></i>';
        } else {
            alert(data.message || 'Failed to send request');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-user-plus"></i>';
        }
    } catch (e) {
        alert('Error sending request');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i>';
    }
}

// ─── Auth Handlers ───────────────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const countryCode = document.getElementById('login-country').value;
    const rawPhone    = document.getElementById('login-phone').value.trim();
    const password    = document.getElementById('login-password').value;
    const errEl       = document.getElementById('login-error');

    const phone = countryCode + rawPhone.replace(/^\+/, '');
    errEl.classList.add('d-none');

    try {
        const res  = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });
        const data = await res.json();

        if (data.success) {
            localStorage.setItem('chatToken', data.token);
            currentUser = data.user;
            closeModal('login-modal');
            showApp(data.user);
        } else {
            errEl.textContent = data.message || 'Login failed.';
            errEl.classList.remove('d-none');
        }
    } catch (err) {
        errEl.textContent = 'Server error.';
        errEl.classList.remove('d-none');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name        = document.getElementById('reg-name').value.trim();
    const countryCode = document.getElementById('reg-country').value;
    const rawPhone    = document.getElementById('reg-phone').value.trim();
    const password    = document.getElementById('reg-password').value;
    const errEl       = document.getElementById('register-error');
    const sucEl       = document.getElementById('register-success');

    const phone = countryCode + rawPhone.replace(/^\+/, '');
    errEl.classList.add('d-none');
    sucEl.classList.add('d-none');

    try {
        const res  = await fetch('/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, password })
        });
        const data = await res.json();

        if (data.success) {
            sucEl.textContent = 'Account created!';
            sucEl.classList.remove('d-none');
            localStorage.setItem('chatToken', data.token);
            currentUser = data.user;
            setTimeout(() => {
                closeModal('register-modal');
                showApp(data.user);
            }, 1000);
        } else {
            errEl.textContent = data.message || 'Signup failed.';
            errEl.classList.remove('d-none');
        }
    } catch (err) {
        errEl.textContent = 'Server error.';
        errEl.classList.remove('d-none');
    }
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function switchModal(from, to) { closeModal(from); openModal(to); }

// ─── Header & Profile Logic ───────────────────────────────────────────────────
function toggleDropdown(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('header-dropdown');
    dropdown.classList.toggle('d-none');
}

// Close dropdown when clicking anywhere else
window.addEventListener('click', (e) => {
    const dropdown = document.getElementById('header-dropdown');
    if (dropdown && !dropdown.classList.contains('d-none')) {
        dropdown.classList.add('d-none');
    }
});

function openProfileModal() {
    if (!currentUser) return;
    
    document.getElementById('profile-display-img').src = currentUser.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('profile-display-name').textContent = currentUser.name;
    document.getElementById('profile-display-name-sec').textContent = currentUser.name;
    document.getElementById('profile-display-phone').textContent = currentUser.phone;
    document.getElementById('profile-display-bio').textContent = currentUser.bio || 'No bio set.';
    
    openModal('profile-modal');
}

function openEditModal(type) {
    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('edit-modal-title');
    const typeInput = document.getElementById('edit-type');
    
    // Reset
    typeInput.value = type;
    document.getElementById('edit-name-group').classList.add('d-none');
    document.getElementById('edit-bio-group').classList.add('d-none');
    document.getElementById('edit-picture-group').classList.add('d-none');
    document.getElementById('edit-error').classList.add('d-none');
    
    if (type === 'name') {
        title.textContent = 'Edit Name';
        document.getElementById('edit-name-group').classList.remove('d-none');
        document.getElementById('edit-name-input').value = currentUser.name;
    } else if (type === 'bio') {
        title.textContent = 'Edit Bio';
        document.getElementById('edit-bio-group').classList.remove('d-none');
        document.getElementById('edit-bio-input').value = currentUser.bio || '';
        updateBioCounter();
    } else if (type === 'picture') {
        title.textContent = 'Change Profile Picture';
        document.getElementById('edit-picture-group').classList.remove('d-none');
        document.getElementById('upload-preview').classList.add('d-none');
        document.getElementById('edit-picture-input').value = '';
    }
    
    openModal('edit-modal');
}

function updateBioCounter() {
    const input = document.getElementById('edit-bio-input');
    const counter = document.getElementById('bio-counter');
    if (input && counter) {
        counter.textContent = `${input.value.length}/150`;
    }
}

// Add event listener for bio counter
document.addEventListener('DOMContentLoaded', () => {
    const bioInput = document.getElementById('edit-bio-input');
    if (bioInput) {
        bioInput.addEventListener('input', updateBioCounter);
    }
});

function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('upload-preview');
        preview.src = e.target.result;
        preview.classList.remove('d-none');
    };
    reader.readAsDataURL(file);
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const type = document.getElementById('edit-type').value;
    const errEl = document.getElementById('edit-error');
    const token = localStorage.getItem('chatToken');
    
    let updateData = {};
    
    if (type === 'name') {
        updateData.name = document.getElementById('edit-name-input').value.trim();
        if (!updateData.name) return;
    } else if (type === 'bio') {
        updateData.bio = document.getElementById('edit-bio-input').value.trim();
    } else if (type === 'picture') {
        const preview = document.getElementById('upload-preview');
        if (preview.classList.contains('d-none')) return;
        updateData.picture = preview.src; // Using base64 for simplicity
    }

    try {
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        const res = await fetch('/api/profile/update', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updateData)
        });
        const data = await res.json();
        
        if (data.success) {
            currentUser = data.user;
            closeModal('edit-modal');
            // If profile modal is open, refresh it
            if (document.getElementById('profile-modal').style.display === 'flex') {
                openProfileModal();
            }
        } else {
            errEl.textContent = data.message || 'Update failed.';
            errEl.classList.remove('d-none');
        }
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    } catch (err) {
        errEl.textContent = 'Server error.';
        errEl.classList.remove('d-none');
        console.error('Profile update error:', err);
    }
}

// ─── Theme Logic ────────────────────────────────────────────────────────────
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        updateThemeUI(true);
    } else {
        document.body.classList.remove('dark-theme');
        updateThemeUI(false);
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeUI(isDark);
}

function updateThemeUI(isDark) {
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        themeIcon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }
}

// Call initTheme on load
document.addEventListener('DOMContentLoaded', initTheme);

window.onclick = (e) => { 
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
};
