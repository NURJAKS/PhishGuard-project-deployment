
const API_URL = "https://phishguard.ddns.net";
let currentSector = 'Public';
let allRoles = [];
let allPermissions = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadRoles();
    loadUsers();
});

async function apiRequest(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('phishguard_token');
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_URL}${endpoint}`, options);
        if (response.status === 401 || response.status === 403) {
            // Handle unauthorized - for now just log
            console.error("Unauthorized request");
        }
        return await response.json();
    } catch (err) {
        console.error("API Error:", err);
        return null;
    }
}

function switchTab(tab) {
    // Hide all sections
    document.getElementById('section-users').style.display = 'none';
    document.getElementById('section-settings').style.display = 'none';
    document.getElementById('section-mass').style.display = 'none';

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    if (['Public', 'Business', 'Government'].includes(tab)) {
        document.getElementById('section-users').style.display = 'block';
        currentSector = tab;
        document.getElementById('sector-title').innerText = `Сектор: ${tab === 'Public' ? 'Народ' : tab === 'Business' ? 'Бизнес' : 'Государство'}`;
        event.currentTarget.classList.add('active');
        loadUsers();
    } else if (tab === 'Settings') {
        document.getElementById('section-settings').style.display = 'block';
        event.currentTarget.classList.add('active');
        loadRolePermissions();
    } else if (tab === 'Mass') {
        document.getElementById('section-mass').style.display = 'block';
        event.currentTarget.classList.add('active');
        updateMassRoles();
    }
}

async function loadRoles() {
    const roles = await apiRequest('/admin/roles');
    if (roles) {
        allRoles = roles;
    }
}

async function loadUsers() {
    const tbody = document.getElementById('user-table-body');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Загрузка...</td></tr>';

    const users = await apiRequest(`/admin/users?sector=${currentSector}`);
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Пользователи не найдены</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    users.forEach(user => {
        const tr = document.createElement('tr');
        const roleBadge = `badge-sector-${user.sector.toLowerCase()}`;

        tr.innerHTML = `
            <td>
                <div class="user-info">
                    <div class="user-avatar">${user.username.substring(0, 2).toUpperCase()}</div>
                    <div>
                        <div style="font-weight: 600;">${user.username}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${user.email || 'Нет email'}</div>
                    </div>
                </div>
            </td>
            <td><span class="badge ${roleBadge}">${user.sector}</span></td>
            <td><span style="font-weight: 500;">${user.role_name || 'Public'}</span></td>
            <td>
                <div style="display:flex; gap:4px; flex-wrap: wrap;">
                    ${user.status === 'pending' ? '<span class="badge" style="background:#475569; color:white;">Ожидает проверки</span>' : ''}
                    <span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted);">...</span>
                </div>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-outline tooltip" data-tip="Изменить роль" onclick="openChangeRoleModal(${user.id}, '${user.username}', '${user.sector}')">✏️</button>
                    <button class="btn btn-danger tooltip" data-tip="Удалить пользователя">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openChangeRoleModal(userId, username, sector) {
    const modal = document.getElementById('modal-role-confirm');
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');

    title.innerText = `Изменение роли: ${username}`;

    let extraFields = '';
    if (sector === 'Business') {
        extraFields = `
            <div class="form-group">
                <label>Корпоративный Email</label>
                <input type="email" class="form-control" placeholder="company@example.com" id="confirm-email">
            </div>
        `;
    } else if (sector === 'Government') {
        extraFields = `
            <div style="padding: 15px; background: rgba(30, 58, 138, 0.2); border-radius: 8px; margin-bottom: 20px; font-size: 13px;">
                🚨 <strong>Внимание:</strong> Только администратор может подтвердить статус Government. Действие будет записано в аудит.
            </div>
        `;
    }

    content.innerHTML = `
        <div class="form-group">
            <label>Новая роль</label>
            <select class="form-control" id="new-role-id">
                ${allRoles.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
            </select>
        </div>
        ${extraFields}
    `;

    document.getElementById('modal-confirm-btn').onclick = () => confirmRoleChange(userId, sector);
    modal.style.display = 'flex';
}

async function confirmRoleChange(userId, sector) {
    const roleId = document.getElementById('new-role-id').value;
    const email = document.getElementById('confirm-email')?.value;

    const res = await apiRequest(`/admin/users/${userId}/role`, 'PATCH', {
        role_id: parseInt(roleId),
        confirm_email: email
    });

    if (res && res.success) {
        closeModal();
        loadUsers();
    }
}

function closeModal() {
    document.getElementById('modal-role-confirm').style.display = 'none';
}

async function loadRolePermissions() {
    const roleId = document.getElementById('role-select').value;
    const grid = document.getElementById('permissions-grid');
    grid.innerHTML = 'Загрузка...';

    // Load all perms if not loaded
    if (allPermissions.length === 0) {
        const perms = ["view_reports", "send_links", "manage_team", "access_analytics", "monitor_regions", "control_policies"];
        allPermissions = perms.map((p, i) => ({ id: i + 1, name: p }));
    }

    const rolePerms = await apiRequest(`/admin/roles/${roleId}/permissions`);
    const activePermNames = (rolePerms || []).map(p => p.name);

    grid.innerHTML = '';
    allPermissions.forEach(p => {
        const div = document.createElement('div');
        div.className = 'perm-item';
        div.innerHTML = `
            <input type="checkbox" id="perm-${p.id}" value="${p.id}" ${activePermNames.includes(p.name) ? 'checked' : ''}>
            <label for="perm-${p.id}">${p.name}</label>
        `;
        grid.appendChild(div);
    });
}

async function saveRolePermissions() {
    const roleId = document.getElementById('role-select').value;
    const selectedIds = Array.from(document.querySelectorAll('#permissions-grid input:checked')).map(i => parseInt(i.value));

    const res = await apiRequest(`/admin/roles/${roleId}/permissions`, 'PATCH', selectedIds);
    if (res && res.success) {
        alert("Сохранено!");
    }
}

function updateMassRoles() {
    const select = document.getElementById('mass-role');
    select.innerHTML = allRoles.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
}

async function applyMassChanges() {
    const sector = document.getElementById('mass-sector').value;
    const roleId = document.getElementById('mass-role').value;

    const confirm = window.confirm(`Применить новую роль ко всем пользователям в секторе ${sector}?`);
    if (confirm) {
        // Here we'd call a mass update endpoint if it existed, or loop
        alert("Изменения поставлены в очередь (имитация)");
    }
}
