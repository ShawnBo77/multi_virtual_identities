// Calculates the current effective follow list for UI rendering.
// Merges Server Cache with Local Pending Changes.
function getEffectiveFollowList() {
    const effectiveSet = new Set();

    // Process Server Cache
    Object.keys(serverCache).forEach(username => {
        const data = serverCache[username];
        if (data.isFollowing) {
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

async function recordAction(type, username) {
    // Always record the latest action and timestamp
    pendingChanges[username] = {
        type: type,
        timestamp: Date.now()
    };

    await saveState();
    console.log(`[IG Injector] Recorded local action: ${type} ${username}`);

    processSync();
}

let isSyncing = false;

// Push local pending actions to the Server
async function processSync() {
    if (isSyncing || !CLIENT_ID) return;

    const usersToSync = Object.keys(pendingChanges);
    if (usersToSync.length === 0) return;

    isSyncing = true;

    const username = usersToSync[0];
    const action = pendingChanges[username];

    const serverData = serverCache[username];
    const serverTimestamp = serverData ? serverData.timestamp : 0;

    // If Server data is newer, discard local action
    if (serverTimestamp > action.timestamp) {
        console.log(`[IG Injector] Local action outdated for ${username}. Server: ${serverTimestamp}, Local: ${action.timestamp}. Dropping.`);
        delete pendingChanges[username];
        await saveState();
        isSyncing = false;
        processSync();
        return;
    }

    console.log(`[IG Injector] Syncing to Server: ${action.type} ${username}`);

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
            serverCache[username] = {
                timestamp: action.timestamp,
                isFollowing: (action.type === 'FOLLOW')
            };

            delete pendingChanges[username];
            await saveState();

            setTimeout(() => {
                isSyncing = false;
                processSync();
            }, 100);
        } else {
            console.warn(`[Sync] Server returned an error (${response.status}) for ${username}. Will retry later.`);
            isSyncing = false;
        }

    } catch (e) {
        console.warn(`[IG Injector] Network error syncing ${username}. Keeping in queue.`);
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
            // Format: { "username": { timestamp, isFollowing } }
            const newServerCache = {};
            serverData.forEach(item => {
                const timeMs = new Date(item.updated_at).getTime();
                newServerCache[item.followed_username] = {
                    timestamp: timeMs,
                    isFollowing: item.is_following
                };
            });

            // Reconcile Pending Changes
            Object.keys(pendingChanges).forEach(username => {
                const localAction = pendingChanges[username];

                const serverEntry = newServerCache[username];
                const serverTime = serverEntry ? serverEntry.timestamp : 0;

                // Server data is newer -> Discard local pending action
                if (serverTime > localAction.timestamp) {
                    console.log(`[IG Injector] Conflict: Server data newer for ${username}. Removed local pending action.`);
                    delete pendingChanges[username];
                    return;
                }
            });

            serverCache = newServerCache;
            await saveState();

            console.log(`[IG Injector] Server list fetched. Users: ${Object.keys(serverCache).length}, Pending Actions: ${Object.keys(pendingChanges).length}`);

            // Resume syncing if there are surviving pending changes
            processSync();
        }
    } catch (e) {
        console.log('[IG Injector] Fetch server list failed:', e);
    }
}