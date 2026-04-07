/**
 * Renders the list of followed Instagram users
 */
export function renderInsFollowList(container, followList) {
    container.innerHTML = "";
    if (followList.length === 0) {
        container.innerHTML =
            '<li style="color:#888; text-align:center;">No users followed yet</li>';
        return;
    }

    followList.forEach((username) => {
        const li = document.createElement("li");
        li.dataset.username = username;
        li.className = "follow-item"; // Use CSS class for styling
        li.innerHTML = `
            <span class="user-text">${username}</span>
            <button class="remove-btn" data-username="${username}">Unfollow</button>
        `;
        container.appendChild(li);
    });
}

/**
 * Renders the Instagram identity list (Shared and Private)
 */
export async function renderInsCredList(container, creds) {
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
}

/**
 * Utility: Check if the currently active tab is Instagram
 */
export async function isInstagramTabActive() {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });
    return tab?.url?.includes("instagram.com");
}
