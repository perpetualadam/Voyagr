import com.graphhopper.*;
import com.graphhopper.jackson.Jackson;
import com.graphhopper.routing.ev.*;
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
    static void require(boolean ok,String reason) {
        if(!ok) throw new IllegalStateException(reason);
    }

    static List<Integer> validate(GraphHopper hopper,ResponsePath path,boolean noMotorways) {
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

    static Map<String,Object> runCase(GraphHopper hopper,JsonNode test) {
        String name=test.path("id").asText();
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("id",name);
        result.put("status","UNVERIFIED_OR_FAILED");
        try {
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
            var visits=test.path("points");
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
            long start=System.nanoTime();
            GHResponse response;
            try { response=hopper.route(request); }
            finally { result.put("query_ms",(System.nanoTime()-start)/1e6); }
            require(!response.hasErrors(),"provider error: "+response.getErrors());
            require(!response.getAll().isEmpty() && response.getAll().size()<=(alternatives?3:1),"invalid candidate count");
            List<Map<String,Object>> candidates=new ArrayList<>(); Set<List<Integer>> seen=new HashSet<>();
            for(ResponsePath path:response.getAll()) {
                List<Integer> keys=validate(hopper,path,noMotorways);
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
        var tests=Jackson.newObjectMapper().readTree(new File(args[2])).path("cases");
        require(tests.isArray() && tests.size()>0 && tests.size()<=10,"fixture count limit");
        GraphHopper hopper=new GraphHopper();
        try {
            hopper.init(config).setAllowWrites(false);
            long start=System.nanoTime();
            require(hopper.load(),"existing graph unavailable; import forbidden");
            double loadMs=(System.nanoTime()-start)/1e6;
            List<Map<String,Object>> results=new ArrayList<>();
            for(var test:tests) results.add(runCase(hopper,test));
            boolean allPassed=results.stream().allMatch(row->row.get("status").equals("PASS_AVAILABLE_GRAPH_CHECKS"));
            System.out.println("VOYAGR_GH11_REGRESSION "+Jackson.newObjectMapper().writeValueAsString(Map.of(
                "engine_version",Constants.VERSION,"java_runtime",System.getProperty("java.version"),
                "nodes",hopper.getBaseGraph().getNodes(),"edges",hopper.getBaseGraph().getEdges(),
                "graph_load_ms",loadMs,"cases",results,
                "all_available_graph_checks_passed",allPassed,"production_migration","NO_GO",
                "unverified",List.of("camera and crossing association","hazard coverage and freshness",
                    "general turn and multi-stop correctness","phone behavior","capacity under concurrency"))));
            if(!allPassed) throw new IllegalStateException("Some bounded checks failed or remain unverified; see report");
        } finally { hopper.close(); }
    }
}
