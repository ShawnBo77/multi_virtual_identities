if (navigator.userAgentData) {
    Object.defineProperty(navigator, 'userAgentData', {
        get: () => undefined,
        configurable: false
    });
}