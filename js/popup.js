
let hackTheAI = false;

// Modal handling
const modal = document.getElementById('apiKeyModal');
const settingsButton = document.getElementById('settingsButton');
const closeModal = document.getElementById('closeModal');
const saveApiKeyButton = document.getElementById('saveApiKeyButton');
const apiKeyInput = document.getElementById('apiKeyInput');
const passphraseInput = document.getElementById('passphraseInput');

settingsButton.addEventListener('click', () => {
    modal.style.display = 'block';
});

closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
    apiKeyInput.value = '';
    passphraseInput.value = '';
});

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
        apiKeyInput.value = '';
        passphraseInput.value = '';
    }
});


// Helper function to generate a random string for key seed
async function generateKeySeed() {
    const array = new Uint8Array(32); // 256 bits
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Key derivation with PBKDF2 for API key
async function deriveKey(passphrase, salt, keySeed) {
    const encoder = new TextEncoder();
    const baseKey = passphrase ? `${passphrase}:${keySeed}` : keySeed;
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(baseKey),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: new Uint8Array(salt),
            iterations: 250000,
            hash: 'SHA-512'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

async function getDeviceSecret() {
    let result = await chrome.storage.local.get(['deviceSecret']);
    if (!result.deviceSecret) {
        const newSecret = await generateKeySeed();
        await chrome.storage.local.set({ deviceSecret: newSecret });
        return newSecret;
    }
    return result.deviceSecret;
}

// Key derivation for passphrase encryption
async function derivePassphraseKey(salt) {
    const encoder = new TextEncoder();
    let deviceSecret = await getDeviceSecret();
    if (!deviceSecret.deviceSecret) {
        deviceSecret = await generateKeySeed();
        await chrome.storage.local.set({ deviceSecret });
    }
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(deviceSecret.deviceSecret),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: new Uint8Array(salt),
            iterations: 250000,
            hash: 'SHA-512'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// Encrypt passphrase
async function encryptPassphrase(passphrase) {
    if (!passphrase) return null;
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await derivePassphraseKey(salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        encoder.encode(passphrase)
    );
    return {
        iv: Array.from(iv),
        salt: Array.from(salt),
        encrypted: Array.from(new Uint8Array(encrypted))
    };
}

// Decrypt passphrase
async function decryptPassphrase(encryptedData) {
    if (!encryptedData) return '';
    const decoder = new TextDecoder();
    const key = await derivePassphraseKey(encryptedData.salt);
    try {
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: new Uint8Array(encryptedData.iv)
            },
            key,
            new Uint8Array(encryptedData.encrypted)
        );
        return decoder.decode(decrypted);
    } catch (error) {
        console.error('Passphrase decryption failed:', error);
        return null;
    }
}

// Encrypt API key
async function encryptApiKey(apiKey, passphrase) {
    const encoder = new TextEncoder();
    let keySeed = await chrome.storage.local.get(['keySeed']);
    if (!keySeed.keySeed) {
        keySeed = await generateKeySeed();
        await chrome.storage.local.set({ keySeed });
    } else {
        keySeed = keySeed.keySeed;
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt, keySeed);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        encoder.encode(apiKey)
    );
    return {
        iv: Array.from(iv),
        salt: Array.from(salt),
        encrypted: Array.from(new Uint8Array(encrypted)),
        version: 1,
        hasPassphrase: !!passphrase
    };
}

// Decrypt API key
async function decryptApiKey(encryptedData) {
    const decoder = new TextDecoder();
    const keySeed = await chrome.storage.local.get(['keySeed']);
    if (!keySeed.keySeed) {
        throw new Error('No key seed found. Please set API key again.');
    }
    let passphrase = '';
    if (encryptedData.hasPassphrase) {
        const encryptedPassphrase = await chrome.storage.local.get(['encryptedPassphrase']);
        passphrase = await decryptPassphrase(encryptedPassphrase.encryptedPassphrase);
        if (passphrase === null) {
            passphrase = prompt('Enter your passphrase to decrypt the API key:');
            if (!passphrase) {
                throw new Error('Passphrase required to decrypt API key.');
            }
        }
    }
    const key = await deriveKey(passphrase, encryptedData.salt, keySeed.keySeed);
    const decrypted = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: new Uint8Array(encryptedData.iv)
        },
        key,
        new Uint8Array(encryptedData.encrypted)
    );
    return decoder.decode(decrypted);
}

// Save API key and passphrase
saveApiKeyButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const passphrase = passphraseInput.value.trim();
    if (apiKey) {
        try {
            const encryptedPassphrase = await encryptPassphrase(passphrase);
            if (encryptedPassphrase) {
                await chrome.storage.local.set({ encryptedPassphrase });
            } else {
                await chrome.storage.local.remove('encryptedPassphrase');
            }
            const encryptedData = await encryptApiKey(apiKey, passphrase);
            await chrome.storage.sync.set({ encryptedApiKey: encryptedData });
            alert('API key saved securely!');
            modal.style.display = 'none';
            apiKeyInput.value = '';
            passphraseInput.value = '';
        } catch (error) {
            alert(`Error saving API key: ${error.message}`);
        }
    } else {
        alert('Please enter a valid API key.');
    }
});

// Existing functionality with API key retrieval
document.getElementById('hackCheckbox').addEventListener('change', () => {
    hackTheAI = !hackTheAI;
});

document.getElementById('correctButton').addEventListener('click', async () => {
    document.getElementById('output').innerText = 'Loading...';

    let API_KEY;
    try {
        const data = await chrome.storage.sync.get(['encryptedApiKey']);
        if (data.encryptedApiKey) {
            API_KEY = await decryptApiKey(data.encryptedApiKey);
        } else {
            document.getElementById('output').innerText = 'No API key found. Please set one.';
            return;
        }
    } catch (error) {
        document.getElementById('output').innerText = `Error retrieving API key: ${error.message}`;
        return;
    }

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

    const headers = {
        'Content-Type': 'application/json'
    };

    const user_input = document.getElementById('userInput').value;
    const tone_input = document.getElementById('dropdown').value;

    let load_text = `Correct the grammatical mistakes and errors in these sentences. Make it better. Only give the answers. Here's the text:\n"""\n${user_input}\n"""`;

    if (tone_input !== 'normal') {
        load_text = load_text + '\nAlso make sure the tone of the output should be ' + tone_input;
    }

    if (hackTheAI) {
        load_text = document.getElementById('userInput').value;
    }

    const payload = {
        contents: [
            {
                parts: [
                    {
                        text: load_text
                    }
                ]
            }
        ],
        safetySettings: [
            {
                'category': 'HARM_CATEGORY_HATE_SPEECH',
                'threshold': 'BLOCK_NONE'
            },
            {
                'category': 'HARM_CATEGORY_DANGEROUS_CONTENT',
                'threshold': 'BLOCK_NONE'
            },
            {
                'category': 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                'threshold': 'BLOCK_NONE'
            },
            {
                'category': 'HARM_CATEGORY_HARASSMENT',
                'threshold': 'BLOCK_NONE'
            }
        ],
    };

    fetch(`${url}?key=${API_KEY}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    })
        .then(response => response.json())
        .then(data => {
            let copyText = "";
            const copyButton = document.getElementById('copyButton');

            let texts = data.candidates?.flatMap(candidate =>
                candidate.content?.parts?.map(part => part.text.trim()) || []
            ) || [];

            if (texts.length > 0) {
                copyText += texts.join('\n');
                const markdownOutput = marked.parse(copyText);
                document.getElementById('output').innerHTML = markdownOutput;
                document.getElementById('outputContainer').classList.add("active");
                copyButton.style.display = 'block';
            } else {
                document.getElementById('output').innerText = 'No text found in the response.';
                document.getElementById('outputContainer').classList.remove("active");
                copyButton.style.display = 'none';
            }

            copyButton.addEventListener('click', () => {
                const outputText = copyText;
                document.getElementsByClassName('copyStatus')[0].style.display = 'block';
                navigator.clipboard.writeText(outputText)
                    .then(() => {
                        document.getElementsByClassName('copyStatus')[0].innerText = 'Copied!';
                    })
                    .catch(error => {
                        document.getElementsByClassName('copyStatus')[0].innerText = `Error: ${error}`;
                    });
            });
        })
        .catch(error => {
            document.getElementById('output').innerText = `Request failed with error ${error}`;
        });
});