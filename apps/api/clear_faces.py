from library.db import get_db

with get_db() as conn:
    cursor = conn.cursor()
    cursor.execute('DELETE FROM face_instances')
    cursor.execute('DELETE FROM people')
    conn.commit()
    print('Cleared old data successfully!')
