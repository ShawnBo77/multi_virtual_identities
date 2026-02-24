const API_BASE_URL = "http://127.0.0.1:8000";

let currentState = {
    effectiveFollowList: [],
    clientID: null,
};

const usernameInput = document.getElementById("username-input");
const addFollowForm = document.getElementById("add-follow-form");
const followList = document.getElementById("follow-list");
const addCredForm = document.getElementById("add-cred-form");
const credList = document.getElementById("cred-list");
const viewSavedBtn = document.getElementById("view-saved-btn");

// ==========================================
// UI rendering
// ==========================================

function renderAll() {
    renderFollowList();
    if (document.getElementById("view-settings").classList.contains("active")) {
        renderCredsView();
    }
}

async function renderFollowList() {
    followList.innerHTML = "";
    const { effectiveFollowList } = currentState;
    if (effectiveFollowList.length === 0) {
        followList.innerHTML =
            '<li style="color:#888; text-align:center;">No users followed yet</li>';
        return;
    }

    effectiveFollowList.forEach((username) => {
        const li = document.createElement("li");
        li.dataset.username = username;
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        li.style.padding = "8px 0";
        li.style.borderBottom = "1px solid #eee";

        const userSpan = document.createElement("span");
        userSpan.textContent = username;
        userSpan.style.fontWeight = "500";

        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-btn";
        removeBtn.textContent = "Unfollow";
        removeBtn.style.backgroundColor = "#ff4d4d";
        removeBtn.style.color = "white";
        removeBtn.style.border = "none";
        removeBtn.style.padding = "4px 8px";
        removeBtn.style.borderRadius = "4px";
        removeBtn.style.cursor = "pointer";

        li.appendChild(userSpan);
        li.appendChild(removeBtn);
        followList.appendChild(li);
    });
}

async function renderCredsView() {
    if (!currentState.clientID) {
        credList.innerHTML =
            '<div style="text-align:center; color:#888;">Client ID not available.</div>';
        return;
    }

    credList.innerHTML = "<li>Loading...</li>";
    try {
        const response = await chrome.runtime.sendMessage({
            action: "getCredentials",
        });
        if (response && response.status === "success") {
            const creds = response.data;
            credList.innerHTML = "";

            if (creds.length === 0) {
                credList.innerHTML =
                    '<div style="text-align:center; color:#888;">No accounts linked.</div>';
                return;
            }
            const globalCreds = creds.filter((c) => c.is_global);
            const localCreds = creds.filter((c) => !c.is_global);

            const renderList = (accounts, title) => {
                if (accounts.length > 0) {
                    credList.innerHTML += `<div class="cred-section-header">${title}</div>`;
                    accounts.forEach((cred) => {
                        const div = document.createElement("div");
                        div.className = "cred-item";
                        div.innerHTML = `
                            <span class="cred-username">${cred.username}</span>
                            <span class="status status-${cred.status.toLowerCase()}">${cred.status.toUpperCase()}</span>
                            <button class="delete-cred-btn" data-username="${cred.username}" title="Unlink this account">✖</button>
                        `;
                        credList.appendChild(div);
                    });
                }
            };

            renderList(globalCreds, "Global Accounts 🌐");
            renderList(localCreds, "Local Accounts");
        } else {
            credList.innerHTML = `<li>Error: ${response.message || "Could not load accounts."}</li>`;
        }
    } catch (e) {
        credList.innerHTML = `<li>Error: Failed to communicate with the extension.</li>`;
    }
}

async function refreshStateAndRender() {
    console.log("[Sidepanel] Requesting state from background...");
    try {
        const response = await chrome.runtime.sendMessage({
            action: "getState",
        });
        if (response && response.status === "success") {
            // Update the global state object
            currentState = response.data;
            renderAll();
        } else {
            console.error(
                "[Sidepanel] Failed to get state:",
                response?.message,
            );
            followList.innerHTML =
                '<li style="color:red;">Error loading data. Try reloading the extension.</li>';
        }
    } catch (error) {
        console.error("[Sidepanel] Error requesting state:", error);
        followList.innerHTML =
            '<li style="color:red;">The extension background service may have been disconnected.</li>';
    }
}

// ==========================================
// Event Listeners
// ==========================================

addFollowForm.addEventListener("submit", async (e) => {
    e.preventDefault();
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

followList.addEventListener("click", async (e) => {
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

addCredForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("cred-username").value.trim();
    const password = document.getElementById("cred-password").value.trim();
    const isGlobal = document.getElementById("cred-is-global").checked;
    const btn = addCredForm.querySelector("button");

    if (!username || !password) return;

    btn.disabled = true;
    btn.textContent = "Processing...";

    const response = await chrome.runtime.sendMessage({
        action: "addCredential",
        payload: { username, password, is_global: isGlobal },
    });

    if (response.status === "success") {
        alert("Account saved!");
        document.getElementById("cred-username").value = "";
        document.getElementById("cred-password").value = "";
        document.getElementById("cred-is-global").checked = false;
        renderCredsView(); // Re-render this section
    } else {
        alert(`Failed: ${response.message || "Unknown error"}`);
    }

    btn.disabled = false;
    btn.textContent = "Save Account";
});

credList.addEventListener("click", async (e) => {
    if (e.target.classList.contains("delete-cred-btn")) {
        const username = e.target.dataset.username;
        if (!username) return;
        if (!confirm(`Are you sure you want to unlink "${username}"?`)) return;

        e.target.disabled = true;
        e.target.textContent = "...";

        const response = await chrome.runtime.sendMessage({
            action: "deleteCredential",
            username,
        });
        if (response.status === "success") {
            console.log(`Account ${username} unlinked.`);
            renderCredsView(); // Refresh the list
        } else {
            alert(`Failed to unlink: ${response.message}`);
            e.target.disabled = false;
            e.target.textContent = "✖";
        }
    }
});

viewSavedBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "showSavedPosts" }, (response) => {
        if (!response || response.status === "error") {
            alert(
                response.message ||
                    "Could not show saved posts. Is an Instagram tab open?",
            );
        }
    });
});

// Listen for updates from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "stateUpdated") {
        console.log(
            "[Sidepanel] Received state update from background. Re-rendering list.",
        );
        refreshStateAndRender();
    }
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document
            .querySelectorAll(".tab-btn")
            .forEach((b) => b.classList.remove("active"));
        document
            .querySelectorAll(".view-section")
            .forEach((v) => v.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(btn.dataset.target).classList.add("active");
        if (btn.dataset.target === "view-settings") {
            renderCredsView();
        }
    });
});

document.addEventListener("DOMContentLoaded", refreshStateAndRender);
