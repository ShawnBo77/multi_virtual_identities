export const InstagramHandler = {
    /**
     * Platform-specific internal state.
     */
    state: {
        followingCache: {}, // server's data
        pendingChanges: {},
        credentialsCache: [],
        isSyncing: false,
        config: {
            ruleId: 1001,
            filter: "*://*.instagram.com/*",
            syncAlarmName: "instagram:periodic-sync",
        },
    },

    /**
     * Platform Initialization.
     */
    async init(context) {
        console.log("[Instagram] Initializing platform...");
        const { clientID, apiBase, broadcastFn } = context;

        // Load data from storage
        await this.loadState(clientID);

        // Perform an initial data fetch
        if (clientID) {
            await this.fetchFollowings(clientID, apiBase, broadcastFn);

            // Setup platform-specific alarms
            // We use a prefix for the alarm name to avoid collisions with other platforms
            chrome.alarms.create(this.state.config.syncAlarmName, {
                periodInMinutes: 5,
            });
        }
    },

    /**
     * Handles alarms triggered by the browser.
     */
    async onAlarm(alarm, context) {
        if (alarm.name === this.state.config.syncAlarmName) {
            console.log("[Background-Ins] Periodic sync alarm triggered.");
            const { clientID, apiBase, broadcastFn } = context;
            await this.fetchFollowings(clientID, apiBase, broadcastFn);
            await this.fetchCredentials(clientID, apiBase, broadcastFn);
        }
    },

    /**
     * Routes messages from the UI to specific Instagram logic
     */
    async handleAction(action, request, context) {
        const { clientID, apiBase, broadcastFn } = context;

        switch (action) {
            case "getState":
                return {
                    status: "success",
                    data: {
                        followings: this.state.followingCache,
                        pendingChanges: this.state.pendingChanges,
                        credentials: this.state.credentialsCache,
                        effectiveFollowList: this.getEffectiveFollowList(),
                        clientID: clientID,
                    },
                };

            case "getClientID":
                return { clientID: clientID };

            case "recordAction":
                await this.recordAction(
                    request.username,
                    request.type,
                    clientID,
                    broadcastFn,
                    apiBase,
                );
                return { status: "ok" };

            case "getEffectiveFollowList":
                return {
                    status: "success",
                    data: this.getEffectiveFollowList(),
                };

            case "getCredentials":
                await this.fetchCredentials(clientID, apiBase, broadcastFn);
                return { status: "success", data: this.state.credentialsCache };

            case "addCredential":
                return await this.addCredential(
                    request.payload,
                    clientID,
                    apiBase,
                    broadcastFn,
                );

            case "updateCredentialSettings":
                return await this.updateCredentialSettings(
                    request.username,
                    request.payload,
                    clientID,
                    apiBase,
                    broadcastFn,
                );

            case "deleteCredential":
                return await this.deleteCredential(
                    request.username,
                    clientID,
                    apiBase,
                    broadcastFn,
                );

            case "saveCurrentAsOriginal":
                await this.saveOriginalIdentity();
                return { status: "success" };

            case "revertToOriginal":
                await this.revertToOriginal(
                    clientID,
                    apiBase,
                    broadcastFn,
                    request.redirectUrl,
                );
                return { status: "success" };

            case "switchIdentity":
                await this.switchIdentity(
                    request.username,
                    clientID,
                    apiBase,
                    broadcastFn,
                    request.redirectUrl,
                );
                return { status: "success" };

            case "triggerFollowListSync":
                this.fetchFollowings(clientID, apiBase, broadcastFn);
                return { status: "sync_started" };

            case "showSavedPosts":
                return await this.forwardToContentScript("renderSavedPosts");

            default:
                throw new Error(
                    `Action ${action} not implemented for Instagram`,
                );
        }
    },

    toSeleniumCookies(chromeCookies) {
        if (!chromeCookies || !Array.isArray(chromeCookies)) return [];

        return chromeCookies.map((c) => {
            const cookieObj = {
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                secure: c.secure,
                httpOnly: c.httpOnly,
            };

            // Translate Chrome float timestamp into standard integer expiry for Python Selenium
            if (c.expirationDate !== undefined) {
                cookieObj.expiry = Math.floor(c.expirationDate);
            }

            return cookieObj;
        });
    },

    /**
     * Pushes local following pending changes to the server.
     */
    async syncFollowings(clientID, apiBase, broadcastFn) {
        if (this.state.isSyncing || !clientID) return;

        const pending = this.state.pendingChanges;
        const usersToSync = Object.keys(pending);
        if (usersToSync.length === 0) return;

        this.state.isSyncing = true;
        try {
            for (const username of usersToSync) {
                const action = pending[username];
                const serverTimestamp =
                    this.state.followingCache[username]?.timestamp || 0;

                // If Server data is newer, discard local action
                if (serverTimestamp > action.timestamp) {
                    console.log(
                        `[Background-Ins] Action outdated for ${username}. Dropping.`,
                    );
                    delete pending[username];
                    continue;
                }

                let success = false;
                let response;

                if (action.type === "FOLLOW") {
                    response = await fetch(`${apiBase}/instagram/followings`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Client-ID": clientID,
                        },
                        body: JSON.stringify({
                            followed_username: username,
                        }),
                    });
                    if (response.ok || response.status === 409) success = true;
                } else {
                    // UNFOLLOW
                    response = await fetch(
                        `${apiBase}/instagram/followings/${username}`,
                        {
                            method: "DELETE",
                            headers: {
                                "Content-Type": "application/json",
                                "Client-ID": clientID,
                            },
                        },
                    );
                    if (response.ok || response.status === 404) success = true;
                }

                if (success) {
                    console.log(
                        `[Background-Ins] Sync successful: ${action.type} ${username}`,
                    );
                    this.state.followingCache[username] = {
                        timestamp: action.timestamp,
                        isFollowing: action.type === "FOLLOW",
                    };
                    delete pending[username];
                } else {
                    console.warn(
                        `[Background-Ins] Server error (${response.status}) for ${username}.`,
                    );
                }
            }
        } finally {
            this.state.isSyncing = false;
            await this.saveState(clientID);
            await broadcastFn();
        }
    },

    /**
     * Load state from chrome storage.
     */
    async loadState(clientID) {
        if (!clientID) {
            console.warn(
                "[Background-Ins] The loadState function requires a clientID.",
            );
            this.state.followingCache = {};
            this.state.pendingChanges = {};
            return;
        }
        const cacheKey = `ins_followingCache_${clientID}`;
        const pendingKey = `ins_pendingChanges_${clientID}`;
        const data = await chrome.storage.local.get([cacheKey, pendingKey]);

        this.state.followingCache = data[cacheKey] || {};
        this.state.pendingChanges = data[pendingKey] || {};
        console.log(`[Background-Ins] State loaded for client: ${clientID}`);
    },

    /**
     * Persist current state to chrome storage.
     */
    async saveState(clientID) {
        if (!clientID) {
            console.warn(
                "[Background-Ins] The saveState function requires a clientID.",
            );
        }
        const cacheKey = `ins_followingCache_${clientID}`;
        const pendingKey = `ins_pendingChanges_${clientID}`;
        await chrome.storage.local.set({
            [cacheKey]: this.state.followingCache,
            [pendingKey]: this.state.pendingChanges,
        });
    },

    /**
     * Reconcile cache and pending changes.
     */
    getEffectiveFollowList() {
        const { followingCache, pendingChanges } = this.state;
        const effectiveSet = new Set();

        // Start with server-confirmed follows
        Object.entries(followingCache).forEach(([username, data]) => {
            if (data.isFollowing) {
                effectiveSet.add(username);
            }
        });

        // Apply local overrides with conflict resolution
        Object.entries(pendingChanges).forEach(([username, action]) => {
            // If Server data is newer, ignore local action
            const serverTimestamp = followingCache[username]?.timestamp || 0;
            if (serverTimestamp > action.timestamp) {
                return;
            }

            // Apply the local intent
            if (action.type === "FOLLOW") {
                effectiveSet.add(username);
            } else if (action.type === "UNFOLLOW") {
                effectiveSet.delete(username);
            }
        });
        return Array.from(effectiveSet);
    },

    /**
     * Record a new user action and trigger sync.
     */
    async recordAction(username, type, clientID, broadcastFn, apiBase) {
        this.state.pendingChanges[username] = { type, timestamp: Date.now() };
        await this.saveState(clientID);
        await broadcastFn();
        this.syncFollowings(clientID, apiBase, broadcastFn);
    },

    /**
     * Fetch followings from the server.
     */
    async fetchFollowings(clientID, apiBase, broadcastFn) {
        if (!clientID) {
            console.warn(
                "[Background-Ins] The fetchFollowings function requires a clientID.",
            );
            return;
        }
        // console.log("[Background-Ins] Fetching followings from server...");
        try {
            const response = await fetch(`${apiBase}/instagram/followings`, {
                headers: { "Client-ID": clientID },
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

            // Drop local changes if server data is newer
            Object.keys(this.state.pendingChanges).forEach((username) => {
                const localAction = this.state.pendingChanges[username];
                const serverTime = newServerCache[username]?.timestamp || 0;
                if (serverTime > localAction.timestamp) {
                    delete this.state.pendingChanges[username];
                }
            });

            this.state.followingCache = newServerCache;
            await this.saveState(clientID);
            await broadcastFn();
            this.syncFollowings(clientID, apiBase, broadcastFn);
        } catch (error) {
            console.error(
                "[Background-Ins] Failed to fetch server list:",
                error,
            );
        }
    },

    /**
     * Fetches linked Instagram identities from the server.
     */
    async fetchCredentials(clientID, apiBase, broadcastFn) {
        if (!clientID) {
            console.warn(
                "[Background-Ins] The fetchFollowings function requires a clientID.",
            );
        }
        try {
            const res = await fetch(`${apiBase}/instagram/credentials`, {
                headers: { "Client-ID": clientID },
            });
            if (res.ok) {
                this.state.credentialsCache = await res.json();
                broadcastFn();
            }
        } catch (err) {
            console.error("[Background] Failed to fetch credentials:", err);
        }
    },

    /**
     * Saves a new identity (username/password) to the server.
     */
    async addCredential(payload, clientID, apiBase, broadcastFn) {
        try {
            const res = await fetch(`${apiBase}/instagram/credentials`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Client-ID": clientID,
                },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                await this.fetchCredentials(clientID, apiBase, broadcastFn);
                return { status: "success" };
            } else {
                const err = await res.json();
                return {
                    status: "error",
                    message: err.detail || "Failed to add identity",
                };
            }
        } catch (err) {
            return { status: "error", message: err.message };
        }
    },

    /**
     * Updates settings (like fetch_feed) for a specific identity.
     */
    async updateCredentialSettings(
        username,
        payload,
        clientID,
        apiBase,
        broadcastFn,
    ) {
        try {
            const res = await fetch(
                `${apiBase}/instagram/credentials/${username}/settings`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "Client-ID": clientID,
                    },
                    body: JSON.stringify({ fetch_feed: payload.fetch_feed }),
                },
            );

            if (res.ok) {
                await this.fetchCredentials(clientID, apiBase, broadcastFn);
                return { status: "success" };
            } else {
                const err = await res.json();
                return {
                    status: "error",
                    message: err.detail || "Update failed",
                };
            }
        } catch (err) {
            return { status: "error", message: err.message };
        }
    },

    /**
     * Unlinks/Deletes an identity from the server.
     */
    async deleteCredential(username, clientID, apiBase, broadcastFn) {
        try {
            const res = await fetch(
                `${apiBase}/instagram/credentials/${username}`,
                {
                    method: "DELETE",
                    headers: { "Client-ID": clientID },
                },
            );

            if (res.ok) {
                await this.fetchCredentials(clientID, apiBase, broadcastFn);
                return { status: "success" };
            } else {
                return {
                    status: "error",
                    message: "Failed to delete on server",
                };
            }
        } catch (err) {
            return { status: "error", message: err.message };
        }
    },

    /**
     * Update the Packet headers via DeclarativeNetRequest.
     */
    async updateNetworkRules(userAgent) {
        const { ruleId, filter } = this.state.config;
        if (!userAgent) return;

        const requestHeaders = [
            {
                header: "user-agent",
                operation: "set",
                value: userAgent,
            },
        ];

        const hintsToRemove = [
            "sec-ch-ua",
            "sec-ch-ua-arch",
            "sec-ch-ua-bitness",
            "sec-ch-ua-form-factors",
            "sec-ch-ua-full-version",
            "sec-ch-ua-full-version-list",
            "sec-ch-ua-mobile",
            "sec-ch-ua-model",
            "sec-ch-ua-platform",
            "sec-ch-ua-platform-version",
            "sec-ch-ua-wow64",
            "sec-ch-viewport-height",
            "sec-ch-viewport-width",
            "sec-ch-width",
        ];

        hintsToRemove.forEach((headerName) => {
            requestHeaders.push({
                header: headerName,
                operation: "remove",
            });
        });

        // const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
        // const oldRuleIds = oldRules.map(r => r.id);
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [ruleId],
            addRules: [
                {
                    id: ruleId,
                    priority: 1,
                    action: {
                        type: "modifyHeaders",
                        requestHeaders: requestHeaders,
                    },
                    condition: {
                        urlFilter: filter,
                        resourceTypes: [
                            "main_frame",
                            "sub_frame",
                            "stylesheet",
                            "script",
                            "image",
                            "font",
                            "object",
                            "xmlhttprequest",
                            "ping",
                            "csp_report",
                            "media",
                            "websocket",
                            "other",
                        ],
                    },
                },
            ],
        });
        console.log("[Background-Ins] DNR Rules updated successfully.");
    },

    /**
     * Captures and stores the current original browser login state.
     */
    async saveOriginalIdentity(currentCookies = null) {
        // Check if a snapshot already exists to avoid overwriting the true "original" identity.
        const storage = await chrome.storage.local.get([
            "ins_original_identity",
        ]);
        if (storage.ins_original_identity) {
            console.log(
                "[Background-Ins] Original identity already exists. Skipping save.",
            );
            return;
        }

        let cookies = currentCookies;
        if (!cookies) {
            cookies = await chrome.cookies.getAll({
                domain: ".instagram.com",
            });
        }

        // console.log("saveOriginalIdentity - cookies: ", cookies);
        if (cookies.length === 0) {
            console.log(
                "[Background-Ins] No active session found to save as original.",
            );
            return;
        }

        let originalUsername = "Original Identity";
        try {
            const domResponse = await this.forwardToContentScript(
                "getInstagramUsername",
            );
            if (
                domResponse &&
                domResponse.status === "success" &&
                domResponse.username
            ) {
                originalUsername = domResponse.username;
            }
        } catch (err) {
            console.error(
                "[Background-Ins] Failed to extract username from DOM elements:",
                err,
            );
        }

        const originalData = {
            cookies: cookies,
            username: originalUsername,
        };

        // Persist the original identity snapshot to local storage.
        await chrome.storage.local.set({ ins_original_identity: originalData });
        console.log("[Background-Ins] Original identity snapshot saved.");
    },

    async syncCookiesToBackend(clientID, apiBase, username, cookies) {
        try {
            console.log(
                `[Background-Ins] Syncing fresh cookies for @${username} to backend...`,
            );
            const seleniumCookies = this.toSeleniumCookies(cookies);

            await fetch(
                `${apiBase}/instagram/credentials/${username}/sync-session`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Client-ID": clientID,
                    },
                    body: JSON.stringify({
                        status: "success",
                        cookies: seleniumCookies,
                    }),
                },
            );
            console.log(
                `[Background-Ins] Cookies for @${username} successfully synced to database.`,
            );
        } catch (syncErr) {
            console.error(
                `[Background-Ins] Failed to sync session for @${username}:`,
                syncErr,
            );
        }
    },

    /**
     * Reverts to the original identity and revokes all system settings (DNR rules and cookies).
     */
    async revertToOriginal(
        clientID,
        apiBase,
        broadcastFn,
        redirectUrl = "https://www.instagram.com/",
        syncActiveCookies = true,
    ) {
        const storage = await chrome.storage.local.get([
            "ins_original_identity",
            "ins_active_user",
        ]);
        const originalData = storage.ins_original_identity;
        const activeUser = storage.ins_active_user;

        if (!originalData) {
            throw new Error("No original identity found to revert to.");
        }

        // Sync current active user's cookies
        const currentCookies = await chrome.cookies.getAll({
            domain: ".instagram.com",
        });
        if (activeUser && currentCookies.length > 0) {
            await this.syncCookiesToBackend(
                clientID,
                apiBase,
                activeUser,
                currentCookies,
            );
        }

        console.log(
            "[Background-Ins] Reverting to original identity and clearing rules...",
        );

        // Destroy the proxy tunnel to revert traffic back to local ISP
        await new Promise((resolve) => {
            chrome.proxy.settings.clear({ scope: "regular" }, () => {
                console.log(
                    "[Background-Ins] Proxy tunnel destroyed. Routing directly via local ISP.",
                );
                resolve();
            });
        });

        // Remove declarativeNetRequest rules (e.g., User-Agent spoofing and header removal).
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [this.state.config.ruleId],
        });

        // Remove all current Instagram cookies.
        console.log("revertToOriginal - currentCookies: ", currentCookies);
        for (let cookie of currentCookies) {
            await chrome.cookies.remove({
                url: `https://www.instagram.com${cookie.path}`,
                name: cookie.name,
            });
        }

        // Restore cookies from the saved original snapshot.
        for (let c of originalData.cookies) {
            await chrome.cookies.set({
                url: "https://www.instagram.com",
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                secure: c.secure,
                httpOnly: c.httpOnly,
                expirationDate: c.expirationDate,
            });
        }

        chrome.tabs.query({ url: "*://*.instagram.com/*" }, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.active && redirectUrl) {
                    chrome.tabs.update(tab.id, { url: redirectUrl });
                } else {
                    chrome.tabs.reload(tab.id);
                }
            });
        });

        await chrome.storage.local.remove("ins_active_user");
        await chrome.storage.local.remove("ins_original_identity");

        console.log(
            "[Background-Ins] System fully reverted to original state.",
        );
        // await broadcastFn();
    },

    /**
     * Execute identity switch by replacing cookies and UA.
     */
    async switchIdentity(
        username,
        clientID,
        apiBase,
        broadcastFn,
        redirectUrl = null,
    ) {
        // Save the currently active identity
        const storage = await chrome.storage.local.get(["ins_active_user"]);
        const activeUser = storage.ins_active_user;
        const currentCookies = await chrome.cookies.getAll({
            domain: ".instagram.com",
        });

        if (!activeUser) {
            // Current user is 'Original Identity'
            await this.saveOriginalIdentity(currentCookies);
        } else {
            await this.syncCookiesToBackend(
                clientID,
                apiBase,
                activeUser,
                currentCookies,
            );
        }

        // Pull & Inject target identity
        const response = await fetch(
            `${apiBase}/instagram/credentials/${username}`,
            {
                headers: { "Client-ID": clientID },
            },
        );
        if (!response.ok)
            throw new Error("Failed to fetch cookies from server");

        const data = await response.json();
        if (!data.cookies || data.cookies.length === 0)
            throw new Error("No valid cookies found");

        console.log(`[Background-Ins] Switching to identity: ${username}`);

        // Update Net rules (User-Agent or some headers)
        if (data.user_agent) await this.updateNetworkRules(data.user_agent);

        // Clear existing Instagram cookies to avoid session conflicts
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
                domain: c.domain,
                path: c.path,
                secure: c.secure,
                httpOnly: c.httpOnly,
                expirationDate: c.expiry,
            });
        }
        // Turn on Backend Proxy Channel for Virtual Identity
        const urlObj = new URL(apiBase);
        const backendHost = urlObj.hostname;

        // Construct a dynamic PAC script that filters traffic at the browser kernel level
        const pacScriptData = `
            function FindProxyForURL(url, host) {
                // Intercept and route all Instagram domains/subdomains to backend proxy
                if (
                    shExpMatch(host, "instagram.com") || 
                    shExpMatch(host, "*.instagram.com") ||
                    shExpMatch(host, "cdninstagram.com") || 
                    shExpMatch(host, "*.cdninstagram.com") ||
                    shExpMatch(host, "facebook.com") ||
                    shExpMatch(host, "*.facebook.com") ||
                    shExpMatch(host, "*.fbcdn.net")
                ) {
                    return "PROXY ${backendHost}:8888";
                }
                
                // Everything else goes directly via local ISP
                return "DIRECT";
            }
        `;

        const proxyConfig = {
            mode: "pac_script",
            pacScript: {
                data: pacScriptData,
            },
        };

        await new Promise((resolve) => {
            chrome.proxy.settings.set(
                { value: proxyConfig, scope: "regular" },
                () => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            "[Proxy-PAC-Error] Edge rejected PAC configuration:",
                            chrome.runtime.lastError.message,
                        );
                    } else {
                        console.log(
                            `[Proxy-PAC-Success] PAC isolation rules successfully injected for ${backendHost}:8888`,
                        );
                    }
                    resolve();
                },
            );
        });

        await chrome.storage.local.set({ ins_active_user: username });
        console.log(
            `[Background-Ins] Active user updated in storage: ${username}`,
        );

        chrome.tabs.query({ url: "*://*.instagram.com/*" }, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.active && redirectUrl) {
                    chrome.tabs.update(tab.id, { url: redirectUrl });
                } else {
                    chrome.tabs.reload(tab.id);
                }
            });
        });

        // await broadcastFn();
    },

    /**
     * Finds an active Instagram tab and sends a message to its content script.
     */
    async forwardToContentScript(contentAction) {
        return new Promise((resolve) => {
            chrome.tabs.query(
                {
                    active: true,
                    currentWindow: true,
                    url: this.state.config.filter,
                },
                (tabs) => {
                    if (tabs.length === 0) {
                        return resolve({
                            status: "error",
                            message: "No active Instagram tab found.",
                        });
                    }

                    chrome.tabs.sendMessage(
                        tabs[0].id,
                        { action: contentAction },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                resolve({
                                    status: "error",
                                    message: chrome.runtime.lastError.message,
                                });
                            } else {
                                resolve(response);
                            }
                        },
                    );
                },
            );
        });
    },
};
