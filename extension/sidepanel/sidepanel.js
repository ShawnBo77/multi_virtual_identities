import {
    renderInsFollowList,
    renderInsCredList,
    isInstagramTabActive,
} from "./instagram/instagram_ui.js";

let currentState = {
    effectiveFollowList: [],
    clientID: null,
};

const authSection = document.getElementById("auth-section");
const mainContent = document.getElementById("main-content");
const usernameInput = document.getElementById("username-input");
const addFollowForm = document.getElementById("add-follow-form");
const followListContainer = document.getElementById("follow-list");
const addCredForm = document.getElementById("add-cred-form");
const credListContainer = document.getElementById("cred-list");
const viewSavedBtn = document.getElementById("view-saved-btn");

// ==========================================
// Toggle between Auth view and Main content based on login status
// ==========================================
async function checkAuthStatus() {
    const data = await chrome.storage.local.get(["clientID", "username"]);

    if (data.clientID) {
        authSection.style.display = "none";
        mainContent.style.display = "block";
        document.getElementById("display-username").textContent =
            `User: ${data.username}`;
        refreshStateAndRender(); // Fetch follows and render
    } else {
        authSection.style.display = "block";
        mainContent.style.display = "none";
    }
}

function clearAuthError() {
    const errorEl = document.getElementById("auth-error");
    if (errorEl) {
        errorEl.textContent = "";
        errorEl.style.display = "none";
    }
}

document.querySelectorAll("#auth-section input").forEach((input) => {
    input.addEventListener("input", clearAuthError);
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

// Switch between Login and Register tabs
document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document
            .querySelectorAll(".auth-tab-btn")
            .forEach((b) => b.classList.remove("active"));
        document
            .querySelectorAll(".auth-view")
            .forEach((v) => v.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(btn.dataset.target).classList.add("active");
        clearAuthError();
    });
});

// Login submission
document
    .getElementById("login-submit-btn")
    .addEventListener("click", async () => {
        const username = document.getElementById("login-username").value;
        const password = document.getElementById("login-password").value;
        const errorEl = document.getElementById("auth-error");

        const response = await chrome.runtime.sendMessage({
            action: "login",
            payload: { username, password },
        });

        if (response.status === "success") {
            checkAuthStatus();
        } else {
            errorEl.textContent = response.message;
            errorEl.style.display = "block";
        }
    });

// Register submission
document
    .getElementById("reg-submit-btn")
    .addEventListener("click", async () => {
        const username = document.getElementById("reg-username").value;
        const password = document.getElementById("reg-password").value;
        const confirmPassword = document.getElementById(
            "reg-confirm-password",
        ).value;
        const errorEl = document.getElementById("auth-error");

        // Client-side validation: Check if passwords match
        if (password !== confirmPassword) {
            errorEl.textContent = "Passwords do not match!";
            errorEl.style.display = "block";
            return;
        }

        if (password.length < 6) {
            errorEl.textContent = "Password must be at least 6 characters.";
            errorEl.style.display = "block";
            return;
        }

        const response = await chrome.runtime.sendMessage({
            action: "register",
            payload: { username, password },
        });

        if (response.status === "success") {
            alert("Account created! Please login.");
            // Clear registration fields
            document.getElementById("reg-username").value = "";
            document.getElementById("reg-password").value = "";
            document.getElementById("reg-confirm-password").value = "";
            // Switch to login tab
            document.querySelector('[data-target="login-form"]').click();
        } else {
            errorEl.textContent = response.message;
            errorEl.style.display = "block";
        }
    });

// Logout handler
document.getElementById("logout-btn").addEventListener("click", async () => {
    if (confirm("Are you sure you want to logout?")) {
        await chrome.runtime.sendMessage({ action: "logout" });
        checkAuthStatus();
    }
});

// Update DOMContentLoaded to check auth
document.addEventListener("DOMContentLoaded", checkAuthStatus);

// ==========================================
// UI rendering
// ==========================================
async function refreshStateAndRender() {
    console.log("[Sidepanel] Requesting state from background...");

    const isFollowView = document
        .getElementById("view-follow")
        .classList.contains("active");
    const isSettingsView = document
        .getElementById("view-settings")
        .classList.contains("active");

    try {
        const response = await chrome.runtime.sendMessage({
            action: "getState",
        });
        if (response?.status === "success") {
            // Update the global state object
            currentState = response.data;
            // Render Platform UI
            if (isFollowView) {
                renderInsFollowList(
                    followListContainer,
                    currentState.effectiveFollowList,
                );
            } else if (isSettingsView) {
                renderInsCredList(credListContainer, currentState.credentials);
            }
        }
    } catch (error) {
        console.error("[Sidepanel] Error requesting state:", error);
        followListContainer.innerHTML =
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

followListContainer.addEventListener("click", async (e) => {
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
    const isShared = document.getElementById("cred-is-shared").checked;
    const fetchFeed = document.getElementById("cred-fetch-feed").checked;
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
        document.getElementById("cred-username").value = "";
        document.getElementById("cred-password").value = "";
        document.getElementById("cred-is-shared").checked = false;
        document.getElementById("cred-fetch-feed").checked = false;
        refreshStateAndRender(); // Re-render this section
    } else {
        alert(`Failed: ${response.message || "Unknown error"}`);
    }

    btn.disabled = false;
    btn.textContent = "Save Identity";
});

credListContainer.addEventListener("change", async (e) => {
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

credListContainer.addEventListener("click", async (e) => {
    const username = e.target.dataset.username;
    if (!username) return;

    if (e.target.classList.contains("delete-cred-btn")) {
        const username = e.target.dataset.username;
        if (!username) return;
        if (!confirm(`Are you sure you want to unlink "${username}"?`)) return;

        e.target.disabled = true;
        e.target.textContent = "...";

        const response = await chrome.runtime.sendMessage({
            action: "deleteCredential",
            username: username,
        });
        if (response.status === "success") {
            console.log(`Identity ${username} unlinked.`);
            refreshStateAndRender(); // Refresh the list
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
            alert("⚠️ Please open an Instagram tab to switch this identity.");
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
            refreshStateAndRender();
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
        const targetId = btn.dataset.target;

        // UI Switch: Update active states for tabs and sections
        document
            .querySelectorAll(".tab-btn")
            .forEach((b) => b.classList.remove("active"));
        document
            .querySelectorAll(".view-section")
            .forEach((v) => v.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(btn.dataset.target).classList.add("active");
        if (targetId === "view-follow") {
            chrome.runtime.sendMessage({ action: "triggerFollowListSync" });
        } else if (targetId === "view-settings") {
            chrome.runtime.sendMessage({ action: "getCredentials" });
        }
        refreshStateAndRender();
    });
});

document.addEventListener("DOMContentLoaded", refreshStateAndRender);
