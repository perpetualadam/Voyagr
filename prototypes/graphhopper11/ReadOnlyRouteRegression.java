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
    static class ExclusionHopper extends GraphHopper {
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

    static List<Integer> validate(GraphHopper hopper,ResponsePath path,boolean noMotorways,Set<Integer> blocked) {
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
            GHRequest request=new GHRequest().setProfile("car").setPathDetails(List.of("edge_key","max_speed"));
            for(var point:visits) {
                require(point.isArray() && point.size()==2 && point.get(0).isNumber()
                    && point.get(1).isNumber(),"invalid coordinate");
                request.addPoint(new com.graphhopper.util.shapes.GHPoint(point.get(0).asDouble(),point.get(1).asDouble()));
            }
            request.putHint("ch.disable",true).putHint("lm.disable",true)
                .putHint("way_point_max_distance",0).putHint("max_visited_nodes",nodeBudget)
                .putHint("timeout_ms",20000);
            boolean alternatives=test.path("alternatives").asBoolean(false);
            boolean noMotorways=test.path("no_motorways").asBoolean(false);
            result.put("no_motorways",noMotorways);
            result.put("alternatives",alternatives);
            if(alternatives) {
                require(visits.size()==2,"native alternatives support two points only");
                request.setAlgorithm("alternative_route").putHint("alternative_route.max_paths",3);
            }
            if(noMotorways) request.setCustomModel(new CustomModel()
                .addToPriority(If("road_class == MOTORWAY",MULTIPLY,"0")));
            if(visits.size()>2) request.putHint("pass_through",true);
            if(anchorStart>=0 && !blocked.isEmpty()) {
                long baselineStart=System.nanoTime();
                var baseline=hopper.route(request);
                result.put("baseline_query_ms",(System.nanoTime()-baselineStart)/1e6);
                require(!baseline.hasErrors() && !baseline.getAll().isEmpty(),"anchor baseline unavailable");
                var keys=validate(hopper,baseline.getBest(),noMotorways,Set.of());
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
                } else response=hopper.route(request);
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
                List<Integer> keys=validate(hopper,path,noMotorways,blocked);
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
                    List<Map<String,Object>> instructions=new ArrayList<>();
                    for(var instruction:path.getInstructions()) instructions.add(Map.of(
                        "name",instruction.getName(),"sign",instruction.getSign(),
                        "distance_m",instruction.getDistance(),"time_ms",instruction.getTime()));
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
        require(tests.isArray() && tests.size()>0 && tests.size()<=10,"fixture count limit");
        if(fixture.has("associations")) require(config.getCHProfiles().isEmpty() && config.getLMProfiles().isEmpty(),
            "directed exclusions require unaccelerated prototype configuration");
        GraphHopper hopper=new ExclusionHopper();
        try {
            hopper.init(config).setAllowWrites(false);
            long start=System.nanoTime();
            require(hopper.load(),"existing graph unavailable; import forbidden");
            double loadMs=(System.nanoTime()-start)/1e6;
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
