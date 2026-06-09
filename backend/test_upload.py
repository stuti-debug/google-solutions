import requests
import time

files = {'file': ('beneficiaries.csv', open('test_data/beneficiaries.csv', 'rb'), 'text/csv')}
response = requests.post('http://localhost:8000/clean', files=files)
print("Upload:", response.json())
job_id = response.json().get('job_id')

start = time.time()
while time.time() - start < 120:
    time.sleep(2)
    status_resp = requests.get(f'http://localhost:8000/status/{job_id}')
    data = status_resp.json()
    print("Status:", data.get('status'), data.get('progress'))
    if data.get('status') in ('completed', 'failed'):
        print(data)
        break
else:
    print("Timed out waiting for completion")
