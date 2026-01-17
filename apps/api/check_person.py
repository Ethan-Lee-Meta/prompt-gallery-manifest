import sqlite3

conn = sqlite3.connect('.data/library/library.db')
cursor = conn.cursor()

person_id = 'pb4e649fff47a'

print(f"Checking person: {person_id}\n")

cursor.execute('SELECT * FROM people WHERE id = ?', (person_id,))
person = cursor.fetchone()
if person:
    print(f"Person found: {person}\n")
else:
    print("Person not found!\n")

cursor.execute('SELECT * FROM face_instances WHERE person_id = ?', (person_id,))
faces = cursor.fetchall()
print(f"Face instances for this person: {len(faces)}")
for face in faces:
    print(f"  Face ID: {face[0]}, Bucket: {face[10]}, Excluded: {face[11]}, Quality: {face[9]}")

conn.close()
