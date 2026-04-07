export const InstagramUI = {
    getTemplate() {
        return `
            <div class="tabs">
                <button class="tab-btn active" data-target="view-follow">Follows</button>
                <button class="tab-btn" data-target="view-settings">Identities</button>
            </div>
            <div id="view-follow" class="view-section active">
                <form id="add-follow-form">
                    <input type="text" id="username-input" placeholder="Username to follow..." required>
                    <button type="submit">Follow</button>
                </form>
                <button id="view-saved-btn" class="secondary-btn">View Saved Posts</button>
                <ul id="follow-list"></ul>
            </div>
            <div id="view-settings" class="view-section">
                <h3>Instagram Identities</h3>
                <form id="add-cred-form">
                    <div class="input-wrapper">
                        <input type="text" id="cred-username" placeholder="Username" required>
                    </div>
                    <div class="password-wrapper">
                        <input type="password" id="cred-password" placeholder="Password" required>
                        <span class="toggle-password" data-target="cred-password">👁️</span>
                    </div>
                    <div class="checkbox-container">
                        <input type="checkbox" id="cred-is-shared">
                        <label for="cred-is-shared">Make this a shared identity</label>
                    </div>
                    <div class="checkbox-container" style="margin-top: 5px;">
                        <input type="checkbox" id="cred-fetch-feed">
                        <label for="cred-fetch-feed">Sync Home Feed for this identity</label>
                    </div>
                    <button type="submit" style="width: 100%; margin-top: 10px;">Save Identity</button>
                </form>
                <div id="cred-list"></div>
            </div>
        `;
    },

    async init(container, currentState) {
        container.innerHTML = this.getTemplate();
        this.bindEvents();
        await this.render(currentState);
    },

    async render(state) {
        const followListContainer = document.getElementById("follow-list");
        const credListContainer = document.getElementById("cred-list");

        if (followListContainer) {
            this.renderFollowList(
                followListContainer,
                state.effectiveFollowList,
            );
        }
        if (credListContainer && state.credentials) {
            await this.renderCredList(credListContainer, state.credentials);
        }
    },

    /**
     * Renders the list of followed Instagram users
     */
    renderFollowList(container, followList) {
        container.innerHTML = "";
        if (followList.length === 0) {
            container.innerHTML =
                '<li style="color:#888; text-align:center;">No users followed yet</li>';
            return;
        }

        followList.forEach((username) => {
            const li = document.createElement("li");
            li.dataset.username = username;
            li.className = "follow-item";
            li.innerHTML = `
                <span class="user-text">${username}</span>
                <button class="remove-btn" data-username="${username}">Unfollow</button>
            `;
            container.appendChild(li);
        });
    },

    /**
     * Renders the Instagram identity list (Shared and Private)
     */
    async renderCredList(container, creds) {
        const storage = await chrome.storage.local.get("active_user_instagram");
        const activeUsername = storage.active_user_instagram;

        container.innerHTML = "";
        if (creds.length === 0) {
            container.innerHTML =
                '<div style="text-align:center; color:#888;">No identities linked.</div>';
            return;
        }

        const SVG_ICONS = {
            shared: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
            private: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
        };

        const sharedCreds = creds.filter((c) => c.is_shared);
        const privateCreds = creds.filter((c) => !c.is_shared);

        const buildSection = (list, title, iconKey, iconClass) => {
            if (list.length === 0) return "";
            let html = `
                <div class="cred-section-header">
                    <span class="header-icon ${iconClass}">${SVG_ICONS[iconKey]}</span>
                    <span class="header-text">${title}</span>
                </div>`;

            list.forEach((cred) => {
                const isActive = cred.username === activeUsername;
                html += `
                    <div class="cred-item ${isActive ? "active" : ""}">
                        <button class="switch-identity-btn" data-username="${cred.username}" 
                            ${cred.status !== "success" ? "disabled" : ""} title="Switch Identity">
                            ${isActive ? "🟢" : "🔄"}
                        </button>
                        <span class="cred-username" title="${cred.username}">${cred.username}</span>
                        <span class="status-badge status-${cred.status.toLowerCase()}">${cred.status.toUpperCase()}</span>
                        <div class="cred-actions">
                            <div class="toggle-container">
                                <label class="toggle-switch">
                                    <input type="checkbox" class="fetch-feed-toggle" data-username="${cred.username}" ${cred.fetch_feed ? "checked" : ""}>
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <button class="delete-cred-btn" data-username="${cred.username}">✖</button>
                        </div>
                    </div>`;
            });
            return html;
        };

        container.innerHTML =
            buildSection(
                sharedCreds,
                "Shared Identities",
                "shared",
                "icon-shared",
            ) +
            buildSection(
                privateCreds,
                "Private Identities",
                "private",
                "icon-private",
            );
    },

    bindEvents() {
        //
        const mount = document.getElementById("platform-mount");
        mount.querySelectorAll(".tab-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const targetId = btn.dataset.target;

                // UI Switch: Update active states for tabs and sections
                document
                    .querySelectorAll(".tab-btn, .view-section")
                    .forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                document
                    .getElementById(btn.dataset.target)
                    .classList.add("active");
                if (targetId === "view-follow") {
                    chrome.runtime.sendMessage({
                        action: "triggerFollowListSync",
                    });
                } else if (targetId === "view-settings") {
                    chrome.runtime.sendMessage({ action: "getCredentials" });
                }
            });
        });

        // Add Follow Form
        const addFollowForm = document.getElementById("add-follow-form");
        addFollowForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById("username-input");
            const username = usernameInput.value.trim();
            if (!username) {
                alert("Please enter a username.");
                return;
            }

            // Disable input temporarily
            usernameInput.disabled = true;
            const btn = e.target.querySelector("button");
            btn.disabled = true;
            btn.textContent = "Adding...";

            // Send action to background script
            await chrome.runtime.sendMessage({
                action: "recordAction",
                type: "FOLLOW",
                username: username,
            });

            // Reset UI
            usernameInput.value = "";
            usernameInput.disabled = false;
            btn.disabled = false;
            btn.textContent = "Add Follow";
        });

        // Follow list
        const followListContainer = document.getElementById("follow-list");
        followListContainer?.addEventListener("click", async (e) => {
            // Unfollowing
            if (e.target.classList.contains("remove-btn")) {
                const li = e.target.closest("li");
                const username = li.dataset.username;

                if (username) {
                    console.log(`[Popup] Unfollowing: ${username}`);
                    e.target.disabled = true;
                    e.target.textContent = "...";

                    // Send action to background script
                    await chrome.runtime.sendMessage({
                        action: "recordAction",
                        type: "UNFOLLOW",
                        username: username,
                    });
                }
            }
        });

        // View Saved Posts Button
        const viewSavedBtn = document.getElementById("view-saved-btn");
        viewSavedBtn.addEventListener("click", () => {
            chrome.runtime.sendMessage(
                { action: "showSavedPosts" },
                (response) => {
                    if (!response || response.status === "error") {
                        alert(
                            response.message ||
                                "Could not show saved posts. Is an Instagram tab open?",
                        );
                    }
                },
            );
        });

        // Add Credential Form
        const addCredForm = document.getElementById("add-cred-form");
        addCredForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const username = document
                .getElementById("cred-username")
                .value.trim();
            const password = document
                .getElementById("cred-password")
                .value.trim();
            const isShared = document.getElementById("cred-is-shared").checked;
            const fetchFeed =
                document.getElementById("cred-fetch-feed").checked;
            const btn = addCredForm.querySelector("button");

            if (!username || !password) return;

            btn.disabled = true;
            btn.textContent = "Processing...";

            const response = await chrome.runtime.sendMessage({
                action: "addCredential",
                payload: {
                    username,
                    password,
                    is_shared: isShared,
                    fetch_feed: fetchFeed,
                },
            });

            if (response.status === "success") {
                alert("Identity saved!");
                e.target.reset();
            } else {
                alert(`Failed: ${response.message || "Unknown error"}`);
            }

            btn.disabled = false;
            btn.textContent = "Save Identity";
        });

        // Password Visibility Toggle Logic
        document.querySelectorAll(".toggle-password").forEach((btn) => {
            btn.addEventListener("click", function () {
                const targetId = this.getAttribute("data-target");
                const passwordInput = document.getElementById(targetId);

                if (passwordInput.type === "password") {
                    // Switch to text to show password
                    passwordInput.type = "text";
                    this.textContent = "🙈"; // Icon change
                } else {
                    // Switch back to password to hide it
                    passwordInput.type = "password";
                    this.textContent = "👁️";
                }
            });
        });

        // Credential List
        const credListContainer = document.getElementById("cred-list");
        credListContainer?.addEventListener("change", async (e) => {
            if (e.target.classList.contains("fetch-feed-toggle")) {
                const username = e.target.dataset.username;
                const isEnabled = e.target.checked;

                const response = await chrome.runtime.sendMessage({
                    action: "updateCredentialSettings",
                    username: username,
                    payload: { fetch_feed: isEnabled },
                });

                if (response.status !== "success") {
                    alert("Failed to update: " + response.message);
                    e.target.checked = !isEnabled;
                }
            }
        });

        credListContainer?.addEventListener("click", async (e) => {
            const username = e.target.dataset.username;
            if (!username) return;

            if (e.target.classList.contains("delete-cred-btn")) {
                const username = e.target.dataset.username;
                if (!username) return;
                if (!confirm(`Are you sure you want to unlink "${username}"?`))
                    return;

                e.target.disabled = true;
                e.target.textContent = "...";

                const response = await chrome.runtime.sendMessage({
                    action: "deleteCredential",
                    username: username,
                });
                if (response.status === "success") {
                    console.log(`Identity ${username} unlinked.`);
                } else {
                    alert(`Failed to unlink: ${response.message}`);
                    e.target.disabled = false;
                    e.target.textContent = "✖";
                }
            } else if (e.target.classList.contains("switch-identity-btn")) {
                const [tab] = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                });
                const isInstagramPage = tab.url.includes("instagram.com");
                if (!isInstagramPage) {
                    alert(
                        "⚠️ Please open an Instagram tab to switch this identity.",
                    );
                    return;
                }

                console.log(`[Sidepanel] Requesting switch to: ${username}`);
                const btn = e.target;
                btn.disabled = true;
                btn.textContent = "⏳";

                const response = await chrome.runtime.sendMessage({
                    action: "switchIdentity",
                    username: username,
                    platform: "instagram",
                });

                if (response.status === "success") {
                    alert(
                        `Successfully switched to @${username}. User-Agent & Cookies updated.`,
                    );
                } else {
                    alert(`Switch failed: ${response.message}`);
                }
                btn.disabled = false;
                btn.textContent = "🔄";
            }
        });
    },
};
