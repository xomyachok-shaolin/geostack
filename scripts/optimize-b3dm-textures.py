#!/usr/bin/env python3
"""
Скрипт для оптимизации текстур в b3dm файлах.
Извлекает текстуры, уменьшает разрешение и пересобирает b3dm.

Использование:
    python optimize-b3dm-textures.py /path/to/models --max-size 2048 --quality 85
"""

import os
import sys
import json
import struct
import argparse
import shutil
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
from io import BytesIO

try:
    from PIL import Image
except ImportError:
    print("Установите Pillow: pip install Pillow")
    sys.exit(1)


def read_b3dm(filepath):
    """Читает b3dm файл и возвращает его компоненты."""
    with open(filepath, 'rb') as f:
        # Заголовок b3dm (28 байт)
        magic = f.read(4)
        if magic != b'b3dm':
            raise ValueError(f"Не b3dm файл: {filepath}")
        
        version = struct.unpack('<I', f.read(4))[0]
        byte_length = struct.unpack('<I', f.read(4))[0]
        feature_table_json_length = struct.unpack('<I', f.read(4))[0]
        feature_table_binary_length = struct.unpack('<I', f.read(4))[0]
        batch_table_json_length = struct.unpack('<I', f.read(4))[0]
        batch_table_binary_length = struct.unpack('<I', f.read(4))[0]
        
        # Feature table
        feature_table_json = f.read(feature_table_json_length) if feature_table_json_length > 0 else b''
        feature_table_binary = f.read(feature_table_binary_length) if feature_table_binary_length > 0 else b''
        
        # Batch table
        batch_table_json = f.read(batch_table_json_length) if batch_table_json_length > 0 else b''
        batch_table_binary = f.read(batch_table_binary_length) if batch_table_binary_length > 0 else b''
        
        # glTF данные (остаток файла)
        gltf_data = f.read()
        
    return {
        'version': version,
        'feature_table_json': feature_table_json,
        'feature_table_binary': feature_table_binary,
        'batch_table_json': batch_table_json,
        'batch_table_binary': batch_table_binary,
        'gltf_data': gltf_data
    }


def parse_glb(data):
    """Парсит GLB данные."""
    if data[:4] != b'glTF':
        raise ValueError("Не GLB данные")
    
    version = struct.unpack('<I', data[4:8])[0]
    length = struct.unpack('<I', data[8:12])[0]
    
    chunks = []
    offset = 12
    
    while offset < len(data):
        chunk_length = struct.unpack('<I', data[offset:offset+4])[0]
        chunk_type = data[offset+4:offset+8]
        chunk_data = data[offset+8:offset+8+chunk_length]
        chunks.append({
            'type': chunk_type,
            'data': chunk_data
        })
        # Выравнивание до 4 байт
        offset += 8 + chunk_length
        padding = (4 - (chunk_length % 4)) % 4
        offset += padding
    
    return version, chunks


def build_glb(version, chunks):
    """Собирает GLB из компонентов."""
    body = b''
    for chunk in chunks:
        chunk_data = chunk['data']
        # Добавляем padding до кратности 4
        padding = (4 - (len(chunk_data) % 4)) % 4
        if chunk['type'] == b'JSON':
            chunk_data += b' ' * padding
        else:
            chunk_data += b'\x00' * padding
        
        body += struct.pack('<I', len(chunk['data']))  # Длина без padding
        body += chunk['type']
        body += chunk_data
    
    header = b'glTF'
    header += struct.pack('<I', version)
    header += struct.pack('<I', 12 + len(body))
    
    return header + body


def write_b3dm(filepath, components):
    """Записывает b3dm файл."""
    # Вычисляем размеры
    ft_json_len = len(components['feature_table_json'])
    ft_bin_len = len(components['feature_table_binary'])
    bt_json_len = len(components['batch_table_json'])
    bt_bin_len = len(components['batch_table_binary'])
    gltf_len = len(components['gltf_data'])
    
    total_len = 28 + ft_json_len + ft_bin_len + bt_json_len + bt_bin_len + gltf_len
    
    with open(filepath, 'wb') as f:
        # Заголовок
        f.write(b'b3dm')
        f.write(struct.pack('<I', components['version']))
        f.write(struct.pack('<I', total_len))
        f.write(struct.pack('<I', ft_json_len))
        f.write(struct.pack('<I', ft_bin_len))
        f.write(struct.pack('<I', bt_json_len))
        f.write(struct.pack('<I', bt_bin_len))
        
        # Данные
        f.write(components['feature_table_json'])
        f.write(components['feature_table_binary'])
        f.write(components['batch_table_json'])
        f.write(components['batch_table_binary'])
        f.write(components['gltf_data'])


def optimize_image(image_data, max_size, quality, mime_type='image/jpeg'):
    """Оптимизирует изображение."""
    # Увеличиваем лимит для больших текстур
    Image.MAX_IMAGE_PIXELS = 200000000
    
    img = Image.open(BytesIO(image_data))
    original_size = len(image_data)
    
    # Конвертируем в RGB если нужно
    if img.mode in ('RGBA', 'P') and mime_type == 'image/jpeg':
        img = img.convert('RGB')
    elif img.mode not in ('RGB', 'L'):
        img = img.convert('RGB')
    
    # Уменьшаем размер если больше max_size
    w, h = img.size
    if w > max_size or h > max_size:
        ratio = min(max_size / w, max_size / h)
        new_w = int(w * ratio)
        new_h = int(h * ratio)
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Сохраняем
    output = BytesIO()
    if mime_type == 'image/png':
        img.save(output, 'PNG', optimize=True)
    else:
        img.save(output, 'JPEG', quality=quality, optimize=True)
    
    new_data = output.getvalue()
    new_size = len(new_data)
    
    return new_data, original_size, new_size, img.size


def process_b3dm(filepath, output_path, max_size, quality):
    """Обрабатывает один b3dm файл."""
    try:
        # Увеличиваем лимит для больших текстур
        Image.MAX_IMAGE_PIXELS = 200000000
        
        # Читаем b3dm
        b3dm = read_b3dm(filepath)
        
        # Парсим glTF
        version, chunks = parse_glb(b3dm['gltf_data'])
        
        json_chunk = None
        bin_chunk = None
        
        for chunk in chunks:
            if chunk['type'] == b'JSON':
                json_chunk = chunk
            elif chunk['type'] == b'BIN\x00':
                bin_chunk = chunk
        
        if not json_chunk or not bin_chunk:
            shutil.copy(filepath, output_path)
            return filepath.name, 0, 0, "Нет JSON/BIN chunk"
        
        # Парсим JSON
        gltf_json = json.loads(json_chunk['data'].decode('utf-8'))
        old_binary = bin_chunk['data']
        
        total_saved = 0
        images_processed = 0
        
        # Обрабатываем изображения и собираем новый бинарный буфер
        if 'images' in gltf_json and 'bufferViews' in gltf_json:
            # Собираем все части буфера
            buffer_parts = []
            current_offset = 0
            
            # Сортируем bufferViews по offset
            bv_list = list(enumerate(gltf_json['bufferViews']))
            bv_list.sort(key=lambda x: x[1].get('byteOffset', 0))
            
            # Карта: старый индекс bufferView -> (новый offset, новая длина)
            bv_updates = {}
            
            for bv_idx, bv in bv_list:
                old_offset = bv.get('byteOffset', 0)
                old_length = bv['byteLength']
                
                # Проверяем, это изображение?
                is_image = False
                img_idx = None
                for i, img in enumerate(gltf_json.get('images', [])):
                    if img.get('bufferView') == bv_idx:
                        is_image = True
                        img_idx = i
                        break
                
                if is_image:
                    # Извлекаем и оптимизируем изображение
                    img_data = old_binary[old_offset:old_offset + old_length]
                    mime_type = gltf_json['images'][img_idx].get('mimeType', 'image/jpeg')
                    
                    new_data, old_size, new_size, new_dims = optimize_image(
                        img_data, max_size, quality, mime_type
                    )
                    
                    # Выравнивание до 4 байт
                    padding = (4 - (len(new_data) % 4)) % 4
                    new_data_padded = new_data + b'\x00' * padding
                    
                    buffer_parts.append(new_data_padded)
                    bv_updates[bv_idx] = (current_offset, len(new_data))
                    current_offset += len(new_data_padded)
                    
                    if new_size < old_size:
                        total_saved += old_size - new_size
                        images_processed += 1
                else:
                    # Копируем как есть
                    data = old_binary[old_offset:old_offset + old_length]
                    # Выравнивание до 4 байт
                    padding = (4 - (len(data) % 4)) % 4
                    data_padded = data + b'\x00' * padding
                    
                    buffer_parts.append(data_padded)
                    bv_updates[bv_idx] = (current_offset, old_length)
                    current_offset += len(data_padded)
            
            # Обновляем bufferViews
            for bv_idx, (new_offset, new_length) in bv_updates.items():
                gltf_json['bufferViews'][bv_idx]['byteOffset'] = new_offset
                gltf_json['bufferViews'][bv_idx]['byteLength'] = new_length
            
            # Собираем новый бинарный буфер
            new_binary = b''.join(buffer_parts)
            
            # Обновляем размер буфера
            if 'buffers' in gltf_json and len(gltf_json['buffers']) > 0:
                gltf_json['buffers'][0]['byteLength'] = len(new_binary)
        else:
            new_binary = old_binary
        
        if images_processed == 0:
            shutil.copy(filepath, output_path)
            return filepath.name, 0, 0, "Нет изображений для оптимизации"
        
        # Сериализуем JSON
        new_json = json.dumps(gltf_json, separators=(',', ':')).encode('utf-8')
        # Выравнивание до 4 байт
        padding = (4 - (len(new_json) % 4)) % 4
        new_json += b' ' * padding
        
        json_chunk['data'] = new_json
        bin_chunk['data'] = new_binary
        
        # Собираем GLB
        new_gltf = build_glb(version, chunks)
        
        # Записываем b3dm
        b3dm['gltf_data'] = new_gltf
        write_b3dm(output_path, b3dm)
        
        original_size = os.path.getsize(filepath)
        new_size = os.path.getsize(output_path)
        
        return filepath.name, original_size, new_size, f"OK ({images_processed} изображений)"
        
    except Exception as e:
        import traceback
        # При ошибке копируем оригинал
        shutil.copy(filepath, output_path)
        return filepath.name, 0, 0, f"Ошибка: {str(e)}"


def main():
    parser = argparse.ArgumentParser(description='Оптимизация текстур в b3dm файлах')
    parser.add_argument('input_dir', help='Директория с b3dm файлами')
    parser.add_argument('--output-dir', '-o', help='Директория для результата (по умолчанию: input_dir_optimized)')
    parser.add_argument('--max-size', '-s', type=int, default=2048, help='Максимальный размер текстуры (по умолчанию: 2048)')
    parser.add_argument('--quality', '-q', type=int, default=85, help='Качество JPEG (по умолчанию: 85)')
    parser.add_argument('--workers', '-w', type=int, default=None, help='Количество процессов')
    parser.add_argument('--inplace', '-i', action='store_true', help='Заменить оригинальные файлы')
    
    args = parser.parse_args()
    
    input_dir = Path(args.input_dir)
    if not input_dir.exists():
        print(f"Директория не найдена: {input_dir}")
        sys.exit(1)
    
    if args.inplace:
        output_dir = input_dir
    else:
        output_dir = Path(args.output_dir) if args.output_dir else Path(str(input_dir) + '_optimized')
    
    # Находим все b3dm файлы
    b3dm_files = list(input_dir.rglob('*.b3dm'))
    
    if not b3dm_files:
        print("b3dm файлы не найдены")
        sys.exit(1)
    
    print(f"Найдено {len(b3dm_files)} b3dm файлов")
    print(f"Макс. размер текстуры: {args.max_size}px")
    print(f"Качество JPEG: {args.quality}")
    print(f"Выходная директория: {output_dir}")
    print()
    
    # Создаём структуру директорий
    if not args.inplace:
        for b3dm_file in b3dm_files:
            rel_path = b3dm_file.relative_to(input_dir)
            out_path = output_dir / rel_path
            out_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Копируем tileset.json и другие файлы
    if not args.inplace:
        for json_file in input_dir.rglob('*.json'):
            rel_path = json_file.relative_to(input_dir)
            out_path = output_dir / rel_path
            out_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(json_file, out_path)
    
    # Обрабатываем файлы
    total_original = 0
    total_new = 0
    
    tasks = []
    for b3dm_file in b3dm_files:
        rel_path = b3dm_file.relative_to(input_dir)
        if args.inplace:
            out_path = b3dm_file.with_suffix('.b3dm.tmp')
        else:
            out_path = output_dir / rel_path
        tasks.append((b3dm_file, out_path))
    
    workers = args.workers or min(os.cpu_count() or 1, len(tasks))
    
    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(process_b3dm, inp, out, args.max_size, args.quality): (inp, out)
            for inp, out in tasks
        }
        
        for i, future in enumerate(as_completed(futures), 1):
            inp, out = futures[future]
            name, orig_size, new_size, status = future.result()
            
            if orig_size > 0:
                total_original += orig_size
                total_new += new_size
                reduction = (1 - new_size / orig_size) * 100
                print(f"[{i}/{len(tasks)}] {name}: {orig_size/1024/1024:.1f}MB → {new_size/1024/1024:.1f}MB ({reduction:.1f}% уменьшение)")
            else:
                print(f"[{i}/{len(tasks)}] {name}: {status}")
            
            # Если inplace, заменяем оригинал
            if args.inplace and out.exists():
                shutil.move(out, inp)
    
    print()
    if total_original > 0:
        print(f"Итого: {total_original/1024/1024:.1f}MB → {total_new/1024/1024:.1f}MB")
        print(f"Сэкономлено: {(total_original - total_new)/1024/1024:.1f}MB ({(1 - total_new/total_original)*100:.1f}%)")


if __name__ == '__main__':
    main()
