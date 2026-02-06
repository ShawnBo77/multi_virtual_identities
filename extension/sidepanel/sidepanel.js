const API_BASE_URL = 'http://127.0.0.1:8000';
let CLIENT_ID = null;

let serverCache = {};
let pendingChanges = {};

const usernameInput = document.getElementById('username-input');
const addFollowForm = document.getElementById('add-follow-form');
const followList = document.getElementById('follow-list');
const addCredForm = document.getElementById('add-cred-form');
const credList = document.getElementById('cred-list');

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

    try {
        let success = false;
        let response;

        if (action.type === 'FOLLOW') {
            response = await fetch(`${API_BASE_URL}/instagram/followings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Client-ID': CLIENT_ID },
                body: JSON.stringify({ followed_username: username })
            });
            if (response.ok || response.status === 409) success = true;
        } else {
            response = await fetch(`${API_BASE_URL}/instagram/followings/${username}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Client-ID': CLIENT_ID }
            });
            if (response.ok || response.status === 404) success = true;
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
        } else {
            console.warn(`[Sync] Server returned an error (${response.status}) for ${username}. Will retry later.`);
            isSyncing = false;
        }

    } catch (error) {
        console.error(`[Popup] Sync failed for ${username}:`, error);
        isSyncing = false;
    }
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

                // Remove local action if server is newer
                if (serverTime > localAction.timestamp) {
                    delete pendingChanges[username];
                    return;
                }
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
// Tab
// ==========================================

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
        if (btn.dataset.target === 'view-settings') {
            fetchCredentials();
        }
    });
});

// --- Credential Management Logic ---
async function fetchCredentials() {
    if (!CLIENT_ID) return;
    credList.innerHTML = 'Loading...';
    try {
        const res = await fetch(`${API_BASE_URL}/instagram/credentials`, {
            headers: { 'Client-ID': CLIENT_ID }
        });
        if (res.ok) {
            const creds = await res.json();
            renderCreds(creds);
        } else {
            credList.innerHTML = 'Error loading accounts.';
        }
    } catch (e) {
        credList.innerHTML = 'Failed to connect to server.';
    }
}

function renderCreds(creds) {
    credList.innerHTML = '';
    if (creds.length === 0) {
        credList.innerHTML = '<div style="text-align:center; color:#888;">No accounts linked.</div>';
        return;
    }
    creds.forEach(cred => {
        const div = document.createElement('div');
        div.className = 'cred-item';
        div.innerHTML = `
            <span>${cred.username} ${cred.is_global ? '🌐' : ''}</span>
            <span class="status-${cred.status.toLowerCase()}">${cred.status.toUpperCase()}</span>
            <button class="delete-cred-btn" data-username="${cred.username}" title="Unlink this account">✖</button>
        `;
        credList.appendChild(div);
    });
}

if (addCredForm) {
    addCredForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('cred-username').value.trim();
        const password = document.getElementById('cred-password').value.trim();
        const isGlobal = document.getElementById('cred-is-global').checked;
        const btn = addCredForm.querySelector('button');

        if (!username || !password || !CLIENT_ID) {
            alert("Please provide username, password, and ensure Client-ID is available.");
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Processing...';
        try {
            const response = await fetch(`${API_BASE_URL}/instagram/credentials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Client-ID': CLIENT_ID },
                body: JSON.stringify({ username, password, is_global: isGlobal })
            });
            if (response.ok) {
                alert('Account saved! The system will attempt to login soon.');
                document.getElementById('cred-username').value = '';
                document.getElementById('cred-password').value = '';
                document.getElementById('cred-is-global').checked = false;
                fetchCredentials();
            } else {
                const err = await response.json();
                alert(`Failed: ${err.detail || 'Unknown error'}`);
            }
        } catch (e) {
            alert('Error connecting to server.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Account';
        }
    });
}

credList.addEventListener('click', async (e) => {
    // Check if a delete button was the target of the click
    if (e.target.classList.contains('delete-cred-btn')) {
        const username = e.target.dataset.username;
        if (!username || !CLIENT_ID) return;

        // Ask for user confirmation before proceeding
        if (confirm(`Are you sure you want to unlink the account "${username}"?`)) {
            // Provide visual feedback
            e.target.disabled = true;
            e.target.textContent = '...';

            try {
                const response = await fetch(`${API_BASE_URL}/instagram/credentials/${username}`, {
                    method: 'DELETE',
                    headers: {
                        'Client-ID': CLIENT_ID
                    }
                });

                if (response.ok) { // Handles 204 No Content status
                    console.log(`Account ${username} unlinked successfully.`);
                    // Refresh the list from the server to show the change
                    fetchCredentials();
                } else {
                    const errData = await response.json();
                    alert(`Failed to unlink account: ${errData.detail || 'Unknown server error'}`);
                    // Restore button on failure
                    e.target.disabled = false;
                    e.target.textContent = '✖';
                }
            } catch (error) {
                alert('Error connecting to the server. Please try again.');
                // Restore button on network failure
                e.target.disabled = false;
                e.target.textContent = '✖';
            }
        }
    }
});

// ==========================================
// Initialization
// ==========================================

function sendMessageWithRetries(tabId, message, retries = 5) {
    console.log(`[Sidepanel] Attempting to send message (Retries left: ${retries})...`, message);

    chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
            if (retries > 0) {
                setTimeout(() => {
                    sendMessageWithRetries(tabId, message, retries - 1);
                }, 300);
            } else {
                console.error("[Sidepanel] Final retry failed. Could not establish connection.");
                alert("Failed to communicate with the Instagram page. Please ensure you are on the correct page and refresh if the problem persists.");
            }
            return;
        }

        if (response && response.status === "modal shown") {
            console.log("[Sidepanel] Success! Received confirmation from content script:", response);
        } else if (response && response.status === "error") {
            console.error("[Sidepanel] Content script reported an error:", response.message);
            alert(`An error occurred in the content script: ${response.message}`);
        } else {
            console.warn("[Sidepanel] Connection was successful, but received an unexpected or empty response:", response);
        }
    });
}

async function main() {
    await loadState();

    if (CLIENT_ID) {
        // Initial render from local cache
        renderFollowList();

        // Fetch latest from server in background
        fetchFollowingsFromServer();

        const viewSavedBtn = document.getElementById('view-saved-btn');
        if (viewSavedBtn) {
            viewSavedBtn.addEventListener('click', () => {
                chrome.tabs.query({ active: true, currentWindow: true, url: "*://*.instagram.com/*" }, (tabs) => {
                    if (tabs.length > 0) {
                        const targetTabId = tabs[0].id;
                        sendMessageWithRetries(targetTabId, { action: "showSavedPosts" });
                    } else {
                        alert("Please navigate to an Instagram page first.");
                    }
                });
            });
        }
    } else {
        followList.innerHTML = '<li style="padding:10px;">Error: Client ID not found. Please browse Instagram to register this extension.</li>';
    }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.pendingChanges || changes.serverCache) {
            console.log('[Sidepanel] Storage change detected from another script (e.g., content.js). Reloading state and re-rendering list.');

            setTimeout(async () => {
                await loadState();
                renderFollowList();
            }, 100);
        }
    }
});

document.addEventListener('DOMContentLoaded', main);