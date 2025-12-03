// 1. Define Verified Search Parameters
class SearchParams {
  city string? @description("Normalized city name (e.g. 'Bengaluru' for 'Bangalore')")
  hospital_name string? @description("Partial name for fuzzy matching")
  limit int? @description("Number of results to return if specified")
  is_count_query bool @description("True if the user asks for the total number/count of hospitals")
}

// 2. Define the Agent's Decision Structure
class AgentDecision {
  thought string @description("Reasoning for the action")
  search SearchParams? @description("Populate ONLY if the user asks for hospital info")
  direct_reply string? @description("Populate if no database search is needed")
  clarifying_question string? @description("Populate if more info needed for search")
}

// 3. The 'Brain' Function
function DecideAction(query: string) -> AgentDecision {
  client GroqLlama
  prompt #"
    You are a hospital network assistant named Loop AI.
    Input Context (History + Current Query):
    "{{ query }}"

    Analyze the input to determine the next action:
    
    1. **Search**: If the user is asking for hospital information (availability, location, list, count), extract 'city' and 'hospital_name'.
       - **Count Queries**: If the user asks "How many...", "Count the...", or "Total number of...", set 'is_count_query' to true.
       - **List Queries**: If the user asks to "List..." or "Show...", keep 'is_count_query' false.
       - Use conversation history to infer missing details.
       - If 'city' is missing and cannot be inferred, DO NOT SEARCH. Instead, set 'clarifying_question' to ask for the city.
    
    2. **Clarify**: If the user's intent is hospital-related but vague (e.g., "hospitals nearby" without a location), set 'clarifying_question'.

    3. **Out of Scope**: If the query is NOT about hospitals, health network, or greetings, set 'direct_reply' EXACTLY to:
       "I'm sorry, I can't help with that. I am forwarding this to a human agent."

    4. **Direct Reply**: For greetings (e.g., "Hello", "Who are you?"), reply warmly as Loop AI.

    {{ ctx.output_format }}
  "#
}

// 4. The 'Synthesizer' Function
function GenerateSpeech(query: string, data_context: string, clarifying: string) -> string {
  client GroqLlama
  prompt #"
    You are Loop AI, a hospital network assistant.
    User Query: "{{ query }}"
    Verified Database Data: "{{ data_context }}"
    Clarifying Question: "{{ clarifying }}"

    Answer the user warmly based *only* on the verified data above.
    If clarifying is provided, ask that question.
    Keep it conversational (under 2 sentences).
    DO NOT use any emojis in your response.
  "#
}