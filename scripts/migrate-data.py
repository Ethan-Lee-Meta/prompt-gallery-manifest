#!/usr/bin/env python3
"""
数据迁移脚本：从项目内的 .data/ 迁移到用户目录

用法:
    python scripts/migrate-data.py
"""
import shutil
from pathlib import Path
import sys
import os


def get_default_data_dir():
    """获取默认数据目录"""
    if os.name == 'nt':  # Windows
        base = Path(os.environ.get('LOCALAPPDATA', str(Path.home())))
        return base / 'prompt-gallery-data'
    else:  # Linux/Mac
        return Path.home() / '.local' / 'share' / 'prompt-gallery'


def migrate():
    """执行数据迁移"""
    # 项目根目录
    project_root = Path(__file__).parent.parent
    old_data = project_root / '.data'
    new_data = get_default_data_dir()
    
    print("=" * 60)
    print("Prompt Gallery Data Migration Tool")
    print("=" * 60)
    
    # 检查旧数据目录
    if not old_data.exists():
        print(f"\n[ERROR] Old data directory not found: {old_data}")
        print(f"        No data to migrate.")
        return 1
    
    print(f"\n[INFO] Found old data directory: {old_data}")
    
    # 检查新数据目录
    if new_data.exists():
        print(f"\n[WARNING] Target directory already exists: {new_data}")
        print(f"\n          Existing data may be overwritten!")
        response = input("\n          Continue migration and merge data? (y/N): ").strip().lower()
        if response != 'y':
            print("\n[CANCEL] Migration cancelled")
            return 1
    
    print(f"\n[START] Starting data migration...")
    print(f"        From: {old_data}")
    print(f"        To:   {new_data}")
    print()
    
    # 创建目标目录
    new_data.mkdir(parents=True, exist_ok=True)
    
    migrated = []
    
    # 迁移数据库
    old_db = old_data / 'prompt-gallery-app.db'
    new_db = new_data / 'prompt-gallery-app.db'
    if old_db.exists():
        if new_db.exists():
            # 备份现有数据库
            backup_db = new_data / 'prompt-gallery-app.db.backup'
            shutil.copy2(new_db, backup_db)
            print(f"        [BACKUP] Existing database backed up to: {backup_db.name}")
        
        shutil.copy2(old_db, new_db)
        migrated.append(f"Database ({old_db.stat().st_size / 1024:.1f} KB)")
        print(f"        [OK] Database migrated")
    
    # 迁移存储目录
    old_storage = old_data / 'prompt-gallery-storage'
    new_storage = new_data / 'prompt-gallery-storage'
    if old_storage.exists():
        # 统计文件数量
        file_count = sum(1 for _ in old_storage.rglob('*') if _.is_file())
        
        shutil.copytree(old_storage, new_storage, dirs_exist_ok=True)
        migrated.append(f"Media files ({file_count} files)")
        print(f"        [OK] Media files migrated ({file_count} files)")
    
    print()
    print("=" * 60)
    print("[SUCCESS] Migration completed!")
    print("=" * 60)
    print(f"\nData is now stored at: {new_data}")
    print(f"\nMigrated content:")
    for item in migrated:
        print(f"  * {item}")
    
    print(f"\nNext steps:")
    print(f"  1. Verify the application runs correctly")
    print(f"  2. After confirming data integrity, you can safely delete:")
    print(f"     {old_data}")
    
    return 0


if __name__ == '__main__':
    try:
        sys.exit(migrate())
    except KeyboardInterrupt:
        print("\n\n[CANCEL] Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n[ERROR] Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
