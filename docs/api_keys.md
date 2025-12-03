# API Key Setup

To run the VAI (Voice AI) application, you need to configure the necessary API keys. Currently, this project relies heavily on **Groq** for LLM inference (Llama 3.3), Speech-to-Text (Whisper), and Text-to-Speech (PlayAI).

## Groq API Key

1.  **Visit the Groq Console:** Go to [https://console.groq.com/keys](https://console.groq.com/keys).
2.  **Login/Sign Up:** Create an account or log in.
3.  **Create API Key:** Click on "Create API Key".
4.  **Copy the Key:** Copy the generated key string (it usually starts with `gsk_`).
5.  **Configure Environment:**
    *   Duplicate the `.env.example` file and rename it to `.env`.
    *   Paste your key into the file:
        ```bash
        GROQ_API_KEY=gsk_your_key_here_...
        ```
