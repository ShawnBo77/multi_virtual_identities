const API_BASE_URL = "http://127.0.0.1:8000";

// Centralized state
let serverCache = {};
let pendingChanges = {};
let CLIENT_ID = null;
let isSyncing = false;

const PLATFORM_CONFIG = {
    instagram: {
        ruleId: 1001,
        filter: "*://*.instagram.com/*",
    },
};

// ==========================================
// Client ID Management (NEW & CENTRALIZED)
// ==========================================

/**
 * Handle login or registration requests from the sidepanel
 * @param {string} mode - "login" or "register"
 * @param {object} payload - {username, password}
 */
async function handleUserAuth(mode, payload) {
    const endpoint = mode === "login" ? "/login" : "/register";
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (response.ok) {
            // Save clientID and username to storage
            CLIENT_ID = data.id;
            await chrome.storage.local.set({
                clientID: data.id,
                username: data.username,
            });

            // Re-initialize alarms after successful login
            initializeAlarms();
            return { status: "success", data: data };
        } else {
            return {
                status: "error",
                message: data.detail || "Authentication failed",
            };
        }
    } catch (error) {
        console.error(`[Background] Auth error (${mode}):`, error);
        return { status: "error", message: "Server connection failed" };
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
// Update User-Agent
// ==========================================

async function updatePlatformUA(platform, userAgent) {
    const config = PLATFORM_CONFIG[platform];
    if (!config || !userAgent) return;

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [config.ruleId],
        addRules: [
            {
                id: config.ruleId,
                priority: 1,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [
                        {
                            header: "user-agent",
                            operation: "set",
                            value: userAgent,
                        },
                    ],
                },
                condition: {
                    urlFilter: config.filter,
                    resourceTypes: [
                        "main_frame",
                        "sub_frame",
                        "xmlhttprequest",
                        "script",
                    ],
                },
            },
        ],
    });
    console.log(`[Background] User-Agent rule updated for ${platform}.`);
}

// ==========================================
// Event Listeners & Initialization
// ==========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "login" || request.action === "register") {
        handleUserAuth(request.action, request.payload).then(sendResponse);
        return true; // Keep channel open for async fetch
    }

    if (request.action === "logout") {
        chrome.storage.local.remove(
            ["clientID", "username", "serverCache", "pendingChanges"],
            () => {
                CLIENT_ID = null;
                chrome.alarms.clearAll();
                sendResponse({ status: "success" });
            },
        );
        return true;
    }

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

    // Use an async function inside the listener to wait for storage
    (async () => {
        // Recovery: Re-fetch ID from storage if it was lost in memory
        if (!CLIENT_ID) {
            const data = await chrome.storage.local.get("clientID");
            CLIENT_ID = data.clientID || null;
        }

        if (!CLIENT_ID) {
            sendResponse({
                status: "error",
                message: "Client ID not found. Please login.",
            });
            return;
        }

        // Forwarding message from sidepanel to content script
        if (request.action === "showSavedPosts") {
            chrome.tabs.query(
                {
                    active: true,
                    currentWindow: true,
                    url: "*://*.instagram.com/*",
                },
                (tabs) => {
                    if (tabs.length > 0) {
                        chrome.tabs.sendMessage(
                            tabs[0].id,
                            { action: "renderSavedPosts" },
                            (response) => {
                                if (chrome.runtime.lastError) {
                                    sendResponse({
                                        status: "error",
                                        message:
                                            chrome.runtime.lastError.message,
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
        else if (request.action === "getClientID") {
            sendResponse({ clientID: CLIENT_ID });
            return true;
        }
        // getState
        else if (request.action === "getState") {
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
        // getCredentials
        else if (request.action === "getCredentials") {
            if (!CLIENT_ID) {
                sendResponse({
                    status: "error",
                    message: "Client ID not found.",
                });
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
        // addCredential
        else if (request.action === "addCredential") {
            if (!CLIENT_ID) {
                sendResponse({
                    status: "error",
                    message: "Client ID not found.",
                });
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
        // updateCredentialSettings
        else if (request.action === "updateCredentialSettings") {
            fetch(
                `${API_BASE_URL}/instagram/credentials/${request.username}/settings`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "Client-ID": CLIENT_ID,
                    },
                    body: JSON.stringify({
                        fetch_feed: request.payload.fetch_feed,
                    }),
                },
            )
                .then((res) => res.json())
                .then((data) => sendResponse({ status: "success", data }))
                .catch((err) =>
                    sendResponse({ status: "error", message: err.message }),
                );
            return true;
        }
        // deleteCredential
        else if (request.action === "deleteCredential") {
            if (!CLIENT_ID) {
                sendResponse({
                    status: "error",
                    message: "Client ID not found.",
                });
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
        // switchIdentity
        else if (request.action === "switchIdentity") {
            const { platform, username } = request;

            try {
                const response = await fetch(
                    `${API_BASE_URL}/instagram/credentials/${username}`,
                    {
                        headers: { "Client-ID": CLIENT_ID },
                    },
                );

                if (!response.ok)
                    throw new Error("Failed to fetch cookies from server");

                const data = await response.json();
                if (!data.cookies || data.cookies.length === 0) {
                    throw new Error("No valid cookies found for this identity");
                }

                console.log(`[Background] Switching to identity: ${username}`);

                const storageKey = `active_user_${platform}`;
                await chrome.storage.local.set({
                    [storageKey]: username,
                });

                // Update User-Agent
                if (data.user_agent) {
                    await updatePlatformUA(platform, data.user_agent);
                }

                // Clear existing Instagram cookies to avoid session conflicts
                const currentCookies = await chrome.cookies.getAll({
                    domain: ".instagram.com",
                });
                for (let cookie of currentCookies) {
                    await chrome.cookies.remove({
                        url: `https://www.instagram.com${cookie.path}`,
                        name: cookie.name,
                    });
                }

                // Inject new cookies
                for (let c of data.cookies) {
                    // Map Selenium cookie format to Chrome Extension format
                    await chrome.cookies.set({
                        url: "https://www.instagram.com",
                        name: c.name,
                        value: c.value,
                        domain: c.domain || ".instagram.com",
                        path: c.path || "/",
                        secure: c.secure || true,
                        httpOnly: c.httpOnly || false,
                        expirationDate:
                            c.expiry || Date.now() / 1000 + 3600 * 24 * 30, // Default 30 days
                    });
                }

                // Reload active Instagram tabs to apply the new identity
                chrome.tabs.query({ url: "*://*.instagram.com/*" }, (tabs) => {
                    tabs.forEach((tab) => chrome.tabs.reload(tab.id));
                });

                sendResponse({
                    status: "success",
                    message: `Switched to ${username}`,
                });
            } catch (err) {
                console.error("[Background] Identity switch error:", err);
                sendResponse({ status: "error", message: err.message });
            }
            return true;
        }
    })();
    return true;
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

function initializeAlarms() {
    if (!CLIENT_ID) return;
    chrome.alarms.create("process-sync", {
        delayInMinutes: 0.1,
        periodInMinutes: 1,
    });
    chrome.alarms.create("fetch-server-list", {
        delayInMinutes: 0.2,
        periodInMinutes: 1,
    });
}

async function initializeExtension() {
    await loadState();

    if (CLIENT_ID) {
        initializeAlarms();
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
