import os
import json
import urllib.parse

def sanitize_filename(filename):
    # Replace problematic characters
    new_filename = filename.replace('[', '_').replace(']', '_').replace('(', '_').replace(')', '_').replace(' ', '_')
    # Remove double underscores if any (optional, but looks cleaner)
    while '__' in new_filename:
        new_filename = new_filename.replace('__', '_')
    # Remove trailing underscore before extension
    name, ext = os.path.splitext(new_filename)
    if name.endswith('_'):
        name = name[:-1]
    return name + ext

def process_directory(base_dir, texture_dir_name):
    texture_dir = os.path.join(base_dir, texture_dir_name)
    tileset_path = os.path.join(base_dir, 'tileset.json')

    if not os.path.exists(texture_dir):
        print(f"Directory not found: {texture_dir}")
        return

    print(f"Processing directory: {texture_dir}")
    
    # Map old filenames to new filenames
    renames = {}
    
    # 1. Rename files
    for filename in os.listdir(texture_dir):
        if not filename.endswith('.b3dm'):
            continue
            
        new_filename = sanitize_filename(filename)
        
        if new_filename != filename:
            old_path = os.path.join(texture_dir, filename)
            new_path = os.path.join(texture_dir, new_filename)
            
            # Handle collision if new filename already exists (unlikely but possible)
            if os.path.exists(new_path):
                print(f"Warning: {new_filename} already exists. Skipping {filename}")
                continue
                
            os.rename(old_path, new_path)
            renames[filename] = new_filename
            # print(f"Renamed: {filename} -> {new_filename}")

    print(f"Renamed {len(renames)} files.")

    # 2. Update tileset.json
    if not os.path.exists(tileset_path):
        print(f"tileset.json not found: {tileset_path}")
        return

    with open(tileset_path, 'r', encoding='utf-8') as f:
        tileset_content = f.read()

    # Replace filenames in tileset.json
    updated_content = tileset_content
    count = 0
    
    for old_name, new_name in renames.items():
        search_str = f"{texture_dir_name}/{old_name}"
        replace_str = f"{texture_dir_name}/{new_name}"
        
        if search_str in updated_content:
            updated_content = updated_content.replace(search_str, replace_str)
            count += 1
        else:
            # Try URL encoded version just in case
            encoded_old = urllib.parse.quote(old_name)
            search_str_enc = f"{texture_dir_name}/{encoded_old}"
            if search_str_enc in updated_content:
                updated_content = updated_content.replace(search_str_enc, replace_str)
                count += 1
            # else:
            #      print(f"Warning: Could not find reference to {old_name} in tileset.json")

    with open(tileset_path, 'w', encoding='utf-8') as f:
        f.write(updated_content)

    print(f"Updated tileset.json with {count} replacements.")

def main():
    # Process Krasnoarmeiskoe
    process_directory('data/models/krasnoarmeiskoe', 'Krasnoarmeiskoe_textured')
    
    # Process Kanash
    process_directory('data/models/kanash', 'Kanash_textured')

if __name__ == "__main__":
    main()
