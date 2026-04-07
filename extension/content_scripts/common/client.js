async function getClientId() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: "getClientID",
        });
        if (response) {
            return response.clientID;
        }
        return null;
    } catch (error) {
        console.error("Failed to register client:", error);
        return [];
    }
}
