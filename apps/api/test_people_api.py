"""Check if API returns all people and face data correctly"""
import requests
import json

BASE = "http://127.0.0.1:8000"

print("=== Checking People API ===\n")
res = requests.get(f"{BASE}/library/people?page=1&page_size=50")
data = res.json()

print(f"Total people: {data.get('total', 0)}")
print(f"Items returned: {len(data.get('items', []))}\n")

for person in data.get('items', []):
    print(f"Person: {person['name']} ({person['id']})")
    print(f"  Thumbnail: {person.get('thumbnail_path', 'NO THUMBNAIL')}")
    print(f"  Faces count: {person.get('faces_count', 0)}")
    print(f"  Assets count: {person.get('assets_count', 0)}\n")

print("\n=== Checking Specific Person Detail ===\n")
# Check first person
if data.get('items'):
    person_id = data['items'][0]['id']
    res = requests.get(f"{BASE}/library/people/{person_id}")
    person_data = res.json()
    
    print(f"Person: {person_data['name']}")
    print(f"Faces returned: {len(person_data.get('faces', []))}")
    for face in person_data.get('faces', []):
        print(f"  - Face {face['id'][:8]}: {face.get('crop_path', 'NO PATH')}")
