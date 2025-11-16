#!/usr/bin/env python3
"""Analyze hazards on Barnsley-Balby route"""

import sqlite3
from polyline import decode as decode_polyline

conn = sqlite3.connect('voyagr_web.db')
cursor = conn.cursor()

# Route geometry from earlier test
route_geometry = 'w`zeIt|_HDGSi@AK?[GSe@p@GEq@mB?g@Oa@EGu@bAOa@j@_AMi@CG[b@IWKw@@e@Da@R}@Tm@pAlDPHPCDK@[BUFQHOJILCN@j@MLILMx@yArAcB^o@x@o@DG@Q@QAQCOoAaFG_@AYD]nCgLj@gCTiApDaYXgBLwCNwD\\_IByL?}JBwDBeBFgF@eEHmJPyQ@g@DkFHsEHyAFo@rAiLRqBAa@DcCBqBDgBDy@JaAReAXeAv@_CLi@BS@[AUEc@K{@AQDwBAOASGSwBsEO_@Sq@YiAS{AIeAGyBAkC`@{THwG?qACwHH_IH_KAmBCgAGs@Go@SqCEgAAcA@_AD_EAiBImBMuBi@cGIoBGcDBgDJ{EFmANuAl@iFTyAHc@J}A\\}GTaDVwAlDwPlAkF^sCJmAXsEPkBpBgRp@eFf@gDtB{MPaBLkAFsA@wAYeUB}@Fw@Ly@Jk@Ng@Vo@nA}B\\s@\\eAT}@l@iDXoBVwBZgDLmBHkBFkDHmBNkBR{BT{BZwBVwAT{@Xs@n@oANa@^cAlAgEb@eBTsALq@JkAHsACsDBu@Fm@Hm@TeAd@sAbCyEhBwD`@}@Ts@XiAR}@PgAFg@HgAFiB@_ACu@WsE?c@DqAB_@D]H]JWNWhCmCr@aAZo@No@Dw@HwAd@oMTaD`@cE^yCD_AEi@IOGUEYA[BYBUHQHOJK\\s@Vs@XcBJ_@\\}CTgBb@yCfAaGhA_GTaBNaBVyDJmE?uBGkEKuG[kNDuFRyDTsCb@{En@mIEsAOKIQGWC[@[DWHULOLGPiBEqD[sG[cD_@kCkAkFk@yBg@_Ba@m@MOUOQAOMKQIUCYI_BUiAiAgDiAmE_AeFk@mE{D_^cF_d@S_AIWWe@EEGOEQAS@SBS?s@IaB{@oG_@iD]gEOwCEmF?uCTuNl@q[AiAXgOFcIG_D?mAQaDUeDgCoPmByJiAoHeAyCcBiCwAoB{BaByBg@g@U_@k@Uu@OcAOqCCeA?k@By@NmB@s@AaAGaAQqBKmAK}BCqAOqb@?cMH}M`@_HtBqc@pCuw@fAuUp@sLXiILiIIgI[yH}AkTKgCe@_MOgDEeA?}DHsEX_MBeDAcACu@Iu@{AyKSqBMyAIqACaAAaAFkGAcBCwAE{Ay@qOKaEAs@?s@D]?_@Ca@E]KYOQIQESe@eCCSAS@QBSBOFOFKJKJELAJBJDHJ\\ELG|CeCdEuDhDsDjCgCtBcDjEuHvZcj@|JkQlEsHxA{BjEkGdB_CjB_CrEkFtC{CxF_HjGwIpDcGrC_F|A}B~@oAbAoA~@_A`A}@v@m@dAs@`BaAhAm@fC{@dBc@xBYzAKdBEtBFtAL|AXjATt\\|JjBh@nCd@~BNvCA|AM`C]bBa@d@OfAe@pDmBdAiAlByAjC{BR[FQFU@QDQDOHK`@kALm@ZuCn@eGJgAFeA?u@As@Cu@Ku@Gc@[_BcDwNYwAwCwKeAqCc@eAyBuE{BmEQ[[q@Y_AOq@Ks@I{@o@wMOcCC[Aa@Ca@Ie@?OBOJKHCPCXIz@c@p@Sh@Ar@JX@L?j@QVUV]tA_C^g@b@e@TQ`@Yr@_@lBs@dB[^EZIJGJMFSD_@?m@@{FAaD'

# Decode route
route_points = decode_polyline(route_geometry)
print(f'Route has {len(route_points)} points')
print(f'Route starts at: {route_points[0]}')
print(f'Route ends at: {route_points[-1]}')
print()

# Get all cameras in a bounding box around the route
cursor.execute('''
    SELECT lat, lon, description FROM cameras 
    WHERE lat BETWEEN 53.45 AND 53.56 AND lon BETWEEN -1.50 AND -1.10
    ORDER BY lat DESC, lon ASC
''')

all_cameras = cursor.fetchall()
print(f'Total cameras in route bounding box: {len(all_cameras)}')
print()

# Calculate distance from each camera to route
def haversine(lat1, lon1, lat2, lon2):
    from math import radians, cos, sin, asin, sqrt
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371
    return c * r * 1000  # meters

# Find cameras within 100m of route
cameras_on_route = []
for cam_lat, cam_lon, cam_desc in all_cameras:
    min_dist = float('inf')
    for route_lat, route_lon in route_points:
        dist = haversine(cam_lat, cam_lon, route_lat, route_lon)
        min_dist = min(min_dist, dist)
    
    if min_dist <= 100:
        cameras_on_route.append((cam_lat, cam_lon, cam_desc, min_dist))

print(f'Cameras within 100m of route: {len(cameras_on_route)}')
for lat, lon, desc, dist in sorted(cameras_on_route, key=lambda x: x[3]):
    print(f'  Lat: {lat:.5f}, Lon: {lon:.5f}, Distance: {dist:.0f}m, Desc: {desc}')

conn.close()

