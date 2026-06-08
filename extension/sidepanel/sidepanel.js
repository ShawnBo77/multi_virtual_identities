import { InstagramUI } from "./instagram/instagram_ui.js";

// Define the supported platform
const PLATFORM_UIS = {
    "instagram.com": {
        ui: InstagramUI,
        key: "instagram",
    },
};

let currentPlatformUI = null;
let currentPlatformKey = null;

const authSection = document.getElementById("auth-section");
const mainContent = document.getElementById("main-content");

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
        // Initialize the platform-specific UI
        await mountPlatformUI();
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
async function mountPlatformUI() {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });
    const mountPoint = document.getElementById("platform-mount");

    // Find the matching platform driver based on the current URL
    const domain = Object.keys(PLATFORM_UIS).find((d) => tab?.url?.includes(d));

    if (domain) {
        const { ui, key } = PLATFORM_UIS[domain];
        currentPlatformUI = ui;
        currentPlatformKey = key;
        try {
            const response = await chrome.runtime.sendMessage({
                action: `${currentPlatformKey}:getState`,
            });
            if (response && response.status === "success") {
                // Initialize the UI with retrieved data
                await currentPlatformUI.init(mountPoint, response.data);
            } else {
                mountPoint.innerHTML = `<p class="error">${response?.message || `Failed to load state for ${currentPlatformKey}.`}</p>`;
            }
        } catch (error) {
            console.error("[Sidepanel] Error fetching state:", error);
        }
    } else {
        currentPlatformUI = null;
        currentPlatformKey = null;
        mountPoint.innerHTML = `<p style="text-align:center; padding:20px; color:#666;">
            Please open a supported platform (e.g. Instagram).
        </p>`;
    }
}

// ==========================================
// Event Listeners
// ==========================================

// Listen for updates from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (
        request.action === "stateUpdated" &&
        currentPlatformUI &&
        currentPlatformKey
    ) {
        (async () => {
            try {
                const response = await chrome.runtime.sendMessage({
                    action: `${currentPlatformKey}:getState`,
                });
                if (response && response.data) {
                    await currentPlatformUI.render(response.data);
                }
            } catch (error) {
                console.error(
                    "[Sidepanel] Error handling state update:",
                    error,
                );
            }
        })();
    }
});

// Reload Sidepanel content when the user switches browser tabs or the URL changes
chrome.tabs.onActivated.addListener(mountPlatformUI);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") mountPlatformUI();
});

document.addEventListener("DOMContentLoaded", checkAuthStatus);
