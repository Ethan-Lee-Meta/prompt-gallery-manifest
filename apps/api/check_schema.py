import sqlite3

conn = sqlite3.connect('.data/library/library.db')
cursor = conn.cursor()

cursor.execute('PRAGMA table_info(face_instances)')
print('face_instances schema:')
for row in cursor.fetchall():
    print(f'  Col {row[0]}: {row[1]} ({row[2]})')

conn.close()
