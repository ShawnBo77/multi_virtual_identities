const API_BASE_URL = "http://127.0.0.1:8000";

// Centralized state
let serverCache = {};
let pendingChanges = {};
let CLIENT_ID = null;
let isSyncing = false;

// ==========================================
// Client ID Management (NEW & CENTRALIZED)
// ==========================================

async function registerClient() {
    try {
        const response = await fetch(`${API_BASE_URL}/clients`, {
            method: "POST",
        });
        if (response.ok) {
            const newClient = await response.json();
            return newClient.id;
        }
        return null;
    } catch (error) {
        console.error("[Background] Failed to register client:", error);
        return null;
    }
}

async function getClientID() {
    const data = await chrome.storage.local.get("clientID");
    if (data.clientID) {
        CLIENT_ID = data.clientID;
        console.log(`[Background] Client ID loaded from storage: ${CLIENT_ID}`);
    } else {
        console.log(
            "[Background] Client ID not found. Registering new client...",
        );
        const newId = await registerClient();
        if (newId) {
            CLIENT_ID = newId;
            await chrome.storage.local.set({ clientID: newId });
            console.log(
                `[Background] New Client ID registered and saved: ${CLIENT_ID}`,
            );
        } else {
            console.error(
                "[Background] CRITICAL: Failed to get a Client ID. Core functions will be disabled.",
            );
        }
    }
}

// ==========================================
// State & Sync Logic
// ==========================================

async function loadState() {
    const data = await chrome.storage.local.get([
        "serverCache",
        "pendingChanges",
        "clientID",
    ]);
    serverCache = data.serverCache || {};
    pendingChanges = data.pendingChanges || {};
    CLIENT_ID = data.clientID || null;
    console.log("[Background] State loaded.");
}

async function saveState() {
    await chrome.storage.local.set({
        serverCache: serverCache,
        pendingChanges: pendingChanges,
    });
}

// Function to notify UI scripts of state changes
async function broadcastStateUpdate() {
    console.log("[Background] Broadcasting state update to UI scripts.");
    // Notify side panel
    try {
        await chrome.runtime.sendMessage({ action: "stateUpdated" });
    } catch (error) {
        // This might error if the side panel isn't open, which is fine.
    }
}

function getEffectiveFollowList() {
    const effectiveSet = new Set();
    Object.keys(serverCache).forEach((username) => {
        if (serverCache[username] && serverCache[username].isFollowing) {
            effectiveSet.add(username);
        }
    });
    Object.keys(pendingChanges).forEach((username) => {
        const change = pendingChanges[username];
        if (change.type === "FOLLOW") {
            effectiveSet.add(username);
        } else if (change.type === "UNFOLLOW") {
            effectiveSet.delete(username);
        }
    });
    return Array.from(effectiveSet);
}

async function recordAction(type, username) {
    if (!CLIENT_ID) {
        console.error(
            "[Background] Client ID not found. Cannot record action.",
        );
        return;
    }
    console.log(`[Background] Recording action: ${type} ${username}`);
    pendingChanges[username] = {
        type: type,
        timestamp: Date.now(),
    };
    await saveState();
    await broadcastStateUpdate();
    processSync(); // Trigger sync immediately
}

// Push local pending actions to the Server.
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
        console.log(`[Background] Action outdated for ${username}. Dropping.`);
        delete pendingChanges[username];
        await saveState();
        isSyncing = false;
        await broadcastStateUpdate();
        processSync(); // Check for next item
        return;
    }

    console.log(`[IG Injector] Syncing to Server: ${action.type} ${username}`);

    try {
        let success = false;
        let response;

        if (action.type === "FOLLOW") {
            response = await fetch(`${API_BASE_URL}/instagram/followings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Client-ID": CLIENT_ID,
                },
                body: JSON.stringify({ followed_username: username }),
            });
            if (response.ok || response.status === 409) success = true;
        } else {
            // UNFOLLOW
            response = await fetch(
                `${API_BASE_URL}/instagram/followings/${username}`,
                {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                        "Client-ID": CLIENT_ID,
                    },
                },
            );
            if (response.ok || response.status === 404) success = true;
        }

        if (success) {
            console.log(`[Background] Sync success for ${username}`);
            serverCache[username] = {
                timestamp: action.timestamp,
                isFollowing: action.type === "FOLLOW",
            };
            delete pendingChanges[username];
            await saveState();
        } else {
            console.warn(
                `[Sync] Server error (${response.status}) for ${username}. Will retry later.`,
            );
        }
    } catch (error) {
        console.error(
            `[Background] Sync network failed for ${username}:`,
            error,
        );
    } finally {
        isSyncing = false;
        await broadcastStateUpdate();
        // If there are more items, process them after a short delay
        if (Object.keys(pendingChanges).length > 0) {
            setTimeout(processSync, 100);
        }
    }
}

async function fetchFollowingsFromServer() {
    if (!CLIENT_ID) return;
    console.log("[Background] Fetching followings from server...");

    try {
        const response = await fetch(`${API_BASE_URL}/instagram/followings`, {
            headers: { "Client-ID": CLIENT_ID },
        });
        if (!response.ok) return;

        const serverData = await response.json();
        const newServerCache = {};
        serverData.forEach((item) => {
            newServerCache[item.followed_username] = {
                timestamp: new Date(item.updated_at).getTime(),
                isFollowing: item.is_following,
            };
        });

        // Reconcile with pending changes
        Object.keys(pendingChanges).forEach((username) => {
            const localAction = pendingChanges[username];
            const serverEntry = newServerCache[username];
            const serverTime = serverEntry ? serverEntry.timestamp : 0;

            // Server data is newer -> Discard local pending action
            if (serverTime > localAction.timestamp) {
                console.log(
                    `[Background] Conflict resolved: Server is newer for ${username}. Removing local change.`,
                );
                delete pendingChanges[username];
            }
        });

        serverCache = newServerCache;
        await saveState();
        await broadcastStateUpdate();
        processSync(); // Trigger sync for any remaining items
    } catch (error) {
        console.error("[Background] Failed to fetch server list:", error);
    }
}

// ==========================================
// Event Listeners & Initialization
// ==========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "recordAction") {
        recordAction(request.type, request.username);
        sendResponse({ status: "ok" });
        return true;
    }

    if (request.action === "getEffectiveFollowList") {
        const list = getEffectiveFollowList();
        sendResponse({ status: "success", data: list });
        return true;
    }

    // Forwarding message from sidepanel to content script
    if (request.action === "showSavedPosts") {
        chrome.tabs.query(
            { active: true, currentWindow: true, url: "*://*.instagram.com/*" },
            (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(
                        tabs[0].id,
                        { action: "renderSavedPosts" },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                sendResponse({
                                    status: "error",
                                    message: chrome.runtime.lastError.message,
                                });
                            } else {
                                sendResponse(response);
                            }
                        },
                    );
                } else {
                    sendResponse({
                        status: "error",
                        message: "No active Instagram tab found.",
                    });
                }
            },
        );
        return true;
    }

    // When the content script initializes, it might need the client ID
    if (request.action === "getClientID") {
        sendResponse({ clientID: CLIENT_ID });
        return true;
    }

    if (request.action === "getState") {
        const effectiveList = getEffectiveFollowList();
        sendResponse({
            status: "success",
            data: {
                serverCache: serverCache,
                pendingChanges: pendingChanges,
                effectiveFollowList: effectiveList,
                clientID: CLIENT_ID,
            },
        });
        return true;
    }

    if (request.action === "getCredentials") {
        if (!CLIENT_ID) {
            sendResponse({ status: "error", message: "Client ID not found." });
            return true;
        }
        fetch(`${API_BASE_URL}/instagram/credentials`, {
            headers: { "Client-ID": CLIENT_ID },
        })
            .then((res) => {
                if (!res.ok) throw new Error(`Server error: ${res.status}`);
                return res.json();
            })
            .then((data) => sendResponse({ status: "success", data: data }))
            .catch((err) =>
                sendResponse({ status: "error", message: err.message }),
            );
        return true; // Keep the message channel open for the async response
    }

    if (request.action === "addCredential") {
        if (!CLIENT_ID) {
            sendResponse({ status: "error", message: "Client ID not found." });
            return true;
        }
        fetch(`${API_BASE_URL}/instagram/credentials`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Client-ID": CLIENT_ID,
            },
            body: JSON.stringify(request.payload),
        })
            .then(async (res) => {
                if (res.ok) {
                    sendResponse({ status: "success" });
                } else {
                    const err = await res.json();
                    sendResponse({
                        status: "error",
                        message: err.detail || "Unknown error",
                    });
                }
            })
            .catch((err) =>
                sendResponse({ status: "error", message: err.message }),
            );
        return true;
    }

    if (request.action === "deleteCredential") {
        if (!CLIENT_ID) {
            sendResponse({ status: "error", message: "Client ID not found." });
            return true;
        }
        fetch(`${API_BASE_URL}/instagram/credentials/${request.username}`, {
            method: "DELETE",
            headers: { "Client-ID": CLIENT_ID },
        })
            .then((res) => {
                if (res.ok) {
                    // Handles 204 No Content
                    sendResponse({ status: "success" });
                } else {
                    sendResponse({
                        status: "error",
                        message: "Failed to delete on server.",
                    });
                }
            })
            .catch((err) =>
                sendResponse({ status: "error", message: err.message }),
            );
        return true;
    }
});

// Open Side Panel on Action Click
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
});

// Use alarms for periodic tasks
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "process-sync") {
        processSync();
    }
    if (alarm.name === "fetch-server-list") {
        fetchFollowingsFromServer();
    }
});

async function initializeExtension() {
    await getClientID();
    await loadState();

    if (CLIENT_ID) {
        console.log("[Background] ClientID exists. Setting up alarms.");
        chrome.alarms.create("process-sync", {
            delayInMinutes: 0.1,
            periodInMinutes: 1,
        });
        chrome.alarms.create("fetch-server-list", {
            delayInMinutes: 0.2,
            periodInMinutes: 1,
        });
    } else {
        console.warn("[Background] No ClientID, alarms will not be created.");
    }
}

// Service Worker startup logic
chrome.runtime.onStartup.addListener(initializeExtension);

// Initialize on first install
chrome.runtime.onInstalled.addListener(initializeExtension);

// Initial load when the script starts
initializeExtension();
