import com.graphhopper.*;
import com.graphhopper.jackson.Jackson;
import com.graphhopper.routing.ev.*;
import com.graphhopper.routing.WeightingFactory;
import com.graphhopper.routing.querygraph.VirtualEdgeIteratorState;
import com.graphhopper.routing.weighting.AbstractAdjustedWeighting;
import com.graphhopper.util.*;
import com.graphhopper.util.details.PathDetail;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.File;
import java.util.*;
import static com.graphhopper.json.Statement.If;
import static com.graphhopper.json.Statement.Op.MULTIPLY;

/** Offline existing-graph checks only. No listener, import fallback or application wiring. */
public class ReadOnlyRouteRegression {
    static final String BLOCKS="voyagr_blocked_keys";
    static final String QUERY_TRACE="voyagr_query_traversal";
    static class QueryTraversalDetails extends com.graphhopper.util.details.PathDetailsBuilderFactory {
        @Override public List<com.graphhopper.util.details.PathDetailsBuilder> createPathDetailsBuilders(
                List<String> requested,com.graphhopper.routing.Path path,
                com.graphhopper.routing.ev.EncodedValueLookup lookup,
                com.graphhopper.routing.weighting.Weighting weighting,com.graphhopper.storage.Graph graph) {
            var standard=new ArrayList<>(requested);standard.remove(QUERY_TRACE);
            var builders=new ArrayList<>(super.createPathDetailsBuilders(standard,path,lookup,weighting,graph));
            if(requested.contains(QUERY_TRACE)) {
                require(graph instanceof com.graphhopper.routing.querygraph.QueryGraph
                    && path.getGraph()==graph,"actual request QueryGraph required");
                builders.add(new com.graphhopper.util.details.AbstractPathDetailsBuilder(QUERY_TRACE) {
                    Map<String,Object> value;
                    @Override public boolean isEdgeDifferentToLastEdge(EdgeIteratorState edge) {
                        var nodes=graph.getNodeAccess();
                        int original=edge instanceof VirtualEdgeIteratorState
                            ? ((VirtualEdgeIteratorState)edge).getOriginalEdgeKey():edge.getEdgeKey();
                        value=Map.of("query_edge_key",edge.getEdgeKey(),"original_edge_key",original,
                            "base_node",edge.getBaseNode(),"adjacent_node",edge.getAdjNode(),
                            "base_point",List.of(nodes.getLon(edge.getBaseNode()),nodes.getLat(edge.getBaseNode())),
                            "adjacent_point",List.of(nodes.getLon(edge.getAdjNode()),nodes.getLat(edge.getAdjNode())),
                            "virtual",edge instanceof VirtualEdgeIteratorState);
                        return true;
                    }
                    @Override protected Object getCurrentValue() { return value; }
                });
            }
            return builders;
        }
    }
    static class ExclusionHopper extends GraphHopper {
        ExclusionHopper() { setPathDetailsBuilderFactory(new QueryTraversalDetails()); }
        private final ThreadLocal<List<Integer>> exactAnchors=new ThreadLocal<>();
        void installAnchorIndex() {
            var delegate=getLocationIndex();
            setLocationIndex(new com.graphhopper.storage.index.LocationIndex() {
                @Override public void close() { delegate.close(); }
                @Override public void query(TileFilter filter,Visitor visitor) { delegate.query(filter,visitor); }
                @Override public com.graphhopper.storage.index.Snap findClosest(double lat,double lon,
                        com.graphhopper.routing.util.EdgeFilter filter) {
                    var anchors=exactAnchors.get();
                    if(anchors==null) return delegate.findClosest(lat,lon,filter);
                    var nodes=getBaseGraph().getNodeAccess();
                    for(int node:anchors) if(lat==nodes.getLat(node) && lon==nodes.getLon(node)) {
                        var edges=getBaseGraph().createEdgeExplorer().setBaseNode(node);
                        while(edges.next()) if(filter.accept(edges)) {
                            var snap=new com.graphhopper.storage.index.Snap(lat,lon);
                            snap.setClosestNode(node);snap.setClosestEdge(edges.detach(false));
                            snap.setWayIndex(0);snap.setQueryDistance(0);
                            snap.setSnappedPosition(com.graphhopper.storage.index.Snap.Position.TOWER);
                            snap.setSnappedPoint(new com.graphhopper.util.shapes.GHPoint3D(lat,lon,Double.NaN));
                            return snap;
                        }
                        // Never fall back to a neighbouring node when the anchor is ineligible.
                        return new com.graphhopper.storage.index.Snap(lat,lon);
                    }
                    throw new IllegalStateException("unexpected coordinate in anchored request");
                }
            });
        }
        GHResponse routeAnchored(GHRequest request,int from,int to) {
            require(exactAnchors.get()==null,"nested anchored request forbidden");
            require(request.getPoints().size()==2 && from>=0 && to>=0 && from!=to,"two distinct anchors required");
            var nodes=getBaseGraph().getNodeAccess();
            require(nodes.getLat(from)!=nodes.getLat(to) || nodes.getLon(from)!=nodes.getLon(to),
                "coincident request endpoints cannot be distinguished");
            exactAnchors.set(List.of(from,to));
            try { return route(request); } finally { exactAnchors.remove(); }
        }

        @Override protected WeightingFactory createWeightingFactory() {
            var original=super.createWeightingFactory();
            return (profile,hints,disableTurns)-> {
                var delegate=original.createWeighting(profile,hints,disableTurns);
                Set<Integer> blocked=Set.copyOf(hints.getObject(BLOCKS,Set.<Integer>of()));
                if(blocked.isEmpty()) return delegate;
                return new AbstractAdjustedWeighting(delegate) {
                    @Override public double calcEdgeWeight(EdgeIteratorState edge,boolean reverse) {
                        var state=edge.detach(false);
                        int key=state instanceof VirtualEdgeIteratorState
                            ? ((VirtualEdgeIteratorState)state).getOriginalEdgeKey():state.getEdgeKey();
                        if(reverse) key^=1;
                        return blocked.contains(key)?Double.POSITIVE_INFINITY:super.calcEdgeWeight(edge,reverse);
                    }
                    @Override public String getName() { return delegate.getName(); }
                };
            };
        }
    }
    static void require(boolean ok,String reason) {
        if(!ok) throw new IllegalStateException(reason);
    }

    static List<Integer> validate(GraphHopper hopper,ResponsePath path,boolean noMotorways,Set<Integer> blocked,
                                  com.graphhopper.routing.weighting.Weighting weighting) {
        var points=path.getPoints();
        require(path.getDistance()>0 && points.size()>=2,"invalid geometry");
        for(int i=0;i<points.size();i++)
            require(Double.isFinite(points.getLat(i)) && Double.isFinite(points.getLon(i))
                && Math.abs(points.getLat(i))<=90 && Math.abs(points.getLon(i))<=180,"invalid point");
        List<PathDetail> trace=path.getPathDetails().get("edge_key");
        require(trace!=null && !trace.isEmpty(),"directed trace missing");
        var access=hopper.getEncodingManager().getBooleanEncodedValue("car_access");
        var roadClass=hopper.getEncodingManager().getEnumEncodedValue("road_class",RoadClass.class);
        var restriction=hopper.getEncodingManager().getTurnBooleanEncodedValue(TurnRestriction.key("car"));
        require(restriction!=null,"turn evidence missing");
        int cursor=0;
        List<Integer> keys=new ArrayList<>();
        for(PathDetail detail:trace) {
            require(detail.getFirst()==cursor && detail.getLast()>cursor
                && detail.getLast()<points.size(),"incomplete directed trace");
            int key=((Number)detail.getValue()).intValue();
            require(key>=0,"invalid directed key");
            require(!blocked.contains(key),"mandatory directed exclusion violated");
            var edge=hopper.getBaseGraph().getEdgeIteratorStateForKey(key);
            require(edge.get(access),"vehicle access conflict");
            require(!noMotorways || edge.get(roadClass)!=RoadClass.MOTORWAY,"mandatory motorway exclusion violated");
            // A via point can split one original directed edge into successive intervals.
            if(keys.isEmpty() || keys.get(keys.size()-1)!=key) {
                if(!keys.isEmpty()) {
                    int previous=keys.get(keys.size()-1);
                    var incoming=hopper.getBaseGraph().getEdgeIteratorStateForKey(previous);
                    require(incoming.getAdjNode()==edge.getBaseNode(),"disconnected directed edges");
                    require(!hopper.getBaseGraph().getTurnCostStorage().get(restriction,
                        previous/2,incoming.getAdjNode(),key/2),"imported turn restriction violated");
                    double turnWeight=weighting.calcTurnWeight(previous/2,incoming.getAdjNode(),key/2);
                    require(Double.isFinite(turnWeight) && turnWeight>=0,"invalid profile turn weight");
                }
                keys.add(key);
            }
            cursor=detail.getLast();
        }
        require(cursor==points.size()-1,"directed trace does not cover geometry");
        require(!path.getInstructions().isEmpty(),"instructions missing");
        return keys;
    }

    static List<Integer> associated(Map<String,List<Integer>> associations,String id) {
        require(associations.containsKey(id),"unverified association: "+id);
        return associations.get(id);
    }

    static Map<String,Object> nodeDiagnostic(GraphHopper hopper,int node,Set<Integer> blocked) {
        var access=hopper.getEncodingManager().getBooleanEncodedValue("car_access");
        var way=hopper.getEncodingManager().hasEncodedValue("osm_way_id")
            ? hopper.getEncodingManager().getIntEncodedValue("osm_way_id"):null;
        var nodes=hopper.getBaseGraph().getNodeAccess();
        List<Map<String,Object>> neighbors=new ArrayList<>();
        var edges=hopper.getBaseGraph().createEdgeExplorer().setBaseNode(node);
        boolean truncated=false;
        while(edges.next()) {
            if(neighbors.size()>=12) { truncated=true;break; }
            Map<String,Object> row=new LinkedHashMap<>();
            row.put("edge_key",edges.getEdgeKey());row.put("adjacent_node",edges.getAdjNode());
            row.put("distance_m",edges.getDistance());row.put("car_forward",edges.get(access));
            row.put("car_reverse",edges.getReverse(access));
            row.put("forward_blocked",blocked.contains(edges.getEdgeKey()));
            row.put("reverse_blocked",blocked.contains(edges.getEdgeKey()^1));
            if(way!=null) row.put("osm_way_id",edges.get(way));
            neighbors.add(row);
        }
        return Map.of("node_id",node,"lat",nodes.getLat(node),"lon",nodes.getLon(node),
            "neighbors",neighbors,"neighbors_truncated",truncated);
    }

    static Map<String,Object> independentSnap(GraphHopper hopper,GHRequest request,double lat,double lon) {
        var hints=new PMap();hints.putAll(request.getHints());
        if(request.getCustomModel()!=null) hints.putObject(CustomModel.KEY,request.getCustomModel());
        var weighting=hopper.createWeighting(hopper.getProfile("car"),hints);
        var subnet=hopper.getEncodingManager().getBooleanEncodedValue(Subnetwork.key("car"));
        var snap=hopper.getLocationIndex().findClosest(lat,lon,
            new com.graphhopper.routing.util.DefaultSnapFilter(weighting,subnet));
        if(!snap.isValid()) return Map.of("valid",false);
        return Map.of("valid",true,"position",snap.getSnappedPosition().name(),
            "distance_m",snap.getQueryDistance(),"closest_node_before_query_graph",snap.getClosestNode(),
            "closest_edge_key",snap.getClosestEdge().getEdgeKey(),
            "lat",snap.getSnappedPoint().getLat(),"lon",snap.getSnappedPoint().getLon());
    }

    static Map<String,Object> anchorDiagnostic(GraphHopper hopper,GHRequest request,ResponsePath path,
                                               List<Integer> keys,int start,int end,Set<Integer> blocked) {
        Map<String,Object> result=new LinkedHashMap<>();
        try {
            int first=hopper.getBaseGraph().getEdgeIteratorStateForKey(keys.get(0)).getBaseNode();
            int last=hopper.getBaseGraph().getEdgeIteratorStateForKey(keys.get(keys.size()-1)).getAdjNode();
            var geometry=path.getPoints();var nodes=hopper.getBaseGraph().getNodeAccess();
            result.put("expected_start",nodeDiagnostic(hopper,start,blocked));
            result.put("expected_end",nodeDiagnostic(hopper,end,blocked));
            result.put("first_original_base",nodeDiagnostic(hopper,first,blocked));
            result.put("last_original_adjacent",nodeDiagnostic(hopper,last,blocked));
            result.put("first_directed_key",keys.get(0));result.put("last_directed_key",keys.get(keys.size()-1));
            result.put("original_node_identity_matches",first==start && last==end);
            result.put("route_start",List.of(geometry.getLat(0),geometry.getLon(0)));
            result.put("route_end",List.of(geometry.getLat(geometry.size()-1),geometry.getLon(geometry.size()-1)));
            result.put("start_coordinate_error_m",DistanceCalcEarth.DIST_EARTH.calcDist(
                nodes.getLat(start),nodes.getLon(start),geometry.getLat(0),geometry.getLon(0)));
            result.put("end_coordinate_error_m",DistanceCalcEarth.DIST_EARTH.calcDist(
                nodes.getLat(end),nodes.getLon(end),geometry.getLat(geometry.size()-1),geometry.getLon(geometry.size()-1)));
            result.put("start_to_first_original_base_m",DistanceCalcEarth.DIST_EARTH.calcDist(
                geometry.getLat(0),geometry.getLon(0),nodes.getLat(first),nodes.getLon(first)));
            result.put("end_to_last_original_adjacent_m",DistanceCalcEarth.DIST_EARTH.calcDist(
                geometry.getLat(geometry.size()-1),geometry.getLon(geometry.size()-1),nodes.getLat(last),nodes.getLon(last)));
            result.put("independent_start_snap",independentSnap(hopper,request,nodes.getLat(start),nodes.getLon(start)));
            result.put("independent_end_snap",independentSnap(hopper,request,nodes.getLat(end),nodes.getLon(end)));
            result.put("snap_scope","independent eligible-edge lookup; not Router QueryGraph attestation");
        } catch(Exception error) { result.put("diagnostic_error",error.getClass().getSimpleName()+": "+error.getMessage()); }
        return result;
    }

    // Diagnostic oracle only: bypass coordinate snapping, never substitute for route acceptance.
    static Map<String,Object> exactNodeDiagnostic(GraphHopper hopper,GHRequest request,
                                                   int from,int to,int budget,Set<Integer> blocked) {
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("status","UNVERIFIED_OR_FAILED");
        result.put("route_absence_proven",false);
        result.put("scope","base graph edge-based Dijkstra; no coordinate snapping or initial/final heading constraint");
        result.put("from_node",from);result.put("to_node",to);
        long start=System.nanoTime();
        try {
            require(from>=0 && to>=0 && from!=to,"distinct exact anchors required");
            result.put("from_node_details",nodeDiagnostic(hopper,from,blocked));
            result.put("to_node_details",nodeDiagnostic(hopper,to,blocked));
            var weighting=hopper.createWeighting(hopper.getProfile("car"),request.getHints());
            var algorithm=new com.graphhopper.routing.Dijkstra(hopper.getBaseGraph(),weighting,
                com.graphhopper.routing.util.TraversalMode.EDGE_BASED);
            algorithm.setMaxVisitedNodes(budget);algorithm.setTimeoutMillis(20000);
            var path=algorithm.calcPath(from,to);
            result.put("visited_nodes",algorithm.getVisitedNodes());
            require(path.isFound(),"no path returned within diagnostic budget; route absence unproven");
            require(path.getFromNode()==from && path.getEndNode()==to,"exact-node endpoints differ");
            var access=hopper.getEncodingManager().getBooleanEncodedValue("car_access");
            var restriction=hopper.getEncodingManager().getTurnBooleanEncodedValue(TurnRestriction.key("car"));
            require(restriction!=null,"turn evidence missing");
            var keys=new ArrayList<Integer>();
            int cursor=from,previous=-1;
            double distance=0;
            for(var edge:path.calcEdges()) {
                int key=edge.getEdgeKey();
                require(edge.getBaseNode()==cursor,"disconnected exact-node path");
                require(!blocked.contains(key),"mandatory directed exclusion violated");
                require(edge.get(access) && Double.isFinite(weighting.calcEdgeWeight(edge,false)),"inaccessible exact-node edge");
                if(previous>=0) {
                    require(!hopper.getBaseGraph().getTurnCostStorage().get(restriction,previous/2,cursor,key/2),
                        "imported turn restriction violated");
                    require(Double.isFinite(weighting.calcTurnWeight(previous/2,cursor,key/2)),"non-finite turn weight");
                }
                keys.add(key);distance+=edge.getDistance();cursor=edge.getAdjNode();previous=key;
            }
            require(!keys.isEmpty() && cursor==to && Math.abs(distance-path.getDistance())<0.01,
                "incomplete exact-node trace");
            result.put("status","PASS_EXACT_NODE_DIAGNOSTIC");
            result.put("distance_m",path.getDistance());result.put("duration_ms",path.getTime());
            result.put("directed_edge_keys",keys);result.put("forbidden_traversals",0);
        } catch(Exception error) { result.put("reason",error.getClass().getSimpleName()+": "+error.getMessage()); }
        finally { result.put("query_ms",(System.nanoTime()-start)/1e6); }
        return result;
    }

    static class OriginObservationStop extends RuntimeException {
        final String reason;
        OriginObservationStop(String reason) { super(reason);this.reason=reason; }
    }
    static double originEdgeDistance(PointList shape,double lat,double lon,long deadline) {
        if(shape.size()<2)throw new OriginObservationStop("invalid_imported_geometry");
        double nearest=Double.POSITIVE_INFINITY;
        for(int i=0;i<shape.size();i++) {
            if(i%256==0 && System.nanoTime()>deadline)throw new OriginObservationStop("time_budget");
            double a=shape.getLat(i),b=shape.getLon(i);
            if(!Double.isFinite(a) || !Double.isFinite(b) || Math.abs(a)>90 || Math.abs(b)>180)
                throw new OriginObservationStop("invalid_imported_geometry");
            nearest=Math.min(nearest,DistanceCalcEarth.DIST_EARTH.calcDist(lat,lon,a,b));
            if(i>0 && DistanceCalcEarth.DIST_EARTH.validEdgeDistance(lat,lon,shape.getLat(i-1),shape.getLon(i-1),a,b))
                nearest=Math.min(nearest,DistanceCalcEarth.DIST_EARTH.calcDenormalizedDist(
                    DistanceCalcEarth.DIST_EARTH.calcNormalizedEdgeDistance(lat,lon,shape.getLat(i-1),shape.getLon(i-1),a,b)));
        }
        if(!Double.isFinite(nearest))throw new OriginObservationStop("invalid_distance");
        return nearest;
    }
    static Map<String,Object> originObservationReport(TreeSet<Integer> keys,int examined,double radius,
                                                       int limit,boolean complete,String reason) {
        var retained=new TreeSet<>(keys.stream().limit(256).toList());
        String classification=!complete?"UNVERIFIED":retained.size()>1?"MULTIPLE_OBSERVED_TRAVERSALS"
            :retained.isEmpty()?"NO_OBSERVED_TRAVERSAL":"ONE_OBSERVED_TRAVERSAL";
        var result=new LinkedHashMap<String,Object>();
        result.put("scope","encoded_car_access_in_imported_graph_only");
        result.put("classification",classification);result.put("scan_complete",complete);result.put("reason",reason);
        result.put("radius_m",radius);result.put("edge_limit",limit);result.put("edges_examined",examined);
        result.put("candidate_count",retained.size());result.put("candidate_edge_keys",retained);
        result.put("key_scope","current_loaded_graph_only");result.put("avoidance_filter_applied",false);
        result.put("heading_verification","UNVERIFIED");result.put("physical_road_verification","UNVERIFIED");
        result.put("navigation_allowed",false);result.put("route_absence_proven",false);
        return result;
    }
    static Map<String,Object> observeIndexedOriginCandidates(GraphHopper hopper,double lat,double lon,
                                                               double radius,int limit) {
        var keys=new TreeSet<Integer>();var seen=new HashSet<Integer>();
        // Counts: processed edges, geometry vertices, visited tiles, edge callbacks.
        int[] counts=new int[4];boolean finished=false;String reason="index_coverage_unverified";
        long deadline=System.nanoTime()+250_000_000L;
        var box=DistanceCalcEarth.DIST_EARTH.createBBox(lat,lon,2*radius+.05);
        if(Math.abs(lat)>80 || box.minLon < -180 || box.maxLon > 180)
            reason="unsupported_index_envelope";
        else try {
            var access=hopper.getEncodingManager().getBooleanEncodedValue("car_access");
            hopper.getLocationIndex().query(box,new com.graphhopper.storage.index.LocationIndex.Visitor() {
                void checkTime() {if(System.nanoTime()>deadline)throw new OriginObservationStop("time_budget");}
                @Override public boolean isTileInfo() {return true;}
                @Override public void onTile(com.graphhopper.util.shapes.BBox tile,int depth) {
                    checkTime();if(++counts[2]>10000)throw new OriginObservationStop("tile_budget");
                }
                @Override public void onEdge(int id) {
                    checkTime();if(++counts[3]>50000)throw new OriginObservationStop("callback_budget");
                    if(id<0 || id>=hopper.getBaseGraph().getEdges() || id>Integer.MAX_VALUE/2)
                        throw new OriginObservationStop("invalid_index_edge");
                    if(!seen.add(id))return;
                    if(counts[0]>=limit)throw new OriginObservationStop("edge_budget");
                    var edge=hopper.getBaseGraph().getEdgeIteratorStateForKey(id*2);
                    if(edge==null)throw new OriginObservationStop("invalid_index_edge");
                    var shape=edge.fetchWayGeometry(FetchMode.ALL);
                    if(counts[1]+shape.size()>100000)throw new OriginObservationStop("geometry_budget");
                    counts[0]++;counts[1]+=shape.size();
                    if(originEdgeDistance(shape,lat,lon,deadline)<=radius) {
                        if(edge.get(access))keys.add(edge.getEdgeKey());
                        if(edge.getReverse(access))keys.add(edge.getReverseEdgeKey());
                        if(keys.size()>256)throw new OriginObservationStop("candidate_budget");
                    }
                }
            });
            if(System.nanoTime()>deadline)throw new OriginObservationStop("time_budget");
            finished=true;
        }catch(OriginObservationStop stop){reason=stop.reason;}
         catch(Exception error){reason="index_query_failure";}
        // Finishing a stored-index traversal never attests its construction/coverage.
        var result=originObservationReport(keys,counts[0],radius,limit,false,reason);
        result.put("lookup_method","index");result.put("index_query_complete",finished);
        result.put("index_coverage_verification","UNVERIFIED");
        result.put("tiles_visited",counts[2]);result.put("edge_callbacks",counts[3]);
        return result;
    }

    // Operator-selected diagnostic only. Never use avoidance-filtered snapping to
    // decide which road the vehicle might occupy, or turn a partial scan into proof.
    static Map<String,Object> observeOriginCandidates(GraphHopper hopper,JsonNode point,JsonNode options) {
        require(options.isObject() && options.has("radius_m") && options.size()<=3,"invalid origin diagnostic options");
        var names=options.fieldNames();
        while(names.hasNext()) require(Set.of("radius_m","edge_limit","lookup").contains(names.next()),"unsupported origin diagnostic option");
        require(options.get("radius_m").isNumber(),"origin radius must be numeric");
        double radius=options.get("radius_m").doubleValue();
        require(Double.isFinite(radius) && radius>=.01 && radius<=150,"origin radius outside diagnostic bounds");
        int limit=10000;
        if(options.has("edge_limit")) {
            require(options.get("edge_limit").isIntegralNumber() && options.get("edge_limit").canConvertToInt(),"invalid origin edge limit");
            limit=options.get("edge_limit").intValue();
        }
        require(limit>=1 && limit<=10000,"origin edge limit outside diagnostic bounds");
        require(point.isArray() && point.size()==2 && point.get(0).isNumber() && point.get(1).isNumber(),"invalid origin diagnostic point");
        double lat=point.get(0).asDouble(),lon=point.get(1).asDouble();
        require(Double.isFinite(lat) && Double.isFinite(lon) && Math.abs(lat)<=90 && Math.abs(lon)<=180,"invalid origin diagnostic point");
        String lookup="full_scan";
        if(options.has("lookup")) {
            require(options.get("lookup").isTextual() && Set.of("full_scan","index").contains(options.get("lookup").asText()),"unsupported origin lookup");
            lookup=options.get("lookup").asText();
        }
        if(lookup.equals("index"))return observeIndexedOriginCandidates(hopper,lat,lon,radius,limit);
        var access=hopper.getEncodingManager().getBooleanEncodedValue("car_access");
        var edges=hopper.getBaseGraph().getAllEdges();
        var keys=new TreeSet<Integer>();
        int examined=0,vertices=0;boolean complete=true;String reason="complete_imported_graph_scan";
        long deadline=System.nanoTime()+250_000_000L;
        while(edges.next()) {
            if(examined>=limit || System.nanoTime()>deadline) {complete=false;reason="edge_or_time_budget";break;}
            var shape=edges.fetchWayGeometry(FetchMode.ALL);
            if(shape.size()<2) {complete=false;reason="invalid_imported_geometry";break;}
            if(vertices+shape.size()>100000) {complete=false;reason="geometry_budget";break;}
            vertices+=shape.size();examined++;
            double nearest;
            try{nearest=originEdgeDistance(shape,lat,lon,deadline);}
            catch(OriginObservationStop stop){complete=false;reason=stop.reason;break;}
            if(nearest<=radius) {
                if(edges.get(access)) keys.add(edges.getEdgeKey());
                if(edges.getReverse(access)) keys.add(edges.getReverseEdgeKey());
                if(keys.size()>256) {complete=false;reason="candidate_budget";keys=new TreeSet<>(keys.stream().limit(256).toList());break;}
            }
        }
        var result=originObservationReport(keys,examined,radius,limit,complete,reason);
        result.put("lookup_method","full_scan");return result;
    }

    static void addGridCuts(TreeSet<Double> cuts,double a,double b,double minimum,double delta,int parts,int sampleLimit,long deadline) {
        if(a==b)return;
        long first=Math.max(1,(long)Math.floor((Math.min(a,b)-minimum)/delta)+1);
        long last=Math.min(parts-1,(long)Math.ceil((Math.max(a,b)-minimum)/delta)-1);
        for(long k=first;k<=last;k++) {
            if(System.nanoTime()>deadline)throw new OriginObservationStop("time_budget");
            double t=(minimum+k*delta-a)/(b-a);
            if(Double.isFinite(t) && t>0 && t<1)cuts.add(t);
            if(cuts.size()>sampleLimit+2)throw new OriginObservationStop("sample_budget");
        }
    }
    static void geometryProbe(List<double[]> samples,int[] kinds,int kind,double lat,double lon,int sampleLimit) {
        if(samples.size()>=sampleLimit)throw new OriginObservationStop("sample_budget");
        if(!Double.isFinite(lat)||!Double.isFinite(lon)||Math.abs(lat)>80||Math.abs(lon)>180)
            throw new OriginObservationStop("unsupported_geometry_envelope");
        samples.add(new double[]{lat,lon});kinds[kind]++;
    }

    // Graph-derived finite segment/grid probes. Never infer exhaustive coverage
    // from stored tile callbacks (the public global query deduplicates edge IDs).
    static Map<String,Object> observeIndexGeometry(GraphHopper hopper,int limit,int sampleLimit) {
        require(limit>=1 && limit<=10000 && sampleLimit>=1 && sampleLimit<=128,"invalid geometry audit limits");
        var samples=new ArrayList<double[]>();var rows=new ArrayList<Map<String,Object>>();
        boolean selectionComplete=false;String reason="graph_geometry_probes_selected";
        int edgesSeen=0,vertices=0,segmentsSeen=0,gridParts=0,resolution=0;
        int[] kinds=new int[4]; // endpoints, original midpoints, grid crossings, cell-interval midpoints
        long deadline=System.nanoTime()+20_000_000_000L;
        try {
            if(!(hopper.getLocationIndex() instanceof com.graphhopper.storage.index.LocationIndexTree tree))
                throw new OriginObservationStop("unsupported_index_grid");
            resolution=tree.getMinResolutionInMeter();
            if(resolution<1 || resolution>1_000_000)throw new OriginObservationStop("unsupported_index_grid");
            var grid=com.graphhopper.storage.index.IndexStructureInfo.create(hopper.getBaseGraph().getBounds(),resolution);
            gridParts=grid.getParts();var bounds=grid.getBounds();
            double dy=grid.getDeltaLat(),dx=grid.getDeltaLon();
            if(gridParts<1 || gridParts>1_048_576 || !Double.isFinite(dx) || !Double.isFinite(dy) || dx<=0 || dy<=0)
                throw new OriginObservationStop("unsupported_index_grid");
            var edges=hopper.getBaseGraph().getAllEdges();
            while(edges.next()) {
                if(System.nanoTime()>deadline)throw new OriginObservationStop("time_budget");
                if(edgesSeen>=limit)throw new OriginObservationStop("edge_budget");
                var shape=edges.fetchWayGeometry(FetchMode.ALL);edgesSeen++;
                if(shape.size()<2)throw new OriginObservationStop("invalid_imported_geometry");
                if(vertices+shape.size()>100000)throw new OriginObservationStop("geometry_budget");
                vertices+=shape.size();
                for(int i=0;i+1<shape.size();i++) {
                    double lat=shape.getLat(i),lon=shape.getLon(i);
                    double nextLat=shape.getLat(i+1),nextLon=shape.getLon(i+1);
                    if(!Double.isFinite(lat)||!Double.isFinite(lon)||!Double.isFinite(nextLat)||!Double.isFinite(nextLon)
                        ||Math.abs(lat)>90||Math.abs(nextLat)>90||Math.abs(lon)>180||Math.abs(nextLon)>180)
                        throw new OriginObservationStop("invalid_imported_geometry");
                    if(Math.abs(lat)>80||Math.abs(nextLat)>80||Math.abs(lon-nextLon)>180)
                        throw new OriginObservationStop("unsupported_geometry_envelope");
                    segmentsSeen++;
                    geometryProbe(samples,kinds,0,lat,lon,sampleLimit);
                    geometryProbe(samples,kinds,1,(lat+nextLat)/2,(lon+nextLon)/2,sampleLimit);
                    geometryProbe(samples,kinds,0,nextLat,nextLon,sampleLimit);
                    var cuts=new TreeSet<Double>();cuts.add(0d);cuts.add(1d);
                    addGridCuts(cuts,lon,nextLon,bounds.minLon,dx,gridParts,sampleLimit,deadline);
                    addGridCuts(cuts,lat,nextLat,bounds.minLat,dy,gridParts,sampleLimit,deadline);
                    double previous=0;
                    for(double t:cuts) {
                        if(t==0)continue;
                        double mid=(previous+t)/2;
                        geometryProbe(samples,kinds,3,lat+(nextLat-lat)*mid,lon+(nextLon-lon)*mid,sampleLimit);
                        if(t<1)geometryProbe(samples,kinds,2,lat+(nextLat-lat)*t,lon+(nextLon-lon)*t,sampleLimit);
                        previous=t;
                    }
                }
            }
            selectionComplete=true;
        }catch(OriginObservationStop stop){reason=stop.reason;}
         catch(Exception error){reason="geometry_selection_failure";}
        var mapper=new ObjectMapper();
        for(var sample:samples) {
            if(System.nanoTime()>deadline){reason="time_budget";break;}
            var point=mapper.createArrayNode().add(sample[0]).add(sample[1]);
            var options=mapper.createObjectNode().put("radius_m",1).put("edge_limit",limit);
            var full=observeOriginCandidates(hopper,point,options);
            options.put("lookup","index");var indexed=observeOriginCandidates(hopper,point,options);
            boolean complete=Boolean.TRUE.equals(full.get("scan_complete")) && Boolean.TRUE.equals(indexed.get("index_query_complete"));
            var expected=new TreeSet<Integer>((Collection<Integer>)full.get("candidate_edge_keys"));
            var actual=new TreeSet<Integer>((Collection<Integer>)indexed.get("candidate_edge_keys"));
            var missing=new TreeSet<Integer>(expected);missing.removeAll(actual);
            var unexpected=new TreeSet<Integer>(actual);unexpected.removeAll(expected);
            var row=new LinkedHashMap<String,Object>();row.put("ordinal",rows.size());
            row.put("comparison_complete",complete);row.put("match",complete?expected.equals(actual):null);
            row.put("full_scan_complete",full.get("scan_complete"));row.put("index_query_complete",indexed.get("index_query_complete"));
            row.put("full_scan_reason",full.get("reason"));row.put("index_query_reason",indexed.get("reason"));
            row.put("full_candidate_count",expected.size());row.put("index_candidate_count",actual.size());
            row.put("missing_count",complete?missing.size():null);row.put("unexpected_count",complete?unexpected.size():null);
            rows.add(row);
        }
        boolean complete=selectionComplete && rows.size()==samples.size() && !rows.isEmpty()
            && rows.stream().allMatch(row->Boolean.TRUE.equals(row.get("comparison_complete")));
        boolean mismatch=rows.stream().anyMatch(row->Boolean.FALSE.equals(row.get("match")));
        var result=new LinkedHashMap<String,Object>();result.put("scope","graph_derived_finite_geometry_probes_only");
        result.put("status",mismatch?"MISMATCH_OBSERVED":complete?"MATCHED_FINITE_PROBES":"UNVERIFIED");
        result.put("reason",reason);result.put("edge_limit",limit);result.put("sample_limit",sampleLimit);
        result.put("radius_m",1);result.put("edges_seen",edgesSeen);result.put("selection_complete",selectionComplete);
        result.put("probe_strategy","segment_tile_intersections_v1");result.put("grid_parts",gridParts);
        result.put("grid_resolution_m",resolution);result.put("segments_seen",segmentsSeen);
        result.put("endpoint_probes",kinds[0]);result.put("original_midpoint_probes",kinds[1]);
        result.put("grid_crossing_probes",kinds[2]);result.put("cell_interval_probes",kinds[3]);
        result.put("samples_selected",samples.size());result.put("comparisons_complete",complete);result.put("samples",rows);
        result.put("index_geometry_coverage","UNVERIFIED");result.put("construction_lineage","UNVERIFIED");
        result.put("physical_road_verification","UNVERIFIED");result.put("heading_verification","UNVERIFIED");
        result.put("navigation_allowed",false);result.put("route_absence_proven",false);return result;
    }

    static String inventoryDigest(BitSet bits) throws Exception {
        return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bits.toByteArray()));
    }
    static Map<String,Object> observeIndexInventory(GraphHopper hopper,int limit) throws Exception {
        require(limit>=1 && limit<=50_000_000,"invalid inventory edge limit");
        var expected=new BitSet();var indexed=new BitSet();
        int bound=hopper.getBaseGraph().getEdges();
        int[] counts=new int[4]; // examined graph edges, index callbacks, tiles, unique indexed IDs
        boolean graphComplete=false,queryComplete=false;String reason="edge_id_inventory_compared";
        long deadline=System.nanoTime()+20_000_000_000L;
        try {
            if(bound<0 || bound>50_000_000)throw new OriginObservationStop("graph_id_budget");
            var edges=hopper.getBaseGraph().getAllEdges();
            while(edges.next()) {
                if(System.nanoTime()>deadline)throw new OriginObservationStop("time_budget");
                if(counts[0]>=limit)throw new OriginObservationStop("graph_edge_budget");
                int id=edges.getEdge();
                if(id<0 || id>=bound || expected.get(id))throw new OriginObservationStop("invalid_graph_inventory");
                expected.set(id);counts[0]++;
            }
            graphComplete=true;
            hopper.getLocationIndex().query((com.graphhopper.storage.index.LocationIndex.TileFilter)null,
                new com.graphhopper.storage.index.LocationIndex.Visitor() {
                    void checkTime(){if(System.nanoTime()>deadline)throw new OriginObservationStop("time_budget");}
                    @Override public boolean isTileInfo(){return true;}
                    @Override public void onTile(com.graphhopper.util.shapes.BBox tile,int depth){
                        checkTime();if(++counts[2]>Math.min(50_000_000,limit*8+1024))throw new OriginObservationStop("tile_budget");
                    }
                    @Override public void onEdge(int id){
                        checkTime();if(++counts[1]>Math.min(250_000_000,limit*5+1024))throw new OriginObservationStop("callback_budget");
                        if(id<0 || id>=bound)throw new OriginObservationStop("invalid_index_edge");
                        if(!indexed.get(id)) {
                            if(counts[3]>=limit)throw new OriginObservationStop("index_edge_budget");
                            indexed.set(id);counts[3]++;
                        }
                    }
                });
            if(System.nanoTime()>deadline)throw new OriginObservationStop("time_budget");
            queryComplete=true;
        }catch(OriginObservationStop stop){reason=stop.reason;}
         catch(Exception error){reason="index_inventory_failure";}
        boolean complete=graphComplete && queryComplete;
        var missing=(BitSet)expected.clone();missing.andNot(indexed);
        var unexpected=(BitSet)indexed.clone();unexpected.andNot(expected);
        boolean match=expected.equals(indexed);
        var result=new LinkedHashMap<String,Object>();
        result.put("scope","edge_id_inventory_only");
        result.put("inventory_status",!complete?"UNVERIFIED":match?"MATCHED_EDGE_INVENTORY":"MISMATCHED_EDGE_INVENTORY");
        result.put("reason",reason);result.put("edge_limit",limit);result.put("edge_id_bound",bound);
        result.put("graph_edge_count",expected.cardinality());result.put("indexed_edge_count",indexed.cardinality());
        result.put("graph_enumeration_complete",graphComplete);result.put("index_query_complete",queryComplete);
        result.put("inventory_complete",complete);result.put("inventory_match",complete?match:null);
        result.put("missing_edge_count",complete?missing.cardinality():null);
        result.put("unexpected_edge_count",complete?unexpected.cardinality():null);
        result.put("graph_inventory_sha256",complete?inventoryDigest(expected):null);
        result.put("index_inventory_sha256",complete?inventoryDigest(indexed):null);
        result.put("index_callbacks",counts[1]);result.put("tiles_visited",counts[2]);
        result.put("index_geometry_coverage","UNVERIFIED");result.put("physical_road_verification","UNVERIFIED");
        result.put("heading_verification","UNVERIFIED");result.put("navigation_allowed",false);
        result.put("route_absence_proven",false);
        return result;
    }

    // Registered preview only: search complete journeys, never splice independent legs.
    // Budget exhaustion can return fewer validated routes; it proves no route count.
    static GHResponse wholeJourneyAlternatives(GraphHopper hopper,GHRequest request,
            Set<Integer> mandatory,boolean noMotorways,Map<String,Object> result) {
        ArrayDeque<Set<Integer>> pending=new ArrayDeque<>();pending.add(Set.copyOf(mandatory));
        Set<Set<Integer>> queued=new HashSet<>();queued.add(Set.copyOf(mandatory));
        Set<List<Integer>> seen=new HashSet<>();GHResponse combined=new GHResponse();
        long deadline=System.nanoTime()+20_000_000_000L;int calls=0;
        try {
            while(!pending.isEmpty() && calls<16 && combined.getAll().size()<3) {
                long remaining=(deadline-System.nanoTime())/1_000_000;
                if(remaining<=0)break;
                Set<Integer> exclusions=pending.remove();
                request.putHint(BLOCKS,exclusions).putHint("timeout_ms",remaining);
                GHResponse response=hopper.route(request);calls++;
                if(response.hasErrors()) {
                    boolean disconnected=response.getErrors().stream().allMatch(error ->
                        error instanceof com.graphhopper.util.exceptions.ConnectionNotFoundException);
                    if(calls>1 && disconnected)continue;
                    throw new IllegalStateException("whole-journey search provider error: "+response.getErrors());
                }
                require(response.getAll().size()==1,"whole-journey search must calculate one complete path");
                ResponsePath path=response.getBest();
                List<Integer> keys=validate(hopper,path,noMotorways,exclusions,
                    hopper.createWeighting(hopper.getProfile("car"),request.getHints()));
                if(!seen.add(keys))continue;
                combined.add(path);
                // Hard queue and request limits bound both memory and engine work.
                for(int key:keys) {
                    if(queued.size()>=64)break;
                    Set<Integer> next=new TreeSet<>(exclusions);next.add(key);
                    var immutable=Set.copyOf(next);
                    if(queued.add(immutable))pending.add(immutable);
                }
            }
        } finally {request.putHint(BLOCKS,Set.copyOf(mandatory)).putHint("timeout_ms",20000);}
        require(!combined.getAll().isEmpty(),"no validated complete journey within search budget");
        result.put("alternative_generation","bounded_whole_journey_exclusion");
        result.put("alternative_search",Map.of("calls",calls,"max_calls",16,"max_queued",64,
            "timeout_ms",20000,"exhaustive",false,"independent_legs",false));
        return combined;
    }

    static Map<String,Object> runCase(GraphHopper hopper,JsonNode test,Map<String,List<Integer>> associations) {
        String name=test.path("id").asText();
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("id",name);
        result.put("status","UNVERIFIED_OR_FAILED");
        try {
            Set<Integer> blocked=new TreeSet<>();
            if(test.has("blocked_associations")) {
                var references=test.get("blocked_associations");
                require(references.isArray() && !references.isEmpty() && references.size()<=10,"invalid blocked associations");
                for(var reference:references) {
                    require(reference.isTextual(),"invalid association reference");
                    for(int key:associated(associations,reference.asText())) {
                        blocked.add(key);
                        if(test.path("block_both_directions").asBoolean(false)) blocked.add(key^1);
                    }
                }
            }
            result.put("blocked_edge_keys",blocked);
            int nodeBudget=250000;
            if(test.has("max_visited_nodes")) {
                var value=test.get("max_visited_nodes");
                require(value.isIntegralNumber() && value.canConvertToInt(),"node budget must be an integer");
                nodeBudget=value.intValue();
            }
            require(nodeBudget>=1000 && nodeBudget<=1000000,"node budget outside 1000..1000000");
            result.put("max_visited_nodes",nodeBudget);
            result.put("timeout_ms",20000);
            double tolerance=75;
            if(test.has("max_snap_distance_m")) {
                require(test.get("max_snap_distance_m").isNumber(),"snap tolerance must be numeric");
                tolerance=test.get("max_snap_distance_m").doubleValue();
            }
            require(Double.isFinite(tolerance) && tolerance>=0.1 && tolerance<=75,"snap tolerance outside 0.1..75m");
            result.put("max_snap_distance_m",tolerance);
            Set<Integer> expectedWays=new TreeSet<>();
            if(test.has("expected_osm_way_ids")) {
                var values=test.get("expected_osm_way_ids");
                require(values.isArray() && !values.isEmpty() && values.size()<=10,"invalid expected OSM ways");
                for(var value:values) {
                    require(value.isIntegralNumber() && value.canConvertToInt() && value.intValue()>0,"invalid OSM way ID");
                    expectedWays.add(value.intValue());
                }
                require(hopper.getEncodingManager().hasEncodedValue("osm_way_id"),"OSM way evidence missing from graph");
            }
            JsonNode visits=test.path("points");
            int anchorStart=-1,anchorEnd=-1;
            if(test.has("anchors_from_association")) {
                var keys=associated(associations,test.get("anchors_from_association").asText());
                anchorStart=hopper.getBaseGraph().getEdgeIteratorStateForKey(keys.get(0)).getBaseNode();
                anchorEnd=hopper.getBaseGraph().getEdgeIteratorStateForKey(keys.get(keys.size()-1)).getAdjNode();
                if(test.path("reverse_anchors").asBoolean(false)) {int swap=anchorStart;anchorStart=anchorEnd;anchorEnd=swap;}
                var nodes=hopper.getBaseGraph().getNodeAccess();
                visits=Jackson.newObjectMapper().valueToTree(List.of(
                    List.of(nodes.getLat(anchorStart),nodes.getLon(anchorStart)),
                    List.of(nodes.getLat(anchorEnd),nodes.getLon(anchorEnd))));
                result.put("anchor_scope","original_graph_nodes_of_associated_edges");
            }
            require(visits.isArray() && visits.size()>=2 && visits.size()<=5,"invalid public fixture visits");
            GHRequest request=new GHRequest().setProfile("car").setPathDetails(
                test.path("include_path_data").asBoolean(false)
                    ? List.of("edge_key","max_speed",QUERY_TRACE):List.of("edge_key","max_speed"));
            for(var point:visits) {
                require(point.isArray() && point.size()==2 && point.get(0).isNumber()
                    && point.get(1).isNumber(),"invalid coordinate");
                request.addPoint(new com.graphhopper.util.shapes.GHPoint(point.get(0).asDouble(),point.get(1).asDouble()));
            }
            if(test.has("diagnose_origin")) result.put("origin_candidate_observation",
                observeOriginCandidates(hopper,visits.get(0),test.get("diagnose_origin")));
            request.putHint("ch.disable",true).putHint("lm.disable",true)
                .putHint("way_point_max_distance",0).putHint("max_visited_nodes",nodeBudget)
                .putHint("timeout_ms",20000);
            boolean alternatives=test.path("alternatives").asBoolean(false);
            boolean wholeAlternatives=test.path("whole_journey_alternatives").asBoolean(false);
            boolean noMotorways=test.path("no_motorways").asBoolean(false);
            result.put("no_motorways",noMotorways);
            result.put("alternatives",alternatives);
            if(wholeAlternatives)require(alternatives && visits.size()>2 && anchorStart<0,
                "whole-journey alternatives require unanchored ordered intermediate visits");
            if(alternatives && !wholeAlternatives) {
                require(visits.size()==2,"native alternatives support two points only");
                request.setAlgorithm("alternative_route").putHint("alternative_route.max_paths",3);
            }
            if(noMotorways) request.setCustomModel(new CustomModel()
                .addToPriority(If("road_class == MOTORWAY",MULTIPLY,"0")));
            if(visits.size()>2) request.putHint("pass_through",true);
            result.put("pass_through",visits.size()>2);
            if(anchorStart>=0 && !blocked.isEmpty()) {
                long baselineStart=System.nanoTime();
                var baseline=hopper.route(request);
                result.put("baseline_query_ms",(System.nanoTime()-baselineStart)/1e6);
                require(!baseline.hasErrors() && !baseline.getAll().isEmpty(),"anchor baseline unavailable");
                var keys=validate(hopper,baseline.getBest(),noMotorways,Set.of(),
                    hopper.createWeighting(hopper.getProfile("car"),request.getHints()));
                if(test.path("diagnose_anchors").asBoolean(false)) result.put("baseline_anchor_diagnostics",
                    anchorDiagnostic(hopper,request,baseline.getBest(),keys,anchorStart,anchorEnd,Set.of()));
                require(!Collections.disjoint(keys,blocked),"baseline does not exercise selected exclusion");
                result.put("baseline_exercises_exclusion",true);
            }
            request.putHint(BLOCKS,Set.copyOf(blocked));
            if(test.path("diagnose_exact_nodes").asBoolean(false)) {
                require(anchorStart>=0 && !noMotorways && !alternatives,"exact-node diagnostic requires plain anchored case");
                result.put("exact_node_diagnostic",exactNodeDiagnostic(hopper,request,anchorStart,anchorEnd,nodeBudget,blocked));
            }
            long start=System.nanoTime();
            GHResponse response;
            try {
                if(test.path("pin_exact_anchors").asBoolean(false)) {
                    require(anchorStart>=0 && !alternatives && visits.size()==2,"pinning requires two association-derived anchors");
                    result.put("endpoint_mode","request_scoped_exact_tower_nodes");
                    response=((ExclusionHopper)hopper).routeAnchored(request,anchorStart,anchorEnd);
                } else if(wholeAlternatives) response=wholeJourneyAlternatives(hopper,request,blocked,noMotorways,result);
                else response=hopper.route(request);
            }
            finally { result.put("query_ms",(System.nanoTime()-start)/1e6); }
            if(response.hasErrors()) {
                result.put("provider_error_types",response.getErrors().stream().map(e->e.getClass().getSimpleName()).toList());
                result.put("route_absence_proven",false);
            }
            require(!response.hasErrors(),"provider error: "+response.getErrors());
            require(!response.getAll().isEmpty() && response.getAll().size()<=(alternatives?3:1),"invalid candidate count");
            List<Map<String,Object>> candidates=new ArrayList<>(); Set<List<Integer>> seen=new HashSet<>();
            for(ResponsePath path:response.getAll()) {
                List<Integer> keys=validate(hopper,path,noMotorways,blocked,
                    hopper.createWeighting(hopper.getProfile("car"),request.getHints()));
                if(anchorStart>=0) {
                    if(test.path("diagnose_anchors").asBoolean(false)) result.put("anchor_diagnostics",
                        anchorDiagnostic(hopper,request,path,keys,anchorStart,anchorEnd,blocked));
                    require(hopper.getBaseGraph().getEdgeIteratorStateForKey(keys.get(0)).getBaseNode()==anchorStart
                        && hopper.getBaseGraph().getEdgeIteratorStateForKey(keys.get(keys.size()-1)).getAdjNode()==anchorEnd,
                        "ambiguous or displaced graph-node anchor");
                }
                if(test.has("required_association")) require(keys.containsAll(associated(associations,
                    test.get("required_association").asText())),"directional control did not retain its associated traversal");
                require(seen.add(keys),"duplicate alternative");
                var geometry=path.getPoints();
                var first=visits.get(0);var last=visits.get(visits.size()-1);
                require(DistanceCalcEarth.DIST_EARTH.calcDist(first.get(0).asDouble(),first.get(1).asDouble(),
                    geometry.getLat(0),geometry.getLon(0))<=tolerance,"origin snap exceeds tolerance");
                require(DistanceCalcEarth.DIST_EARTH.calcDist(last.get(0).asDouble(),last.get(1).asDouble(),
                    geometry.getLat(geometry.size()-1),geometry.getLon(geometry.size()-1))<=tolerance,"destination snap exceeds tolerance");
                // Verify every requested visit appears in order, including intermediate visits.
                int cursor=0;
                for(var visit:visits) {
                    boolean found=false;
                    for(;cursor<path.getPoints().size();cursor++) {
                        double distance=DistanceCalcEarth.DIST_EARTH.calcDist(visit.get(0).asDouble(),
                            visit.get(1).asDouble(),path.getPoints().getLat(cursor),path.getPoints().getLon(cursor));
                        if(distance<=tolerance) { found=true;break; }
                    }
                    require(found,"requested visit missing or reordered within tolerance");
                }
                Map<String,Object> candidate=new LinkedHashMap<>(Map.of("distance_km",path.getDistance()/1000,
                    "duration_minutes",path.getTime()/60000.0,"directed_edges",keys.size(),
                    "instructions",path.getInstructions().size()));
                if(test.path("include_path_data").asBoolean(false)) {
                    List<List<Double>> coordinates=new ArrayList<>();
                    for(int i=0;i<geometry.size();i++) coordinates.add(List.of(geometry.getLon(i),geometry.getLat(i)));
                    candidate.put("geometry",Map.of("type","LineString","coordinates",coordinates));
                    candidate.put("directed_edge_keys",keys);
                    List<List<Object>> intervals=new ArrayList<>();
                    for(var detail:path.getPathDetails().get("edge_key"))
                        intervals.add(List.of(detail.getFirst(),detail.getLast(),detail.getValue()));
                    candidate.put("edge_intervals",intervals);
                    var actual=path.getPathDetails().get(QUERY_TRACE);
                    require(actual!=null && !actual.isEmpty(),"actual query traversal missing");
                    candidate.put("query_graph_intervals",actual.stream().map(detail->Map.of(
                        "first",detail.getFirst(),"last",detail.getLast(),"traversal",detail.getValue())).toList());
                    List<Map<String,Object>> instructions=new ArrayList<>();
                    JsonNode serialized=Jackson.newObjectMapper().valueToTree(path.getInstructions());
                    require(serialized.isArray() && serialized.size()==path.getInstructions().size(),"instruction serializer contract");
                    int instructionIndex=0;
                    for(var instruction:path.getInstructions()) {
                        var wire=serialized.get(instructionIndex++);
                        instructions.add(Map.of("name",instruction.getName(),"sign",instruction.getSign(),
                            "distance_m",instruction.getDistance(),"time_ms",instruction.getTime(),
                            "text",wire.path("text").asText(),"interval",wire.path("interval")));
                    }
                    var visitIndices=path.getWaypointIndices();
                    require(visitIndices!=null && visitIndices.size()==visits.size()
                        && visitIndices.get(0)==0 && visitIndices.get(visitIndices.size()-1)==geometry.size()-1,
                        "waypoint interval coverage");
                    int previousVisit=-1;
                    for(int i=0;i<visitIndices.size();i++) {
                        int at=visitIndices.get(i);
                        require(at>=previousVisit && at>=0 && at<geometry.size(),"waypoint interval order");
                        require(DistanceCalcEarth.DIST_EARTH.calcDist(visits.get(i).get(0).asDouble(),
                            visits.get(i).get(1).asDouble(),geometry.getLat(at),geometry.getLon(at))<=tolerance,
                            "waypoint interval does not match requested visit");
                        previousVisit=at;
                    }
                    candidate.put("waypoint_indices",visitIndices);
                    candidate.put("instruction_details",instructions);
                }
                if(!expectedWays.isEmpty()) {
                    Set<Integer> actualWays=new TreeSet<>();
                    var wayId=hopper.getEncodingManager().getIntEncodedValue("osm_way_id");
                    for(int key:keys) actualWays.add(hopper.getBaseGraph().getEdgeIteratorStateForKey(key).get(wayId));
                    require(expectedWays.containsAll(actualWays),"OSM way association mismatch");
                    require(!test.path("require_all_expected_ways").asBoolean(false)
                        || actualWays.equals(expectedWays),"expected OSM way missing from traversal");
                    candidate.put("matched_osm_way_ids",actualWays);
                    candidate.put("directed_edge_keys",keys);
                    candidate.put("edge_key_scope","current_loaded_graph_only");
                }
                if(!blocked.isEmpty()) {
                    candidate.put("directed_edge_keys",keys);
                    candidate.put("forbidden_traversals",0);
                }
                candidates.add(candidate);
            }
            result.put("status","PASS_AVAILABLE_GRAPH_CHECKS");
            result.put("requested_points",visits.size());
            result.put("candidates",candidates);
        } catch(Exception error) {
            result.put("reason",String.valueOf(error.getMessage()));
        }
        return result;
    }

    public static void main(String[] args) throws Exception {
        require(args.length==3,"expected config, existing graph and fixture JSON");
        var root=new ObjectMapper(new YAMLFactory()).readTree(new File(args[0]));
        var config=Jackson.newObjectMapper().treeToValue(root.get("graphhopper"),GraphHopperConfig.class);
        config.putObject("graph.location",args[1]).putObject("graph.dataaccess.default_type","MMAP")
            .putObject("datareader.file","");
        var fixture=Jackson.newObjectMapper().readTree(new File(args[2]));
        var tests=fixture.path("cases");
        boolean inventoryOnly=fixture.has("audit_index_inventory");
        boolean geometryOnly=fixture.has("audit_index_geometry");
        if(geometryOnly) {
            require(fixture.isObject() && fixture.size()==2 && tests.isArray() && tests.isEmpty(),"geometry audit must be separate from routing");
            var options=fixture.get("audit_index_geometry");
            require(options.isObject() && options.size()==2,"invalid geometry audit options");
            for(String key:List.of("edge_limit","sample_limit")) require(options.has(key) && options.get(key).isIntegralNumber()
                && options.get(key).canConvertToInt(),"invalid geometry audit limit");
        } else if(inventoryOnly) {
            require(fixture.isObject() && fixture.size()==2 && tests.isArray() && tests.isEmpty(),"inventory audit must be separate from routing");
            var options=fixture.get("audit_index_inventory");
            require(options.isObject() && options.size()==1 && options.has("edge_limit")
                && options.get("edge_limit").isIntegralNumber() && options.get("edge_limit").canConvertToInt(),"invalid inventory audit options");
        } else require(tests.isArray() && tests.size()>0 && tests.size()<=10,"fixture count limit");
        if(fixture.has("associations")) require(config.getCHProfiles().isEmpty() && config.getLMProfiles().isEmpty(),
            "directed exclusions require unaccelerated prototype configuration");
        GraphHopper hopper=new ExclusionHopper();
        try {
            hopper.init(config).setAllowWrites(false);
            long start=System.nanoTime();
            require(hopper.load(),"existing graph unavailable; import forbidden");
            double loadMs=(System.nanoTime()-start)/1e6;
            if(geometryOnly) {
                var options=fixture.get("audit_index_geometry");
                var observation=observeIndexGeometry(hopper,options.get("edge_limit").intValue(),options.get("sample_limit").intValue());
                System.out.println("VOYAGR_GH11_REGRESSION "+new ObjectMapper().writeValueAsString(Map.of(
                    "engine_version",Constants.VERSION,"java_runtime",System.getProperty("java.version"),"audit_only",true,
                    "index_geometry_observation",observation,"navigation_allowed",false,"production_migration","NO_GO")));
                return;
            }
            if(inventoryOnly) {
                var observation=observeIndexInventory(hopper,fixture.get("audit_index_inventory").get("edge_limit").intValue());
                System.out.println("VOYAGR_GH11_REGRESSION "+new ObjectMapper().writeValueAsString(Map.of(
                    "engine_version",Constants.VERSION,"java_runtime",System.getProperty("java.version"),"audit_only",true,"index_inventory_observation",observation,
                    "navigation_allowed",false,"production_migration","NO_GO")));
                return;
            }
            ((ExclusionHopper)hopper).installAnchorIndex();
            Map<String,List<Integer>> associations=new LinkedHashMap<>();
            List<Map<String,Object>> evidence=new ArrayList<>();
            if(fixture.has("associations")) {
                var sources=fixture.get("associations");
                require(sources.isArray() && sources.size()>0 && sources.size()<=10,"association count limit");
                for(var source:sources) {
                    require(source.has("expected_osm_way_ids") && source.path("max_snap_distance_m").asDouble(75)<=1
                        && !source.has("blocked_associations"),"association evidence must use source ways and <=1m tolerance");
                    var row=runCase(hopper,source,Map.of());evidence.add(row);
                    require(row.get("status").equals("PASS_AVAILABLE_GRAPH_CHECKS"),"association baseline unverified: "+row);
                    String id=source.path("id").asText();
                    require(!id.isEmpty() && !associations.containsKey(id),"duplicate or empty association ID");
                    associations.put(id,evidenceKeys(row));
                }
            }
            List<Map<String,Object>> results=new ArrayList<>();
            for(var test:tests) results.add(runCase(hopper,test,associations));
            boolean allPassed=results.stream().allMatch(row->row.get("status").equals("PASS_AVAILABLE_GRAPH_CHECKS"));
            System.out.println("VOYAGR_GH11_REGRESSION "+Jackson.newObjectMapper().writeValueAsString(Map.of(
                "engine_version",Constants.VERSION,"java_runtime",System.getProperty("java.version"),
                "nodes",hopper.getBaseGraph().getNodes(),"edges",hopper.getBaseGraph().getEdges(),
                "graph_load_ms",loadMs,"associations",evidence,"cases",results,
                "all_available_graph_checks_passed",allPassed,"production_migration","NO_GO",
                "unverified",List.of("general camera and crossing association","hazard coverage and freshness","application exclusion integration",
                    "general turn and multi-stop correctness","phone behavior","capacity under concurrency"))));
            if(!allPassed) throw new IllegalStateException("Some bounded checks failed or remain unverified; see report");
        } finally { hopper.close(); }
    }

    @SuppressWarnings("unchecked")
    static List<Integer> evidenceKeys(Map<String,Object> row) {
        var candidates=(List<Map<String,Object>>)row.get("candidates");
        require(candidates.size()==1,"association must have exactly one source traversal");
        var keys=(List<Integer>)candidates.get(0).get("directed_edge_keys");
        require(keys!=null && !keys.isEmpty(),"association directed evidence missing");
        return List.copyOf(keys);
    }
}
