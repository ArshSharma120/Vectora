import zipfile
import os
from pathlib import Path

def create_extension_zip():
    """Create extension-v2.6.zip from the extension folder"""
    
    # Get the project root directory
    project_root = Path(__file__).parent
    extension_folder = project_root / 'extension'
    zip_filename = project_root / 'extension-v2.6.zip'
    
    # Check if extension folder exists
    if not extension_folder.exists():
        print(f"Error: Extension folder not found at {extension_folder}")
        return False
    
    # Create the ZIP file
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Walk through the extension directory
        for root, dirs, files in os.walk(extension_folder):
            # Skip unnecessary directories
            if '.git' in root or '__pycache__' in root or 'node_modules' in root:
                continue
                
            for file in files:
                # Skip system files
                if file.startswith('.') or file.endswith('.pyc'):
                    continue
                    
                file_path = Path(root) / file
                # Get relative path from extension folder
                arcname = file_path.relative_to(extension_folder)
                # Add to zip with 'extension/' prefix
                zipf.write(file_path, arcname=f'extension/{arcname}')
                print(f"  Added: {arcname}")
    
    print(f"\nSuccessfully created {zip_filename}")
    print(f"File size: {os.path.getsize(zip_filename) / 1024:.2f} KB")
    return True

if __name__ == '__main__':
    print("Creating extension-v2.6.zip...")
    print("-" * 50)
    create_extension_zip()
