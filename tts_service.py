import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

class GroqTTS:
    def __init__(self):
        self.client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    def speak_stream(self, text: str):
        """Streams MP3 bytes using Groq PlayAI TTS."""
        with self.client.audio.speech.with_streaming_response.create(
            model="playai-tts",
            voice="Aaliyah-PlayAI",
            response_format="mp3",
            input=text,
        ) as response:
            for chunk in response.iter_bytes(chunk_size=1024):
                yield chunk