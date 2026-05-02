// Connect Hub - App Logic
const socket = io();
let currentUser = null;

// Steel Section Data
const steelData = {
    "Round Bar": [
        { size: "6", area: 0.28, weight: 0.22, zx: 0.02, zy: 0.02 },
        { size: "8", area: 0.50, weight: 0.39, zx: 0.05, zy: 0.05 },
        { size: "10", area: 0.79, weight: 0.62, zx: 0.10, zy: 0.10 },
        { size: "12", area: 1.13, weight: 0.89, zx: 0.17, zy: 0.17 }
    ],
    "RHS": [
        { size: "50x30x3.0", area: 4.44, weight: 3.49, zx: 6.39, zy: 4.52 },
        { size: "60x40x3.0", area: 5.64, weight: 4.43, zx: 10.3, zy: 7.92 },
        { size: "80x40x4.0", area: 8.96, weight: 7.03, zx: 21.1, zy: 13.6 },
        { size: "100x50x5.0", area: 14.0, weight: 11.0, zx: 41.8, zy: 26.4 }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    checkToken();
    initCalculator();
});

function initCalculator() {
    const typeSelect = document.getElementById('sectionType');
    const sizeSelect = document.getElementById('sectionSize');
    const lengthInput = document.getElementById('beamLength');

    typeSelect?.addEventListener('change', function() {
        const type = this.value;
        sizeSelect.innerHTML = '<option value="">-- Select Size --</option>';
        if (type && steelData[type]) {
            sizeSelect.disabled = false;
            steelData[type].forEach((item, index) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.textContent = item.size;
                sizeSelect.appendChild(opt);
            });
        } else {
            sizeSelect.disabled = true;
        }
        updateCalculation();
    });

    sizeSelect?.addEventListener('change', updateCalculation);
    lengthInput?.addEventListener('input', updateCalculation);
}

function updateCalculation() {
    const type = document.getElementById('sectionType').value;
    const index = document.getElementById('sectionSize').value;
    const length = parseFloat(document.getElementById('beamLength').value) || 0;
    const resultsArea = document.getElementById('resultsArea');

    if (type && index !== "") {
        const data = steelData[type][index];
        document.getElementById('resWeight').textContent = data.weight;
        document.getElementById('resArea').textContent = data.area;
        document.getElementById('resZx').textContent = data.zx;
        document.getElementById('resZy').textContent = data.zy;
        resultsArea.classList.remove('d-none');

        const total = data.weight * length;
        document.getElementById('totalWeight').textContent = total.toFixed(2);
    } else {
        resultsArea.classList.add('d-none');
        document.getElementById('totalWeight').textContent = "0.00";
    }
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function hideWelcomeScreen() {
    const screen = document.getElementById('welcome-screen');
    if (screen) {
        screen.style.opacity = '0';
        setTimeout(() => screen.style.visibility = 'hidden', 500);
    }
}

async function checkToken() {
    const token = localStorage.getItem('chatToken');
    if (token) {
        // Mock auth for demo
        hideWelcomeScreen();
    }
}
