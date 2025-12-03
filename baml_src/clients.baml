client<llm> GroqLlama {
  provider openai
  options {
    base_url "https://api.groq.com/openai/v1"
    api_key env.GROQ_API_KEY
    model "llama-3.3-70b-versatile"
  }
}