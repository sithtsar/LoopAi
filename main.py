import os
import duckdb
from fastapi import FastAPI, UploadFile, Response, Form, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
from baml_client import b
from tts_service import GroqTTS
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # Changed to False to allow wildcard origins with custom headers
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# In-memory conversation history
conversations = {}

class TextQuery(BaseModel):
    query: str

# 1. Initialize Clients
groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
tts_engine = GroqTTS()

# 2. Setup DuckDB (Tooling)
con = duckdb.connect(database=':memory:')
try:
    con.execute("CREATE TABLE hospitals AS SELECT \"HOSPITAL NAME\" as name, CITY as city, Address as address FROM 'data/data.csv'")
except:
    # Mock data if CSV not found
    con.execute("CREATE TABLE hospitals (name VARCHAR, city VARCHAR, address VARCHAR)")
    con.execute("INSERT INTO hospitals VALUES ('Manipal Hospital', 'Bangalore', 'Sarjapur Road'), ('Apollo', 'Mumbai', 'CBD Belapur'), ('Manipal Sarjapur', 'Bangalore', 'Sarjapur')")

@app.post("/talk")
async def talk(file: UploadFile, session_id: str = Header(alias="session-id")):
    """
    Full pipeline: Audio -> Groq STT -> BAML Logic -> DuckDB -> Gemini TTS
    """
    try:
        # --- STEP 1: STT (Groq Whisper) ---
        # Read file into memory for the API call
        file_bytes = await file.read()
        
        if len(file_bytes) == 0:
            print("Error: Received empty audio file.")
            return Response(content="Empty audio file", status_code=400)

        transcription = groq_client.audio.transcriptions.create(
            file=("audio.wav", file_bytes), # Filename is required by Groq API
            model="whisper-large-v3",
            response_format="json"
        )
        user_text = transcription.text
        print(f"User Said: {user_text}")

        return await process_query(user_text, session_id)

    except Exception as e:
        print(f"Error processing /talk request: {str(e)}")
        import traceback
        traceback.print_exc()
        return Response(content=f"Internal Server Error: {str(e)}", status_code=500)

@app.post("/text")
async def text_query(query: str = Query(...), session_id: str = Header(alias="session-id")):
    """
    Text-based query for testing: BAML Logic -> DuckDB -> Gemini TTS
    """
    return await process_query(query, session_id)

async def process_query(user_text: str, session_id: str):

    if session_id not in conversations:
        conversations[session_id] = []

    # Build conversation history for context
    history_str = "\n".join(conversations[session_id][-4:])  # Last 4 messages for context
    full_query = f"{history_str}\nUser: {user_text}" if history_str else user_text

    # --- STEP 2: Logic & Verification (BAML) ---
    # Llama 3.3 decides what to do based on the text
    decision = await b.DecideAction(query=full_query)
    
    final_response_text = ""

    # --- STEP 3: Tool Execution (DuckDB) ---
    if decision.search:
        print(f"Executing Search Tool: {decision.search}")
        
        # Construct SQL securely. DuckDB handles the CSV query efficiently.
        base_query_conditions = " WHERE 1=1"
        if decision.search.city:
            base_query_conditions += f" AND city ILIKE '%{decision.search.city}%'"
        if decision.search.hospital_name:
            base_query_conditions += f" AND name ILIKE '%{decision.search.hospital_name}%'"

        if decision.search.is_count_query:
            query = f"SELECT COUNT(*) FROM hospitals {base_query_conditions}"
            print(f"Executing SQL Query: {query}")
            count_result = con.execute(query).fetchone()[0]
            results = f"Total count found: {count_result}"
        else:
            query = f"SELECT * FROM hospitals {base_query_conditions}"
            # Limit results based on user request or default to 5
            limit = decision.search.limit if decision.search.limit else 5
            query += f" LIMIT {limit}"
            
            print(f"Executing SQL Query: {query}")
            results = con.execute(query).fetchall()
        
        # --- STEP 4: Synthesis (BAML) ---
        # Llama 3.3 generates the answer using the fetched data
        context_str = str(results) if results else "No hospitals found matching criteria."
        final_response_text = await b.GenerateSpeech(query=user_text, data_context=context_str, clarifying="")
        
    elif decision.clarifying_question:
        final_response_text = decision.clarifying_question
        
    else:
        # Direct reply or out-of-scope
        final_response_text = decision.direct_reply or "I'm sorry, I can't help with that. I am forwarding this to a human agent."

    # Add to history
    conversations[session_id].append(f"User: {user_text}")
    conversations[session_id].append(f"Agent: {final_response_text}")

    print(f"Agent Replied: {final_response_text}")

    # --- STEP 5: TTS (Groq) ---
    # Return streaming audio
    return StreamingResponse(
        tts_engine.speak_stream(final_response_text),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=response.mp3"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
