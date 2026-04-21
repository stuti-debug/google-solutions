from cleaning_pipeline import CrisisGridCleaningPipeline
with open('test_data/beneficiaries.csv', 'rb') as f:
    raw = f.read()

import traceback
try:
    CrisisGridCleaningPipeline().process_file(filename='beneficiaries.csv', file_bytes=raw)
except Exception as e:
    traceback.print_exc()
