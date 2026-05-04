// Connect Hub - App Logic
const socket = io();
let currentUser = null;
let activeChatUser = null;
const processedMessageIds = new Set();
const unreadCounts = {}; // Track unread messages locally

// ─── On Page Load ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkToken();
    initCountrySelects();
    initTheme();
});

const countryData = [
    { code: '+91', flag: '🇮🇳', name: 'India' },
    { code: '+1',  flag: '🇺🇸', name: 'USA' },
    { code: '+44', flag: '🇬🇧', name: 'UK' },
    { code: '+971',flag: '🇦🇪', name: 'UAE' },
    { code: '+61', flag: '🇦🇺', name: 'Australia' },
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
    
    // Update Sidebar V2 and Drawer
    updateUserUI(user);
    
    updateRequestUI(user.friendRequests || []);
    socket.emit('authenticate', user._id);
}

function updateUserUI(user) {
    const avatarImg = user.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('v2-my-avatar').src = avatarImg;
    document.getElementById('drawer-my-avatar').src = avatarImg;
    document.getElementById('drawer-my-name').textContent = user.name;
    document.getElementById('drawer-my-phone').textContent = user.phone;
    document.getElementById('drawer-display-name').textContent = user.name;
    document.getElementById('drawer-display-bio').textContent = user.bio || 'Edit your bio';
}

function toggleSettings() {
    document.getElementById('settings-drawer').classList.toggle('open');
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
        item.className = 'user-item-v2';
        item.innerHTML = `
            <img src="${req.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="avatar-sm">
            <div class="user-info-v2">
                <h5>${req.name}</h5>
                <p>${req.phone}</p>
            </div>
            <div class="btn-group-sm ms-auto">
                <button class="btn btn-success btn-sm" onclick="respondRequest('${req._id}', 'accept', this)"><i class="fas fa-check"></i></button>
                <button class="btn btn-danger btn-sm" onclick="respondRequest('${req._id}', 'reject', this)"><i class="fas fa-times"></i></button>
            </div>
        `;
        list.appendChild(item);
    });
}

function toggleRequests() {
    document.getElementById('search-container').classList.add('d-none');
    document.getElementById('requests-container').classList.toggle('d-none');
}

async function respondRequest(senderId, action, btn) {
    const token = localStorage.getItem('chatToken');
    try {
        btn.disabled = true;
        const res = await fetch('/api/friends/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ senderId, action })
        });
        const data = await res.json();
        if (data.success) {
            checkToken();
        }
    } catch (e) { console.error('Response error', e); btn.disabled = false; }
}

function logout() {
    localStorage.removeItem('chatToken');
    location.reload();
}

// ─── Socket Events ───────────────────────────────────────────────────────────
socket.on('friends_list', (friends) => {
    currentUser.friends = friends;
    updateChatList(friends);
});

socket.on('receive_message', (msg) => {
    if (msg._id && processedMessageIds.has(msg._id)) return;
    if (msg._id) processedMessageIds.add(msg._id);

    const senderId = msg.sender._id || msg.sender;
    
    if (activeChatUser && senderId === activeChatUser._id) {
        appendMessage(msg);
        scrollToBottom();
    } else {
        // Increment unread count if not active chat
        unreadCounts[senderId] = (unreadCounts[senderId] || 0) + 1;
    }
    
    updateChatList(currentUser.friends || []);
});

socket.on('chat_history', ({ room, messages }) => {
    const container = document.getElementById('message-container');
    container.innerHTML = '';
    messages.forEach(msg => appendMessage(msg));
    scrollToBottom();
});

socket.on('friend_status', ({ userId, isOnline }) => {
    const friend = currentUser.friends?.find(f => f._id === userId);
    if (friend) friend.isOnline = isOnline;
    updateChatList(currentUser.friends || []);
});

// ─── Chat Functions ──────────────────────────────────────────────────────────
function updateChatList(friends) {
    const list = document.getElementById('chat-list');
    if (friends.length === 0) {
        list.innerHTML = '<div class="list-placeholder">No conversations yet.</div>';
        return;
    }

    list.innerHTML = '';
    friends.forEach(friend => {
        const item = document.createElement('div');
        item.className = `user-item-v2 ${activeChatUser && activeChatUser._id === friend._id ? 'active' : ''}`;
        item.onclick = () => selectUser(friend);
        
        const unread = unreadCounts[friend._id];
        const unreadHtml = unread ? `<span class="unread-badge">${unread}</span>` : '';
        
        item.innerHTML = `
            <img src="${friend.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="avatar-sm">
            <div class="user-info-v2">
                <div class="user-info-top">
                    <h5>${friend.name}</h5>
                    <span class="user-info-time">12:00 PM</span>
                </div>
                <div class="user-info-bottom">
                    <p>${friend.bio || 'Available'}</p>
                    ${unreadHtml}
                </div>
            </div>
        `;
        list.appendChild(item);
    });
}

function selectUser(user) {
    activeChatUser = user;
    unreadCounts[user._id] = 0; // Reset unread count
    
    document.getElementById('no-chat-selected').classList.add('d-none');
    document.getElementById('active-chat').classList.remove('d-none');
    
    document.getElementById('chat-name').textContent = user.name;
    document.getElementById('chat-avatar').src = user.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    
    const headStatus = document.getElementById('chat-status');
    headStatus.textContent = user.isOnline ? 'online' : 'offline';
    headStatus.className = `status-indicator ${user.isOnline ? 'status-online' : ''}`;

    socket.emit('join_private', user._id);
    updateChatList(currentUser.friends || []);

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
    const msgData = { content, room, receiverId: activeChatUser._id };

    socket.emit('send_message', msgData);
    appendMessage({ sender: currentUser, content, createdAt: new Date() }, true);
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
    div.innerHTML = `<div class="message-content">${msg.content}</div>`;
    container.appendChild(div);
}

function scrollToBottom() {
    const container = document.getElementById('message-container');
    container.scrollTop = container.scrollHeight;
}

// ─── Search Logic ────────────────────────────────────────────────────────────
function toggleSearch() {
    document.getElementById('requests-container').classList.add('d-none');
    const container = document.getElementById('search-container');
    container.classList.toggle('d-none');
}

async function handleSearch(query) {
    if (!query.trim()) { document.getElementById('search-results').innerHTML = ''; return; }
    const token = localStorage.getItem('chatToken');
    try {
        const res = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) displaySearchResults(data.users);
    } catch (e) { console.error('Search error', e); }
}

function displaySearchResults(users) {
    const results = document.getElementById('search-results');
    results.innerHTML = users.length === 0 ? '<div class="list-placeholder">No users found.</div>' : '';
    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'user-item-v2';
        item.innerHTML = `
            <img src="${user.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="avatar-sm">
            <div class="user-info-v2"><h5>${user.name}</h5><p>${user.phone}</p></div>
            <button class="btn btn-primary btn-sm ms-auto" onclick="sendFriendRequest('${user._id}', this)"><i class="fas fa-user-plus"></i></button>
        `;
        results.appendChild(item);
    });
}

async function sendFriendRequest(targetUserId, btn) {
    const token = localStorage.getItem('chatToken');
    try {
        btn.disabled = true;
        const res = await fetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ targetUserId })
        });
        const data = await res.json();
        if (data.success) { btn.className = 'btn btn-success btn-sm ms-auto'; btn.innerHTML = '<i class="fas fa-check"></i>'; }
    } catch (e) { btn.disabled = false; }
}

// ─── Auth / Modals ───────────────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const phone = document.getElementById('login-country').value + document.getElementById('login-phone').value.trim();
    const password = document.getElementById('login-password').value;
    try {
        const res = await fetch('/auth/login', {
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
        } else { alert(data.message); }
    } catch (err) { alert('Server error'); }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-country').value + document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    try {
        const res = await fetch('/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, password })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('chatToken', data.token);
            currentUser = data.user;
            closeModal('register-modal');
            showApp(data.user);
        } else { alert(data.message); }
    } catch (err) { alert('Server error'); }
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function switchModal(from, to) { closeModal(from); openModal(to); }

// ─── Profile Update logic ────────────────────────────────────────────────────
function openEditModal(type) {
    const modal = document.getElementById('edit-modal');
    document.getElementById('edit-type').value = type;
    document.getElementById('edit-name-group').classList.add('d-none');
    document.getElementById('edit-bio-group').classList.add('d-none');
    document.getElementById('edit-picture-group').classList.add('d-none');
    
    if (type === 'name') {
        document.getElementById('edit-name-group').classList.remove('d-none');
        document.getElementById('edit-name-input').value = currentUser.name;
    } else if (type === 'bio') {
        document.getElementById('edit-bio-group').classList.remove('d-none');
        document.getElementById('edit-bio-input').value = currentUser.bio || '';
    } else if (type === 'picture') {
        document.getElementById('edit-picture-group').classList.remove('d-none');
    }
    openModal('edit-modal');
}

function previewImage(event) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('upload-preview');
        preview.src = e.target.result;
        preview.classList.remove('d-none');
    };
    reader.readAsDataURL(event.target.files[0]);
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const type = document.getElementById('edit-type').value;
    const token = localStorage.getItem('chatToken');
    let updateData = {};
    if (type === 'name') updateData.name = document.getElementById('edit-name-input').value;
    else if (type === 'bio') updateData.bio = document.getElementById('edit-bio-input').value;
    else if (type === 'picture') updateData.picture = document.getElementById('upload-preview').src;

    try {
        const res = await fetch('/api/profile/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(updateData)
        });
        const data = await res.json();
        if (data.success) { currentUser = data.user; updateUserUI(data.user); closeModal('edit-modal'); }
    } catch (err) { console.error(err); }
}

async function handleChangePassword(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const token = localStorage.getItem('chatToken');
    try {
        const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();
        if (data.success) { alert('Password updated!'); closeModal('password-modal'); }
        else { alert(data.message); }
    } catch (e) { alert('Update failed'); }
}

async function handleDeleteAccount() {
    const token = localStorage.getItem('chatToken');
    try {
        const res = await fetch('/api/account/delete', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) { logout(); }
    } catch (e) { alert('Deletion failed'); }
}

// ─── Theme Logic ────────────────────────────────────────────────────────────
function initTheme() {
    const isDark = (localStorage.getItem('theme') || 'light') === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    updateThemeUI(isDark);
}
function toggleTheme(e) {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeUI(isDark);
}
function updateThemeUI(isDark) {
    const check = document.getElementById('theme-switch-check');
    if (check) check.checked = isDark;
}

window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };

