import sqlite3

conn = sqlite3.connect('.data/library/library.db')
cursor = conn.cursor()

cursor.execute('SELECT COUNT(*) FROM people')
print(f"People count: {cursor.fetchone()[0]}")

cursor.execute('SELECT COUNT(*) FROM face_instances')
print(f"Face instances count: {cursor.fetchone()[0]}")

cursor.execute('SELECT id, bucket, quality, excluded FROM face_instances LIMIT 5')
print('\nFace instances:')
for row in cursor.fetchall():
    print(f"  ID: {row[0]}, Bucket: {row[1]}, Quality: {row[2]}, Excluded: {row[3]}")

conn.close()
