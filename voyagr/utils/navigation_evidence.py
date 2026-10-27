"""Evidence-bounded lane and legal-speed interpretation; no road-class legal defaults."""
import math
import re
import time

UK_JURISDICTIONS={'England','Scotland','Wales','Northern Ireland'}
TURNS={'left':{'left','slight_left'},'right':{'right','slight_right'},'straight':{'through'},
       'exit_left':{'left','slight_left'},'exit_right':{'right','slight_right'},
       'slight_left':{'slight_left'},'slight_right':{'slight_right'}}


def lane_evidence(tags=None,*,road_matched=False,direction=None,maneuver='straight',vehicle='car'):
    tags=tags or {}
    result={'evidence_state':'UNKNOWN','recommended_lanes':[],'recommended_lane':None,'current_lane':None,
            'show_lane_guidance':False,'reason':'Applicable road/direction not established'}
    if not road_matched or direction not in ('forward','backward'): return result
    oneway=str(tags.get('oneway','')).lower()
    if (oneway in ('yes','1','true') and direction=='backward') or (oneway=='-1' and direction=='forward'): return result
    directional=tags.get('turn:lanes:'+direction)
    raw=directional or (tags.get('turn:lanes') if oneway in ('yes','1','true','-1') else None)
    if not raw: return result
    parts=[set(p.strip().lower().split(';')) for p in raw.split('|')]
    count=tags.get('lanes:'+direction) or (tags.get('lanes') if oneway in ('yes','1','true','-1') else None)
    if count is None or not str(count).isdigit() or int(count)!=len(parts) or not 1<=len(parts)<=12:
        return dict(result,evidence_state='INFERRED',reason='Lane count/direction incomplete or conflicting')
    # Conditional access/change/destination signs are retained but not interpreted as permissions.
    if any(':conditional' in k for k in tags) or tags.get('change:lanes') or tags.get('change:lanes:'+direction):
        return dict(result,evidence_state='INFERRED',reason='Lane restrictions need applicable interpretation')
    wanted=TURNS.get(maneuver)
    if not wanted: return dict(result,evidence_state='INFERRED',reason='Turn tokens do not establish junction exit topology')
    access=tags.get('vehicle:lanes:'+direction) or tags.get('vehicle:lanes') or tags.get('access:lanes')
    bus=tags.get('bus:lanes:'+direction) or tags.get('bus:lanes')
    for raw_restriction in (access,bus):
        if raw_restriction and len(raw_restriction.split('|'))!=len(parts): return result
    matches=[]
    for i,dirs in enumerate(parts):
        if access and access.split('|')[i] in ('no','private'): continue
        if vehicle!='bus' and bus and bus.split('|')[i] in ('designated','only'): continue
        if dirs & wanted: matches.append(i+1)
    return dict(result,evidence_state='EXPLICIT',recommended_lanes=matches,recommended_lane=matches[0] if matches else None,
                total_lanes=len(parts),show_lane_guidance=bool(matches),reason='Matched directional turn:lanes',
                destination_lanes=tags.get('destination:lanes:'+direction) or tags.get('destination:lanes'))


def _mapped_mph(raw):
    if not isinstance(raw,str): return None
    m=re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(mph|km/h|kmh)?\s*',raw,re.I)
    if not m: return None
    value=float(m[1]);mph=value if (m[2] or '').lower()=='mph' else value/1.609344
    return round(mph,1) if 0<mph<=100 else None


def legal_speed_evidence(tags=None,*,road_matched=False,direction=None,vehicle=None,jurisdiction=None,observed_at=None,now=None):
    tags=tags or {};now=time.time() if now is None else now
    result={'evidence_state':'UNKNOWN','speed_limit_mph':None,'applicable':False,'source':'mapped_road_evidence',
            'jurisdiction':jurisdiction,'vehicle_type':vehicle,'observed_at':observed_at,'reason':'Applicable road/legal context is unknown'}
    if not road_matched or direction not in ('forward','backward') or jurisdiction not in UK_JURISDICTIONS or vehicle not in ('car','motorcycle'):
        return result
    if not isinstance(observed_at,(int,float)) or not math.isfinite(observed_at) or not 0<=now-observed_at<=300: return result
    if str(tags.get('oneway','')).lower() in ('yes','1','true') and direction=='backward': return result
    if tags.get('oneway')=='-1' and direction=='forward': return result
    if any(k.startswith('maxspeed') and ':conditional' in k for k in tags):
        return dict(result,evidence_state='MAPPED_CONDITIONAL',reason='Conditional expression needs verified applicability')
    if any(k.startswith('maxspeed:') and k not in ('maxspeed:forward','maxspeed:backward','maxspeed:type') for k in tags):
        return dict(result,evidence_state='CONFLICTING',reason='Vehicle/advisory/variable restrictions require interpretation')
    raw=tags.get('maxspeed:'+direction) or tags.get('maxspeed')
    if raw is None: return result
    if any(x in str(raw).lower() for x in ('national','nsl','gb:','uk:')):
        return dict(result,evidence_state='LEGAL_RULE_INFERRED',reason='National rule needs vehicle/carriageway/jurisdiction evidence')
    mph=_mapped_mph(raw)
    if mph is None: return dict(result,evidence_state='CONFLICTING',reason='Non-numeric or conflicting mapped limits')
    return dict(result,evidence_state='MAPPED_POSTED',speed_limit_mph=mph,applicable=True,
                reason='Fresh matched directional numeric mapped limit; not surveyed signage')
