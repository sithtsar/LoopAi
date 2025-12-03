# System Architecture

The VAI application follows a modular architecture separating the frontend interaction, API processing, logic determination, and tool execution.

## Architecture Diagram

```mermaid
graph TD

  User[User Frontend]

  subgraph FastAPI_Backend[FastAPI Backend]
    API[API Endpoint /talk]
    STT[Groq STT Whisper Large v3]
    BAML_Decision[BAML Logic DecideAction / Llama 3.3]
    DuckDB[(DuckDB Hospital Data)]
    BAML_Synth[BAML Synthesis GenerateSpeech / Llama 3.3]
    TTS[Groq TTS PlayAI]
  end

  User -->|Microphone Audio| API
  API -->|Audio Bytes| STT
  STT -->|Transcribed Text| BAML_Decision

  BAML_Decision -->|Search Query| DuckDB
  BAML_Decision -->|Direct Reply / Clarification| TTS

  DuckDB -->|Hospital Results| BAML_Synth
  BAML_Synth -->|Natural Language Response| TTS

  TTS -->|Audio Stream (MP3)| User

  style API fill:#f9f,stroke:#333,stroke-width:2px
  style DuckDB fill:#ff9,stroke:#333,stroke-width:2px
  style STT fill:#bbf,stroke:#333,stroke-width:2px
  style TTS fill:#bbf,stroke:#333,stroke-width:2px
  style BAML_Decision fill:#bfb,stroke:#333,stroke-width:2px
  style BAML_Synth fill:#bfb,stroke:#333,stroke-width:2px

```

## Component Breakdown

1.  **Frontend (HTML/JS):**
    *   Captures user audio via the browser Microphone API.
    *   Sends audio blobs to the backend.
    *   Receives streaming audio responses and visualizes them using the Web Audio API.

2.  **FastAPI Backend (`main.py`):**
    *   Orchestrates the entire pipeline.
    *   Manages session history for context-aware conversations.

3.  **Groq STT:**
    *   Converts user speech to text using the `whisper-large-v3` model for high accuracy.

4.  **BAML (Business Action Modeling Language):**
    *   **Decision Engine:** Uses `llama-3.3-70b-versatile` to analyze the user's intent (Search, Clarify, or Chat).
    *   **Synthesis Engine:** Generates natural, empathetic responses based on database results using the same LLM.

5.  **DuckDB:**
    *   A high-performance, in-memory SQL database used to store and query hospital data loaded from CSV.

6.  **Groq TTS:**
    *   Converts the final text response back into speech using the `playai-tts` model for low-latency audio generation.
