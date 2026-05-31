from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import httpx
import os
import json
import uuid
from datetime import datetime

load_dotenv()

app = FastAPI(title="EcoSnap API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

GEMINI_URL = f"https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

# Emission factors (kg CO2 per unit) - Africa/Ghana adjusted
EMISSION_FACTORS = {
    "car_km": 0.21,
    "bus_km": 0.089,
    "train_km": 0.041,
    "flight_hours": 90.0,
    "meat_meal": 2.5,
    "vegetarian_meal": 0.7,
    "vegan_meal": 0.3,
    "electricity_kwh": 0.55,  # Ghana grid average
}

GLOBAL_AVERAGE_DAILY_KG = 16.4  # kg CO2 per day global average


class FootprintRequest(BaseModel):
    car_km: float = 0
    bus_km: float = 0
    train_km: float = 0
    flight_hours: float = 0
    meat_meals: int = 0
    vegetarian_meals: int = 0
    vegan_meals: int = 0
    electricity_kwh: float = 0
    session_id: str = None


class FootprintResponse(BaseModel):
    session_id: str
    total_kg: float
    breakdown: dict
    tips: list
    trees_equivalent: float
    vs_global_average: str
    streak_count: int
    badge: str


async def call_gemini(prompt: str) -> str:
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 500,
        }
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(GEMINI_URL, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


async def save_to_supabase(record: dict) -> int:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/ecosnap_logs",
            headers=headers,
            json=record
        )
        response.raise_for_status()
        data = response.json()
        return data[0].get("streak_count", 1) if data else 1


async def get_streak(session_id: str) -> int:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{SUPABASE_URL}/rest/v1/ecosnap_logs?session_id=eq.{session_id}&order=created_at.desc&limit=1",
            headers=headers
        )
        data = response.json()
        if data:
            return data[0].get("streak_count", 1) + 1
        return 1


def calculate_badge(total_kg: float, streak: int) -> str:
    if total_kg < 5:
        return "🌍 Earth Guardian"
    elif total_kg < 10:
        return "🌿 Green Champion"
    elif total_kg < 16:
        return "🌱 Eco Aware"
    elif streak >= 7:
        return "🔥 Streak Master"
    else:
        return "💡 Getting Started"


@app.get("/")
async def root():
    return {"message": "EcoSnap API is live", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.post("/calculate", response_model=FootprintResponse)
async def calculate_footprint(request: FootprintRequest):
    # Generate session ID if not provided
    session_id = request.session_id or str(uuid.uuid4())

    # Calculate breakdown
    breakdown = {}

    if request.car_km > 0:
        breakdown["Car Travel"] = round(request.car_km * EMISSION_FACTORS["car_km"], 2)
    if request.bus_km > 0:
        breakdown["Bus Travel"] = round(request.bus_km * EMISSION_FACTORS["bus_km"], 2)
    if request.train_km > 0:
        breakdown["Train Travel"] = round(request.train_km * EMISSION_FACTORS["train_km"], 2)
    if request.flight_hours > 0:
        breakdown["Flights"] = round(request.flight_hours * EMISSION_FACTORS["flight_hours"], 2)
    if request.meat_meals > 0:
        breakdown["Meat Meals"] = round(request.meat_meals * EMISSION_FACTORS["meat_meal"], 2)
    if request.vegetarian_meals > 0:
        breakdown["Vegetarian Meals"] = round(request.vegetarian_meals * EMISSION_FACTORS["vegetarian_meal"], 2)
    if request.vegan_meals > 0:
        breakdown["Vegan Meals"] = round(request.vegan_meals * EMISSION_FACTORS["vegan_meal"], 2)
    if request.electricity_kwh > 0:
        breakdown["Electricity"] = round(request.electricity_kwh * EMISSION_FACTORS["electricity_kwh"], 2)

    total_kg = round(sum(breakdown.values()), 2)

    if not breakdown:
        raise HTTPException(status_code=400, detail="Please enter at least one activity")

    # Get streak
    streak = await get_streak(session_id)

    # AI tips from Gemini
    highest_category = max(breakdown, key=breakdown.get)
    highest_value = breakdown[highest_category]

    prompt = f"""
    A person in Ghana/Africa has a daily carbon footprint of {total_kg} kg CO2.
    Their biggest emission source is {highest_category} at {highest_value} kg CO2.
    The global daily average is {GLOBAL_AVERAGE_DAILY_KG} kg CO2.

    Give exactly 3 short, friendly, science-backed, actionable tips specific to their situation.
    Make them realistic for someone in Ghana/West Africa.
    
    Return ONLY a valid JSON array of 3 strings. No markdown, no explanation, no preamble.
    Example format: ["Tip one here", "Tip two here", "Tip three here"]
    """

    try:
        ai_response = await call_gemini(prompt)
        clean = ai_response.strip().replace("```json", "").replace("```", "").strip()
        tips = json.loads(clean)
        if not isinstance(tips, list):
            raise ValueError("Not a list")
    except Exception:
        tips = [
            f"Your biggest impact is {highest_category.lower()} — try reducing it by 20% this week.",
            "Switch one meal per day to plant-based — it's one of the fastest ways to cut emissions.",
            "Unplug electronics when not in use — phantom power adds up on Ghana's grid."
        ]

    # vs global average
    diff = round(((total_kg - GLOBAL_AVERAGE_DAILY_KG) / GLOBAL_AVERAGE_DAILY_KG) * 100, 1)
    if diff < 0:
        vs_global = f"🎉 You're {abs(diff)}% below the global average. Great work!"
    else:
        vs_global = f"⚠️ You're {diff}% above the global average. Let's bring it down."

    badge = calculate_badge(total_kg, streak)
    trees_equivalent = round(total_kg / 21.77, 3)

    # Save to Supabase
    try:
        await save_to_supabase({
            "session_id": session_id,
            "car_km": request.car_km,
            "bus_km": request.bus_km,
            "train_km": request.train_km,
            "flight_hours": request.flight_hours,
            "meat_meals": request.meat_meals,
            "vegetarian_meals": request.vegetarian_meals,
            "vegan_meals": request.vegan_meals,
            "electricity_kwh": request.electricity_kwh,
            "total_kg": total_kg,
            "breakdown": breakdown,
            "tips": tips,
            "streak_count": streak
        })
    except Exception as e:
        print(f"Supabase save failed: {e}")

    return FootprintResponse(
        session_id=session_id,
        total_kg=total_kg,
        breakdown=breakdown,
        tips=tips,
        trees_equivalent=trees_equivalent,
        vs_global_average=vs_global,
        streak_count=streak,
        badge=badge
    )


@app.get("/history/{session_id}")
async def get_history(session_id: str):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{SUPABASE_URL}/rest/v1/ecosnap_logs?session_id=eq.{session_id}&order=created_at.desc&limit=30",
            headers=headers
        )
        data = response.json()
        return {"session_id": session_id, "logs": data, "total_entries": len(data)}