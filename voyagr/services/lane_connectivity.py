"""Bounded OSM relation observations; never infer connections from lane counts."""
import json
import time

from voyagr.utils.request_budget import WorkBudget, use_budget


def fetch_relations(bounds, snapshot, now=None):
    from overpass_helper import query_overpass

    query = ('[out:json][timeout:1][maxsize:524288];way["highway"]('
             + ','.join(map(str, bounds)) + ')->.roads;'
             '(relation(bw.roads)["type"="connectivity"];'
             'relation(bw.roads)["type"="restriction"];);out body;')
    try:
        with use_budget(WorkBudget(seconds=1)) as budget:
            data = query_overpass(query, cache_ttl=60)
            budget.check()
        current = time.time() * 1000 if now is None else now
        acquired = data['retrieved_at'] * 1000
        if (not data.get('success') or data.get('response_state') not in ('VALID_EMPTY', 'VALID_WITH_DATA')
                or data.get('dataset_timestamp') != snapshot or not 0 <= current - acquired <= 60000
                or len(data['elements']) > 256 or len(json.dumps(data['elements'])) > 524288):
            return None
        records = []
        for item in data['elements']:
            tags = item.get('tags', {})
            members = item.get('members')
            if item.get('type') != 'relation' or tags.get('type') not in ('connectivity', 'restriction'):
                return None
            if not isinstance(members, list) or len(members) > 16:
                return None
            roles = {'from': [], 'via': [], 'to': []}
            member_ways = []
            valid = len(members) == 3
            for member in members:
                if not isinstance(member, dict):
                    return None
                ref, role = member.get('ref'), member.get('role')
                if member.get('type') == 'way' and isinstance(ref, int) and not isinstance(ref, bool) and ref > 0:
                    member_ways.append(str(ref))
                expected = 'node' if role == 'via' else 'way'
                if (role not in roles or member.get('type') != expected
                        or isinstance(ref, bool) or not isinstance(ref, int) or ref <= 0):
                    valid = False
                    continue
                roles[role].append(str(ref))
            valid = valid and all(len(refs) == 1 for refs in roles.values())
            records.append(dict(osm_relation_id=str(item['id']), tags=tags,
                                from_ways=roles['from'], member_ways=member_ways,
                                from_way=roles['from'][0] if len(roles['from']) == 1 else None,
                                via_node=roles['via'][0] if len(roles['via']) == 1 else None,
                                to_way=roles['to'][0] if len(roles['to']) == 1 else None,
                                unsupported=not valid))
        return dict(relations=records, acquired_at_ms=acquired)
    except (KeyError, TypeError, ValueError, OverflowError, OSError):
        return None
