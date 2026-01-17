import sqlite3

conn = sqlite3.connect('.data/library/library.db')
cursor = conn.cursor()

print("=== Face Clustering Results ===\n")

cursor.execute('SELECT COUNT(*) FROM people')
people_count = cursor.fetchone()[0]
print(f"Total people: {people_count}")

cursor.execute('SELECT COUNT(*) FROM face_instances')
faces_count = cursor.fetchone()[0]
print(f"Total face instances: {faces_count}")

print(f"\nClustering ratio: {faces_count} faces grouped into {people_count} people")
print(f"Average faces per person: {faces_count/people_count:.1f}\n")

print("=== People Details ===")
cursor.execute('''
    SELECT p.id, p.name, p.confidence, COUNT(f.id) as face_count 
    FROM people p
    LEFT JOIN face_instances f ON p.id = f.person_id
    GROUP BY p.id
    ORDER BY face_count DESC, p.created_at
''')

for row in cursor.fetchall():
    person_id, name, confidence, face_count = row
    print(f"\n{name} (ID: {person_id[:8]}...)")
    print(f"  Confidence: {confidence:.2f}")
    print(f"  Face instances: {face_count}")
    
    # Show face details
    cursor.execute('''
        SELECT id, asset_id, quality 
        FROM face_instances 
        WHERE person_id = ?
        ORDER BY quality DESC
    ''', (person_id,))
    
    for face_row in cursor.fetchall():
        face_id, asset_id, quality = face_row
        print(f"    - Face {face_id[:8]}... from asset {asset_id[:8]}... (quality: {quality:.2f})")

conn.close()
