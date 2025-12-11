#!/usr/bin/env python3
"""Анализ содержимого b3dm файлов."""

import struct
import json
import sys
from PIL import Image
from io import BytesIO

def analyze_b3dm(filepath):
    with open(filepath, 'rb') as f:
        magic = f.read(4)
        if magic != b'b3dm':
            return None
        
        f.read(4)  # version
        f.read(4)  # byte_length
        ft_json_len = struct.unpack('<I', f.read(4))[0]
        ft_bin_len = struct.unpack('<I', f.read(4))[0]
        bt_json_len = struct.unpack('<I', f.read(4))[0]
        bt_bin_len = struct.unpack('<I', f.read(4))[0]
        
        f.read(ft_json_len + ft_bin_len + bt_json_len + bt_bin_len)
        
        gltf_data = f.read()
        
    if gltf_data[:4] != b'glTF':
        return None
    
    # Parse chunks
    offset = 12
    json_data = None
    bin_data = None
    
    while offset < len(gltf_data):
        chunk_len = struct.unpack('<I', gltf_data[offset:offset+4])[0]
        chunk_type = gltf_data[offset+4:offset+8]
        chunk_body = gltf_data[offset+8:offset+8+chunk_len]
        
        if chunk_type == b'JSON':
            json_data = json.loads(chunk_body.decode('utf-8'))
        elif chunk_type == b'BIN\x00':
            bin_data = chunk_body
        
        offset += 8 + chunk_len
        padding = (4 - (chunk_len % 4)) % 4
        offset += padding
    
    result = {'images': []}
    
    if json_data and bin_data and 'images' in json_data:
        for img in json_data['images']:
            if 'bufferView' in img:
                bv = json_data['bufferViews'][img['bufferView']]
                img_offset = bv.get('byteOffset', 0)
                img_len = bv['byteLength']
                img_bytes = bin_data[img_offset:img_offset+img_len]
                
                try:
                    pil_img = Image.open(BytesIO(img_bytes))
                    result['images'].append({
                        'name': img.get('name', 'unknown'),
                        'size': f'{pil_img.size[0]}x{pil_img.size[1]}',
                        'bytes': img_len,
                        'format': pil_img.format
                    })
                except Exception as e:
                    result['images'].append({
                        'name': img.get('name', 'unknown'),
                        'bytes': img_len,
                        'error': str(e)
                    })
    
    return result

if __name__ == '__main__':
    import os
    
    files = sys.argv[1:] if len(sys.argv) > 1 else [
        '/media/storage/data/models/krasnoarmeiskoe/Krasnoarmeiskoe_textured/30_let_Pobedi_7.b3dm',
        '/media/storage/data/models/kanash/Kanash_textured/m_Vostochniy_42.b3dm'
    ]

    for f in files:
        print(f'\n=== {os.path.basename(f)} ({os.path.getsize(f)/1024/1024:.1f}MB) ===')
        result = analyze_b3dm(f)
        if result:
            for img in result['images']:
                size = img.get('size', '?')
                mb = img.get('bytes', 0)/1024/1024
                fmt = img.get('format', img.get('error', '?'))
                print(f"  {img.get('name')}: {size} ({mb:.1f}MB) - {fmt}")
        else:
            print("  Не удалось разобрать файл")
