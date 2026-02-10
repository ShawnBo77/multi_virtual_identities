async function registerClient() {
    try {
        const response = await fetch(`${API_BASE_URL}/clients`, { method: 'POST' });
        if (response.ok) {
            const newClient = await response.json();
            return newClient.id;
        }
        return null;
    } catch (error) {
        console.error('[IG Injector] Failed to register client:', error);
        return null;
    }
}

async function getClientId() {
    const key = 'clientID';
    let data = await chrome.storage.local.get(key);
    if (data[key]) {
        return data[key];
    } else {
        const newId = await registerClient();
        if (newId) {
            await chrome.storage.local.set({ [key]: newId });
            return newId;
        }
        return null;
    }
}