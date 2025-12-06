from fastapi import APIRouter, HTTPException, Query
from backend.models import ScenarioCreate, ScenarioResponse, ScenarioDetail
from backend.database import scenario_collection
from datetime import datetime
from bson import ObjectId
from typing import List

router = APIRouter()

def fix_id(doc):
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc

@router.post("/", response_model=ScenarioResponse)
async def create_scenario(scenario: ScenarioCreate):
    new_scenario = scenario.model_dump()
    new_scenario["created_at"] = datetime.utcnow()
    
    result = await scenario_collection.insert_one(new_scenario)
    created_scenario = await scenario_collection.find_one({"_id": result.inserted_id})
    
    return fix_id(created_scenario)

@router.get("/", response_model=List[ScenarioResponse])
async def get_scenarios(
    page: int = Query(1, ge=1), 
    limit: int = Query(10, ge=1, le=50)
):
    skip = (page - 1) * limit
    cursor = scenario_collection.find({}, {"case_data": 0}).sort("created_at", -1).skip(skip).limit(limit)
    scenarios = await cursor.to_list(length=limit)
    return [fix_id(s) for s in scenarios]

@router.get("/{id}", response_model=ScenarioDetail)
async def get_scenario(id: str):
    try:
        oid = ObjectId(id)
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")
        
    scenario = await scenario_collection.find_one({"_id": oid})
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
        
    return fix_id(scenario)
