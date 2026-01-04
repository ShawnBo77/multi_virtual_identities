const API_BASE_URL = 'http://127.0.0.1:8000';
let CLIENT_ID = null;

let serverCache = {};
let pendingChanges = {};

const usernameInput = document.getElementById('username-input');
const addFollowForm = document.getElementById('add-follow-form');
const followList = document.getElementById('follow-list');

// ==========================================
// State Management & Synchronization
// ==========================================

async function loadState() {
    const data = await chrome.storage.local.get(['serverCache', 'pendingChanges', 'clientID']);
    serverCache = data.serverCache || {};
    pendingChanges = data.pendingChanges || {};
    CLIENT_ID = data.clientID || null;
}

async function saveState() {
    await chrome.storage.local.set({
        'serverCache': serverCache,
        'pendingChanges': pendingChanges
    });
}

// Calculate the effective list for UI rendering
function getEffectiveFollowList() {
    const effectiveSet = new Set();

    // Process Server Cache
    Object.keys(serverCache).forEach(username => {
        const data = serverCache[username];
        if (data && data.isFollowing) {
            effectiveSet.add(username);
        }
    });

    // Apply Local Pending Changes
    Object.keys(pendingChanges).forEach(username => {
        const change = pendingChanges[username];
        if (change.type === 'FOLLOW') {
            effectiveSet.add(username);
        } else if (change.type === 'UNFOLLOW') {
            effectiveSet.delete(username);
        }
    });

    return Array.from(effectiveSet);
}

// Record an action to the local queue
async function recordAction(type, username) {
    if (!CLIENT_ID) {
        alert("Client ID not found. Please visit Instagram first.");
        return;
    }

    // Reload state before modifying to ensure we have the latest data from content.js
    await loadState();

    // LWW: Always overwrite with the latest action and timestamp
    pendingChanges[username] = {
        type: type,
        timestamp: Date.now()
    };

    await saveState();
    console.log(`[Popup] Recorded local action: ${type} ${username}`);

    renderFollowList();

    // Trigger background sync
    processSync();
}

let isSyncing = false;

async function processSync() {
    if (isSyncing || !CLIENT_ID) return;

    // Reload state to get the latest queue
    await loadState();

    const usersToSync = Object.keys(pendingChanges);
    if (usersToSync.length === 0) return;

    isSyncing = true;
    const username = usersToSync[0];
    const action = pendingChanges[username];

    // Read server data
    const serverData = serverCache[username];
    const serverTimestamp = serverData ? serverData.timestamp : 0;
    // const isFollowedInServer = serverData ? serverData.isFollowing : false;

    if (serverTimestamp > action.timestamp) {
        console.log(`[Popup] Action outdated for ${username}. Dropping.`);
        delete pendingChanges[username];
        await saveState();
        isSyncing = false;
        processSync();
        return;
    }

    // if ((action.type === 'FOLLOW' && isFollowedInServer) ||
    //     (action.type === 'UNFOLLOW' && !isFollowedInServer)) {
    //     console.log(`[Popup] Action matches server state for ${username}. Dropping.`);
    //     delete pendingChanges[username];
    //     await saveState();
    //     isSyncing = false;
    //     processSync();
    //     return;
    // }

    try {
        let success = false;
        if (action.type === 'FOLLOW') {
            const res = await fetch(`${API_BASE_URL}/instagram/followings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Client-ID': CLIENT_ID },
                body: JSON.stringify({ followed_username: username })
            });
            if (res.ok || res.status === 409) success = true;
        } else {
            const res = await fetch(`${API_BASE_URL}/instagram/followings/${username}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Client-ID': CLIENT_ID }
            });
            if (res.ok || res.status === 404) success = true;
        }

        if (success) {
            // Update local cache to match server state
            serverCache[username] = {
                timestamp: action.timestamp,
                isFollowing: (action.type === 'FOLLOW')
            };
            delete pendingChanges[username];
            await saveState();

            // Continue syncing
            setTimeout(() => {
                isSyncing = false;
                processSync();
            }, 100);
            return;
        }
    } catch (error) {
        console.error(`[Popup] Sync failed for ${username}:`, error);
    }

    isSyncing = false;
}

async function fetchFollowingsFromServer() {
    if (!CLIENT_ID) return;

    try {
        const response = await fetch(`${API_BASE_URL}/instagram/followings`, {
            headers: { 'Client-ID': CLIENT_ID }
        });

        if (response.ok) {
            const serverData = await response.json();

            // Rebuild Server Cache
            const newServerCache = {};
            serverData.forEach(item => {
                const timeMs = new Date(item.updated_at).getTime();
                newServerCache[item.followed_username] = {
                    timestamp: timeMs,
                    isFollowing: item.is_following
                };
            });

            // Resolve Conflicts
            await loadState(); // Refresh pending changes
            Object.keys(pendingChanges).forEach(username => {
                const localAction = pendingChanges[username];
                const serverEntry = newServerCache[username];
                const serverTime = serverEntry ? serverEntry.timestamp : 0;
                // const isServerFollowed = serverEntry ? serverEntry.isFollowing : false;

                // Remove local action if server is newer
                if (serverTime > localAction.timestamp) {
                    delete pendingChanges[username];
                    return;
                }

                // Remove local action if state matches
                // if ((localAction.type === 'FOLLOW' && isServerFollowed) ||
                //     (localAction.type === 'UNFOLLOW' && !isServerFollowed)) {
                //     delete pendingChanges[username];
                // }
            });

            serverCache = newServerCache;
            await saveState();
            renderFollowList(); // Refresh UI
            processSync(); // Trigger sync for remaining items
        }
    } catch (error) {
        console.error('[Popup] Failed to fetch server list:', error);
    }
}

// ==========================================
// UI rendering
// ==========================================

function renderFollowList() {
    const effectiveList = getEffectiveFollowList();

    followList.innerHTML = '';
    if (effectiveList.length === 0) {
        followList.innerHTML = '<li style="color:#888; text-align:center;">No users followed yet</li>';
        return;
    }

    effectiveList.forEach(username => {
        const li = document.createElement('li');
        li.dataset.username = username;

        // Container for styling
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '8px 0';
        li.style.borderBottom = '1px solid #eee';

        const userSpan = document.createElement('span');
        userSpan.className = 'user-text';
        userSpan.textContent = username;
        userSpan.style.fontWeight = '500';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Unfollow';
        // Basic styling for the button
        removeBtn.style.backgroundColor = '#ff4d4d';
        removeBtn.style.color = 'white';
        removeBtn.style.border = 'none';
        removeBtn.style.padding = '4px 8px';
        removeBtn.style.borderRadius = '4px';
        removeBtn.style.cursor = 'pointer';

        li.appendChild(userSpan);
        li.appendChild(removeBtn);
        followList.appendChild(li);
    });
}

// ==========================================
// Event Listeners
// ==========================================

addFollowForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();

    if (!username) {
        alert("Please enter a username.");
        return;
    }

    // Disable input temporarily
    usernameInput.disabled = true;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Adding...';

    // Record action to queue (LWW)
    await recordAction('FOLLOW', username);

    // Reset UI
    usernameInput.value = '';
    usernameInput.disabled = false;
    btn.disabled = false;
    btn.textContent = 'Add Follow';
});

followList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove-btn')) {
        const li = e.target.closest('li');
        const usernameToRemove = li.dataset.username;

        if (usernameToRemove) {
            console.log(`[Popup] Unfollowing: ${usernameToRemove}`);
            e.target.disabled = true;
            e.target.textContent = '...';

            // Record action to queue (LWW)
            await recordAction('UNFOLLOW', usernameToRemove);
        }
    }
});

// ==========================================
// Initialization
// ==========================================

async function main() {
    await loadState();

    if (CLIENT_ID) {
        // Initial render from local cache
        renderFollowList();

        // Fetch latest from server in background
        fetchFollowingsFromServer();
    } else {
        followList.innerHTML = '<li style="padding:10px;">Error: Client ID not found. Please browse Instagram to register this extension.</li>';
    }
}

document.addEventListener('DOMContentLoaded', main);