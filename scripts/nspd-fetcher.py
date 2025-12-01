#!/usr/bin/env python3
"""
НСПД Росреестр - получение кадастровых данных по координатам

Использование:
    python scripts/nspd-fetcher.py 55.89736 37.6226
"""

import json
import math
import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

LAYER_LAND = 36048
LAYER_BUILDING = 36049


def to_mercator(lat: float, lon: float) -> tuple[float, float]:
    x = lon * 20037508.34 / 180
    y = math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * 20037508.34 / math.pi
    return x, y


def get_feature(lat: float, lon: float, layer: int) -> dict | None:
    x, y = to_mercator(lat, lon)
    r = 100
    
    resp = requests.get(
        f'https://nspd.gov.ru/api/aeggis/v3/{layer}/wms',
        params={
            'SERVICE': 'WMS', 'VERSION': '1.3.0', 'REQUEST': 'GetFeatureInfo',
            'LAYERS': layer, 'QUERY_LAYERS': layer, 'INFO_FORMAT': 'application/json',
            'FEATURE_COUNT': '5', 'I': '128', 'J': '128', 'WIDTH': '256', 'HEIGHT': '256',
            'CRS': 'EPSG:3857', 'BBOX': f'{x-r},{y-r},{x+r},{y+r}',
            'STYLES': '', 'FORMAT': 'image/png',
        },
        headers={
            'User-Agent': 'Mozilla/5.0',
            'Origin': 'https://nspd.gov.ru',
            'Referer': 'https://nspd.gov.ru/map'
        },
        timeout=15,
        verify=False
    )
    
    if resp.ok:
        features = resp.json().get('features', [])
        return features[0] if features else None
    return None


def parse_building(feature: dict) -> dict:
    opts = feature.get('properties', {}).get('options', {})
    props = feature.get('properties', {})
    sys_info = props.get('systemInfo', {})
    
    return {
        'cadastralNumber': opts.get('cad_num') or props.get('label', ''),
        'address': opts.get('readable_address', ''),
        'name': opts.get('building_name', ''),
        'type': opts.get('build_record_type_value', ''),
        'purpose': opts.get('purpose', ''),
        'area': float(opts.get('build_record_area', 0) or 0),
        'floors': int(opts.get('floors', 0) or 0),
        'undergroundFloors': int(opts.get('underground_floors', 0) or 0),
        'yearBuilt': int(opts.get('year_built', 0) or 0),
        'yearCommissioning': int(opts.get('year_commisioning', 0) or 0),
        'materials': opts.get('materials', ''),
        'cadastralCost': float(opts.get('cost_value', 0) or 0),
        'costIndex': float(opts.get('cost_index', 0) or 0),
        'costDate': opts.get('cost_determination_date', ''),
        'costApplicationDate': opts.get('cost_application_date', ''),
        'costRegistrationDate': opts.get('cost_registration_date', ''),
        'determinationCause': opts.get('determination_couse', ''),
        'ownershipType': opts.get('ownership_type', ''),
        'status': opts.get('status', ''),
        'previouslyPosted': opts.get('previously_posted', ''),
        'registrationDate': opts.get('build_record_registration_date', ''),
        'quarterCadNumber': opts.get('quarter_cad_number', ''),
        'culturalHeritage': opts.get('cultural_heritage_val', ''),
        'unitedCadNumbers': opts.get('united_cad_numbers', ''),
        'intersectedCadNumbers': opts.get('intersected_cad_numbers'),
        'permittedUseName': opts.get('permitted_use_name', ''),
        'categoryName': props.get('categoryName', ''),
        'lastUpdated': sys_info.get('updated', ''),
    }


def parse_land(feature: dict) -> dict:
    opts = feature.get('properties', {}).get('options', {})
    props = feature.get('properties', {})
    sys_info = props.get('systemInfo', {})
    
    return {
        'cadastralNumber': opts.get('cad_num') or props.get('label', ''),
        'address': opts.get('readable_address', ''),
        'type': opts.get('land_record_type', ''),
        'subtype': opts.get('land_record_subtype', ''),
        'category': opts.get('land_record_category_type', ''),
        'area': float(opts.get('land_record_area') or opts.get('specified_area') or opts.get('area') or 0),
        'declaredArea': opts.get('declared_area'),
        'specifiedArea': float(opts.get('specified_area', 0) or 0),
        'permittedUse': opts.get('permitted_use_established_by_document', ''),
        'cadastralCost': float(opts.get('cost_value', 0) or 0),
        'costIndex': float(opts.get('cost_index', 0) or 0),
        'costDate': opts.get('cost_determination_date', ''),
        'costApplicationDate': opts.get('cost_application_date', ''),
        'costRegistrationDate': opts.get('cost_registration_date', ''),
        'determinationCause': opts.get('determination_couse', ''),
        'ownershipType': opts.get('ownership_type', ''),
        'status': opts.get('status', ''),
        'previouslyPosted': opts.get('previously_posted', ''),
        'registrationDate': opts.get('land_record_reg_date', ''),
        'quarterCadNumber': opts.get('quarter_cad_number', ''),
        'categoryName': props.get('categoryName', ''),
        'lastUpdated': sys_info.get('updated', ''),
    }


def fetch(lat: float, lon: float) -> dict:
    building = get_feature(lat, lon, LAYER_BUILDING)
    land = get_feature(lat, lon, LAYER_LAND)
    
    return {
        'success': bool(building or land),
        'building': parse_building(building) if building else None,
        'landPlot': parse_land(land) if land else None,
    }


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <lat> <lon>")
        sys.exit(1)
    
    lat, lon = float(sys.argv[1]), float(sys.argv[2])
    result = fetch(lat, lon)
    print(json.dumps(result, ensure_ascii=False, indent=2))
