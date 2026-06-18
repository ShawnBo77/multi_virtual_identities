(function () {
    "use strict";

    console.log("[Anti-Fingerprint] anti_fingerprint.js successfully loaded.");

    // =========================================================================
    // UserAgentData
    // =========================================================================
    if (navigator.userAgentData) {
        Object.defineProperty(navigator, "userAgentData", {
            get: () => undefined,
            configurable: true,
        });
    }

    // =========================================================================
    // Static Hardware Feature Spoofing (hardwareConcurrency, deviceMemory)
    // =========================================================================
    // Randomly assign common hardware specs(e.g., 16 cores, 32GB RAM)
    const hardwarePresets = [
        { core: 8, memory: 16 },
        { core: 12, memory: 32 },
        { core: 16, memory: 32 },
        { core: 16, memory: 64 },
    ];
    const selectedPreset =
        hardwarePresets[Math.floor(Math.random() * hardwarePresets.length)];

    Object.defineProperty(navigator, "hardwareConcurrency", {
        get: () => selectedPreset.core,
        configurable: true,
    });
    Object.defineProperty(navigator, "deviceMemory", {
        get: () => selectedPreset.memory,
        configurable: true,
    });

    // =========================================================================
    // Dynamic Canvas Rendering Fingerprint Noise Injection (canvas)
    // =========================================================================
    const orgToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const orgGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const ctx = this.getContext("2d");
        if (ctx) {
            // Inject a randomized noise pixel at (0,0) to spoof the canvas fingerprint
            ctx.fillStyle = `rgba(${Math.floor(Math.random() * 255)}, 0, 0, 0.001)`;
            ctx.fillRect(0, 0, 1, 1);
        }
        return orgToDataURL.apply(this, args);
    };

    CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h) {
        const imageData = orgGetImageData.apply(this, arguments);
        // Slightly modify the blue channel value of the first pixel
        // data[0] = R,  data[1] = G, data[2] = B, data[3] = A
        if (imageData.data.length > 2) {
            imageData.data[2] = (imageData.data[2] + 1) % 256;
        }
        return imageData;
    };

    // =========================================================================
    // Audio
    // =========================================================================
    const orgGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function (channel) {
        const f32Array = orgGetChannelData.apply(this, arguments);
        // Generate a microscopic noise offset.
        const noise = (Math.random() - 0.5) * 1e-7;
        for (let i = 0; i < f32Array.length; i += 100) {
            // Sample-based interference
            f32Array[i] += noise;
        }
        return f32Array;
    };

    console.log(
        `[Anti-Fingerprint] Hardware spoofed to: ${selectedPreset.core} cores / ${selectedPreset.memory}GB RAM. Canvas/Audio dynamic noise hooks deployed successfully.`,
    );
})();
