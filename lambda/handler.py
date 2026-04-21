# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import json
import os
from datetime import datetime, timezone

from bson import ObjectId
from pymongo import MongoClient

_client = None

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Content-Type": "application/json",
}


def get_collection():
    global _client
    if _client is None:
        _client = MongoClient(
            os.environ["MONGODB_URL"],
            serverSelectionTimeoutMS=5000,
        )
    return _client["todays_detective"]["scenarios"]


def response(status, body):
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, default=str, ensure_ascii=False),
    }


def handler(event, context):
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method", "")
    )
    path = event.get("path") or event.get("rawPath", "")
    raw_body = event.get("body") or "{}"
    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return response(400, {"detail": "Invalid JSON body"})
    params = event.get("queryStringParameters") or {}

    if method == "OPTIONS":
        return response(200, {})

    col = get_collection()

    if method == "POST" and path.rstrip("/") == "/scenarios":
        doc = {
            "title": body.get("title", ""),
            "summary": body.get("summary", ""),
            "crime_type": body.get("crime_type", "Unknown"),
            "case_data": body.get("case_data", {}),
            "created_at": datetime.now(timezone.utc),
        }
        result = col.insert_one(doc)
        return response(201, {"_id": str(result.inserted_id)})

    if method == "GET" and path.rstrip("/") == "/scenarios":
        page = max(int(params.get("page", 1)), 1)
        limit = min(max(int(params.get("limit", 10)), 1), 50)
        filt = {}
        if params.get("crime_type"):
            filt["crime_type"] = params["crime_type"]
        skip = (page - 1) * limit
        docs = list(
            col.find(filt, {"case_data": 0})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        for d in docs:
            d["_id"] = str(d["_id"])
        return response(200, docs)

    if method == "GET" and path.startswith("/scenarios/"):
        sid = path.rstrip("/").split("/")[-1]
        try:
            doc = col.find_one({"_id": ObjectId(sid)})
        except Exception:
            return response(400, {"detail": "Invalid id"})
        if not doc:
            return response(404, {"detail": "Not found"})
        doc["_id"] = str(doc["_id"])
        return response(200, doc)

    if method == "DELETE" and path.startswith("/scenarios/"):
        sid = path.rstrip("/").split("/")[-1]
        try:
            result = col.delete_one({"_id": ObjectId(sid)})
        except Exception:
            return response(400, {"detail": "Invalid id"})
        if result.deleted_count == 0:
            return response(404, {"detail": "Not found"})
        return response(200, {"deleted": sid})

    return response(404, {"detail": "Not found"})
