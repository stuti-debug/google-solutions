"""Diagnostic script to trace query pipeline failures."""
import json
import re
from services.ai_mapper import GeminiAIMapper, AIMapperError
from services.session_store import SessionStore

store = SessionStore()
session_id = "e369db3b359e48fb9220a0bebde1ca9e"
meta = store.get_session_meta(session_id)

print("=== SESSION META ===")
print("Columns:", meta.get("columns"))
print("Dtypes:", meta.get("dtypes"))
print("Record count:", meta.get("record_count"))
print()

mapper = GeminiAIMapper()
print("Model:", mapper.model_name)
print()

questions = [
    "Which villages have not received food kits yet?",
    "How many records are there?",
    "hi",
]

for question in questions:
    print(f"=== TESTING: '{question}' ===")
    
    schema = [
        {"column": col, "dtype": meta.get("dtypes", {}).get(col, "TEXT")}
        for col in meta.get("columns", [])
    ]

    payload = {
        "task": "question_to_sql_for_dataset",
        "dialect": "sqlite",
        "table": "dataset",
        "question": question,
        "schema": schema,
        "profile": meta.get("profile", {}),
        "rules": [
            "Return strict JSON only.",
            "Return one safe SELECT query only.",
            "Do not use DDL/DML.",
            "Use table name dataset.",
            "Prefer concise aggregations when possible.",
        ],
        "output_schema": {
            "sql": "string",
            "reason": "string",
        },
    }

    try:
        data = mapper.request_json(payload)
        sql = data.get("sql", "")
        print(f"  AI returned SQL: {sql}")
        print(f"  AI reason: {data.get('reason', '')}")
        
        # Now test validation
        cleaned = sql.strip().rstrip(";")
        lowered = cleaned.lower()
        
        if ";" in cleaned:
            print("  VALIDATION FAIL: Multiple statements")
        elif not lowered.startswith("select"):
            print("  VALIDATION FAIL: Doesn't start with SELECT")
        elif "from dataset" not in lowered:
            print(f"  VALIDATION FAIL: 'from dataset' not found in: {lowered}")
        else:
            from_matches = re.findall(r"\bfrom\s+([a-z_][a-z0-9_]*)", lowered)
            bad_tables = [t for t in from_matches if t != "dataset"]
            if bad_tables:
                print(f"  VALIDATION FAIL: Bad tables: {bad_tables}")
            else:
                print("  VALIDATION: PASS")
    except AIMapperError as e:
        print(f"  AI MAPPER ERROR: {e}")
    except Exception as e:
        print(f"  ERROR: {type(e).__name__}: {e}")
    
    print()
