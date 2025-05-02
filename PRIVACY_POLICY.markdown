# Privacy Policy for Sentence Corrector Chrome Extension

**Last Updated: April 30, 2025**

Thank you for using the Sentence Corrector Chrome extension ("the Extension"). This Privacy Policy explains how we collect, use, store, and protect your information when you use the Extension. By installing and using the Extension, you agree to the practices described in this policy.

## 1. Information We Collect

The Extension is designed to prioritize your privacy and minimize data collection. We collect the following types of information:

### a. User-Provided Information
- **API Key**: You may provide a Gemini API key to enable the Extension’s text correction functionality. This key is encrypted and stored securely.
- **Passphrase**: You may optionally provide a passphrase to enhance the security of your API key. This passphrase is encrypted and stored securely.
- **User Input**: Text you enter into the Extension’s textarea for correction is sent to the Gemini API for processing.

### b. Automatically Collected Information
- **Device-Specific Secrets**: The Extension generates random cryptographic secrets (e.g., key seed, device secret) to secure your API key and passphrase. These are stored locally on your device.
- **Usage Data**: The Extension does not collect analytics or usage data. All processing occurs locally or through the Gemini API.

### c. Third-Party Data
- **Gemini API**: When you use the Extension to correct text, your input text and tone preferences are sent to the Gemini 1.5 Flash API, operated by Google Cloud. The API’s response (corrected text) is displayed in the Extension. Please review [Google Cloud’s Privacy Policy](https://cloud.google.com/terms/privacy) for details on how your data is handled by the Gemini API.

## 2. How We Use Your Information

We use the collected information solely to provide the Extension’s functionality:

- **API Key**: Used to authenticate requests to the Gemini API for text correction.
- **Passphrase**: Used to derive encryption keys to protect your API key, enhancing security.
- **User Input**: Sent to the Gemini API to generate corrected text based on your specified tone.
- **Device-Specific Secrets**: Used to encrypt and decrypt your API key and passphrase, ensuring secure storage.

We do not use your information for advertising, analytics, or any purpose other than delivering the Extension’s core functionality.

## 3. Data Storage and Security

We take your privacy and security seriously and implement the following measures to protect your data:

- **Encryption**:
  - Your API key and optional passphrase are encrypted using AES-GCM (256-bit) with keys derived via PBKDF2 (SHA-512, 250,000 iterations).
  - Random salts and initialization vectors (IVs) are used for each encryption operation to ensure uniqueness.
- **Storage**:
  - Encrypted API keys are stored in `chrome.storage.sync` to enable syncing across your devices.
  - Device-specific secrets (key seed, device secret) and encrypted passphrases are stored in `chrome.storage.local`, tying them to the device where they were created.
- **Local Processing**: All encryption, decryption, and user interface operations occur locally on your device. No data is sent to our servers or any third party other than the Gemini API.

Despite these measures, no system is completely secure. You are responsible for maintaining the security of your device and choosing a strong passphrase (if used).

## 4. Data Sharing

We do not share your personal information with third parties, except as necessary to provide the Extension’s functionality:

- **Gemini API**: Your input text and tone preferences are sent to the Gemini 1.5 Flash API for processing. This is necessary to generate corrected text. We do not control how Google Cloud handles this data; please refer to their privacy policy for details.
- **No Other Sharing**: We do not sell, trade, or share your API key, passphrase, or input text with any other entities, except as required by law.

## 5. Data Retention

- **API Key and Passphrase**: Encrypted API keys and passphrases are stored indefinitely in `chrome.storage.sync` and `chrome.storage.local`, respectively, until you remove them or uninstall the Extension.
- **User Input**: Input text is not stored by the Extension. It is sent to the Gemini API during processing and discarded after the response is displayed.
- **Device-Specific Secrets**: Cryptographic secrets are stored in `chrome.storage.local` until you uninstall the Extension or manually clear your browser’s storage.

You can remove your API key and passphrase at any time by clearing the Extension’s storage via Chrome’s extension settings or by reinstalling the Extension.

## 6. Your Choices

- **API Key and Passphrase**: You can choose not to provide a passphrase, in which case the API key is encrypted using only device-specific secrets. You can also update or remove your API key and passphrase via the Extension’s settings modal.
- **Input Text**: You control the text you enter into the Extension. Avoid entering sensitive or personal information, as it will be sent to the Gemini API.
- **Hack Mode**: The Extension’s “Hack” mode allows raw input to be sent to the Gemini API, potentially bypassing safety filters. Use this feature with caution, as it may result in unsafe or inappropriate responses.

## 7. Children’s Privacy

The Extension is not intended for use by individuals under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided information through the Extension, please contact us to have it removed.

## 8. Changes to This Privacy Policy

We may update this Privacy Policy to reflect changes in the Extension’s functionality or legal requirements. The updated policy will be posted in the Extension’s GitHub repository with a revised “Last Updated” date. Significant changes will be communicated through the Extension’s UI or GitHub repository.

## 9. Contact Us

If you have questions or concerns about this Privacy Policy or the Extension’s data practices, please contact us via the [GitHub Issues page](https://github.com/your-username/sentence-corrector/issues) for the Sentence Corrector repository.

## 10. Additional Information

- **Open Source**: The Extension is open source, and its source code is available at [https://github.com/your-username/sentence-corrector](https://github.com/your-username/sentence-corrector). You can review the code to understand how your data is handled.
- **Third-Party Services**: The Extension relies on the Gemini 1.5 Flash API. We are not responsible for the privacy practices of Google Cloud or other third-party services.

---

**Sentence Corrector** is committed to protecting your privacy while providing a powerful tool for text correction. Thank you for trusting us with your data.