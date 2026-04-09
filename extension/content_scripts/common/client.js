async function getClientId() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: "instagram:getClientID",
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
