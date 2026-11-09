
let hackTheAI = false;

// Modal handling
const modal = document.getElementById('apiKeyModal');
const settingsButton = document.getElementById('settingsButton');
const closeModal = document.getElementById('closeModal');
const saveApiKeyButton = document.getElementById('saveApiKeyButton');
const apiKeyInput = document.getElementById('apiKeyInput');
const passphraseInput = document.getElementById('passphraseInput');
const modalStatus = document.getElementById('modalStatus');

// alert()/prompt() are not supported in Firefox extension popups,
// so messages are shown inline in the settings modal instead.
function showModalStatus(message) {
    modalStatus.innerText = message;
}

function openModal(message = '') {
    showModalStatus(message);
    modal.style.display = 'block';
}

function hideModal() {
    modal.style.display = 'none';
    apiKeyInput.value = '';
    passphraseInput.value = '';
    showModalStatus('');
}

settingsButton.addEventListener('click', () => openModal());

closeModal.addEventListener('click', hideModal);

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        hideModal();
    }
    if (event.target === unlockModal) {
        cancelUnlock();
    }
});

// ---- Passphrase unlock ----
// The passphrase is never written to disk. It is kept in storage.session,
// which the browser holds in memory and clears when it closes.
const unlockModal = document.getElementById('unlockModal');
const unlockInput = document.getElementById('unlockInput');
const unlockStatus = document.getElementById('unlockStatus');
let unlockRequest = null;

function closeUnlockPrompt() {
    unlockModal.style.display = 'none';
    unlockInput.value = '';
    unlockStatus.innerText = '';
    const request = unlockRequest;
    unlockRequest = null;
    return request;
}

function cancelUnlock() {
    closeUnlockPrompt()?.reject(new Error('passphrase not entered.'));
}

function promptForUnlock(encryptedData) {
    return new Promise((resolve, reject) => {
        unlockRequest = { encryptedData, resolve, reject };
        unlockModal.style.display = 'block';
        unlockInput.focus();
    });
}

async function submitUnlock() {
    const passphrase = unlockInput.value.trim();
    if (!unlockRequest) return;
    if (!passphrase) {
        unlockStatus.innerText = 'Enter your passphrase.';
        return;
    }
    try {
        const apiKey = await decryptApiKey(unlockRequest.encryptedData, passphrase);
        await chrome.storage.session.set({ passphrase });
        closeUnlockPrompt()?.resolve(apiKey);
        loadAvailableModels();
    } catch (error) {
        // AES-GCM reports a wrong key as an OperationError.
        unlockStatus.innerText = error.name === 'OperationError' ? 'Incorrect passphrase.' : error.message;
    }
}

document.getElementById('unlockButton').addEventListener('click', submitUnlock);
document.getElementById('closeUnlock').addEventListener('click', cancelUnlock);
unlockInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitUnlock();
});
document.getElementById('forgotPassphrase').addEventListener('click', () => {
    cancelUnlock();
    openModal('Enter your API key again. You can choose a new passphrase or leave it blank.');
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

// Older versions saved an encrypted copy of the passphrase on disk.
chrome.storage.local.remove(['encryptedPassphrase', 'deviceSecret']);

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
async function decryptApiKey(encryptedData, passphrase) {
    const decoder = new TextDecoder();
    const keySeed = await chrome.storage.local.get(['keySeed']);
    if (!keySeed.keySeed) {
        throw new Error('No key seed found. Please set API key again.');
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
            const encryptedData = await encryptApiKey(apiKey, passphrase);
            await chrome.storage.sync.set({ encryptedApiKey: encryptedData });
            if (passphrase) {
                await chrome.storage.session.set({ passphrase });
            } else {
                await chrome.storage.session.remove('passphrase');
            }
            hideModal();
            showStatus('API key saved securely!');
            loadAvailableModels();
        } catch (error) {
            showModalStatus(`Error saving API key: ${error.message}`);
        }
    } else {
        showModalStatus('Please enter a valid API key.');
    }
});

// ---- Model selection ----
// "-latest" aliases always point to Google's current models, so the defaults
// keep working when older versions are retired. The full list is loaded from
// the API once an API key is available.
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-flash-latest';
const modelSelect = document.getElementById('modelSelect');

function addModelOption(name) {
    if ([...modelSelect.options].some(o => o.value === name)) return;
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    modelSelect.appendChild(option);
}

// Returns null when no key is saved, or when the key is locked and
// `interactive` is false.
async function getApiKey({ interactive = false } = {}) {
    const { encryptedApiKey } = await chrome.storage.sync.get(['encryptedApiKey']);
    if (!encryptedApiKey) return null;
    if (!encryptedApiKey.hasPassphrase) return decryptApiKey(encryptedApiKey, '');

    const { passphrase } = await chrome.storage.session.get(['passphrase']);
    if (passphrase) {
        try {
            return await decryptApiKey(encryptedApiKey, passphrase);
        } catch {
            await chrome.storage.session.remove('passphrase');
        }
    }
    return interactive ? promptForUnlock(encryptedApiKey) : null;
}

// Adds every Gemini model the user's key can use for text generation.
async function loadAvailableModels() {
    try {
        const apiKey = await getApiKey();
        if (!apiKey) return;
        const response = await fetch(`${API_BASE}/models?pageSize=1000&key=${apiKey}`);
        const data = await response.json();
        (data.models || [])
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => m.name.replace(/^models\//, ''))
            .filter(name => name.startsWith('gemini'))
            .sort()
            .forEach(addModelOption);
    } catch (error) {
        console.warn('Could not load model list:', error);
    }
}

async function initModelSelect() {
    const { selectedModel } = await chrome.storage.sync.get(['selectedModel']);
    const model = selectedModel || DEFAULT_MODEL;
    addModelOption(model);
    modelSelect.value = model;
    await loadAvailableModels();
    modelSelect.value = model; // keep the saved choice after the list reloads
}

modelSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ selectedModel: modelSelect.value });
});

initModelSelect();

// ---- API call ----
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Calls Gemini, retrying temporary errors (overload, rate limit) with
// exponential backoff.
async function callGemini(apiKey, model, payload) {
    const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    let data;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        data = await response.json();
        if (!data.error || !RETRYABLE_STATUSES.has(data.error.code)) {
            return data;
        }
        if (attempt < MAX_ATTEMPTS) {
            document.getElementById('output').innerText =
                `${model} is busy, retrying (${attempt}/${MAX_ATTEMPTS - 1})...`;
            await sleep(1000 * 2 ** (attempt - 1)); // 1s, 2s
        }
    }
    return data;
}

// Existing functionality with API key retrieval
document.getElementById('hackCheckbox').addEventListener('change', () => {
    hackTheAI = !hackTheAI;
});

const correctButton = document.getElementById('correctButton');
const outputEl = document.getElementById('output');
const outputContainer = document.getElementById('outputContainer');
const copyButton = document.getElementById('copyButton');
const copyStatus = document.querySelector('.copyStatus');
let copyText = '';

// Shows a status/error message (not a correction result) in the output card.
function showStatus(message) {
    outputContainer.classList.remove('active');
    copyButton.style.display = 'none';
    copyStatus.style.display = 'none';
    outputEl.innerText = message;
}

function setLoading(isLoading) {
    correctButton.disabled = isLoading;
    correctButton.classList.toggle('loading', isLoading);
    correctButton.querySelector('.button-text').textContent = isLoading ? 'Correcting…' : 'Correct';
}

// Model output is untrusted, so only plain formatting is kept. DOMParser
// documents are inert: nothing in them runs or loads while being cleaned.
const ALLOWED_TAGS = new Set([
    'P', 'BR', 'HR', 'STRONG', 'EM', 'DEL', 'CODE', 'PRE', 'BLOCKQUOTE', 'A',
    'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD'
]);

function isAllowedAttribute(element, attr) {
    if (element.tagName === 'A') return attr.name === 'href' && /^https?:/i.test(attr.value);
    return element.tagName === 'OL' && attr.name === 'start';
}

function sanitizeChildren(parent) {
    for (const child of [...parent.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) continue;
        if (child.nodeType !== Node.ELEMENT_NODE) {
            child.remove();
            continue;
        }
        sanitizeChildren(child);
        if (!ALLOWED_TAGS.has(child.tagName)) {
            child.replaceWith(...child.childNodes);
            continue;
        }
        for (const attr of [...child.attributes]) {
            if (!isAllowedAttribute(child, attr)) child.removeAttribute(attr.name);
        }
        if (child.tagName === 'A') {
            child.target = '_blank';
            child.rel = 'noopener noreferrer';
        }
    }
}

function renderMarkdown(markdown) {
    const doc = new DOMParser().parseFromString(marked.parse(markdown), 'text/html');
    sanitizeChildren(doc.body);
    outputEl.replaceChildren(...doc.body.childNodes);
}

copyButton.addEventListener('click', () => {
    copyStatus.style.display = 'inline';
    navigator.clipboard.writeText(copyText)
        .then(() => {
            copyStatus.innerText = 'Copied!';
            setTimeout(() => { copyStatus.style.display = 'none'; }, 1500);
        })
        .catch(error => {
            copyStatus.innerText = `Error: ${error}`;
        });
});

correctButton.addEventListener('click', async () => {
    if (!document.getElementById('userInput').value.trim()) {
        showStatus('Type or paste some text first.');
        return;
    }

    showStatus('Working on it…');

    let API_KEY;
    try {
        API_KEY = await getApiKey({ interactive: true });
        if (!API_KEY) {
            showStatus('No API key found. Click the ⚙ icon to add one.');
            return;
        }
    } catch (error) {
        showStatus(`Error retrieving API key: ${error.message}`);
        return;
    }


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

    const model = modelSelect.value;

    setLoading(true);

    callGemini(API_KEY, model, payload)
        .then(data => {
            if (data.error) {
                const hint = RETRYABLE_STATUSES.has(data.error.code) || data.error.code === 404
                    ? '\n\nTry selecting a different model above.'
                    : '';
                showStatus(`API error ${data.error.code} (${model}): ${data.error.message}${hint}`);
                return;
            }

            const texts = data.candidates?.flatMap(candidate =>
                candidate.content?.parts
                    ?.filter(part => typeof part.text === 'string' && !part.thought)
                    .map(part => part.text.trim()) || []
            ) || [];

            if (texts.length > 0) {
                copyText = texts.join('\n');
                renderMarkdown(copyText);
                outputContainer.classList.add('active');
                copyButton.style.display = 'inline-flex';
                copyStatus.style.display = 'none';
            } else {
                showStatus('No text found in the response.');
            }
        })
        .catch(error => {
            showStatus(`Request failed: ${error}`);
        })
        .finally(() => setLoading(false));
});