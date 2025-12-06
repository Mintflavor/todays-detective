from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class ScenarioCreate(BaseModel):
    title: str
    summary: str
    crime_type: str
    case_data: Dict[str, Any]  # Stores the full CaseData JSON

class ScenarioResponse(BaseModel):
    id: str = Field(alias="_id")
    title: str
    summary: str
    crime_type: str
    created_at: datetime
    
    class Config:
        populate_by_name = True
        json_encoders = {datetime: lambda v: v.isoformat()}

class ScenarioDetail(ScenarioResponse):
    case_data: Dict[str, Any]
