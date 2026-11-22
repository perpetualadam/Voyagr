"""Dependency-free avoidance request normalization shared with isolated adapters."""

CATEGORIES = {
    'speed_cameras': ('camera_speed','camera_average_speed'),
    'red_light_cameras': ('camera_red_light',),
    'other_cameras': ('camera_other','camera_bus_lane','camera_mobile','camera'),
    'traffic_lights': ('traffic_light',), 'railway_crossings': ('railway_crossing',),
    'other_hazards': ('police','roadworks','accident','pothole','debris','road_closed'),
    'avoid_points': ('avoid_point',),
    'tolls': (), 'caz': (), 'congestion_charging': (), 'motorways': (), 'ferries': (), 'unpaved': (),
}
FLAGS = {
    'speed_cameras':'avoid_cameras','red_light_cameras':'avoid_cameras','other_cameras':'avoid_cameras',
    'traffic_lights':'avoid_traffic_lights','railway_crossings':'avoid_railway_crossings',
    'tolls':'avoid_tolls','caz':'avoid_caz','congestion_charging':'avoid_caz',
    'motorways':'avoid_motorways','ferries':'avoid_ferries','unpaved':'avoid_unpaved',
}


def normalize_requirements(data):
    mode = data.get('avoidance_mode', 'preference')
    if mode not in ('mandatory','preference'):
        raise ValueError('Invalid avoidance mode')
    for flag in set(FLAGS.values()) | {'enable_hazard_avoidance'}:
        if flag in data and not isinstance(data[flag], bool):
            raise ValueError('Avoidance flags must be booleans')
    master = data.get('enable_hazard_avoidance', False) or bool(data.get('avoid_points'))
    legacy = {
        'speed_cameras': master and data.get('avoid_cameras',True),
        'red_light_cameras': master and data.get('avoid_cameras',True),
        'other_cameras': master and data.get('avoid_cameras',True),
        'traffic_lights': master and data.get('avoid_traffic_lights',True),
        'railway_crossings': master and data.get('avoid_railway_crossings',True),
        'other_hazards': master,
        'avoid_points': bool(data.get('avoid_points')),
        'caz': data.get('avoid_caz',True) and not data.get('caz_exempt',False) and data.get('vehicle_type') != 'electric',
        'congestion_charging': data.get('avoid_caz',True) and not data.get('caz_exempt',False) and data.get('vehicle_type') != 'electric',
    }
    legacy.update({k:data.get(v,False) for k,v in FLAGS.items() if k not in legacy})
    result = {k: {'category':k,'enabled':bool(legacy.get(k)), 'mode':mode,'scope':'route'} for k in CATEGORIES}
    explicit = data.get('avoidance_requirements', [])
    if not isinstance(explicit,list) or len(explicit)>len(CATEGORIES):
        raise ValueError('Invalid avoidance requirements')
    seen = set()
    for item in explicit:
        if not isinstance(item,dict) or not isinstance(item.get('category'),str) or item['category'] not in CATEGORIES or item['category'] in seen:
            raise ValueError('Unknown or duplicate avoidance category')
        category = item['category']; seen.add(category)
        if not isinstance(item.get('enabled'),bool) or item.get('mode') not in ('mandatory','preference') or item.get('scope','route') != 'route':
            raise ValueError('Invalid avoidance requirement')
        result[category] = {'category':category,'enabled':item['enabled'],'mode':item['mode'],'scope':'route'}
    return list(result.values())

