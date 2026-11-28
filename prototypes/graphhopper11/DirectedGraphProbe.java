import com.graphhopper.*;
import com.graphhopper.config.Profile;
import com.graphhopper.jackson.Jackson;
import com.graphhopper.routing.WeightingFactory;
import com.graphhopper.routing.querygraph.VirtualEdgeIteratorState;
import com.graphhopper.routing.weighting.AbstractAdjustedWeighting;
import com.graphhopper.routing.weighting.Weighting;
import com.graphhopper.util.*;
import com.graphhopper.util.details.PathDetail;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Local synthetic experiment only. No HTTP listener, production graph or external data. */
public class DirectedGraphProbe {
    static final String BLOCKS = "voyagr_blocked_keys";

    static class IsolatedHopper extends GraphHopper {
        @Override protected WeightingFactory createWeightingFactory() {
            WeightingFactory original = super.createWeightingFactory();
            return (profile, hints, disableTurns) -> {
                Weighting delegate = original.createWeighting(profile, hints, disableTurns);
                Set<Integer> blocked = Set.copyOf(hints.getObject(BLOCKS, Set.<Integer>of()));
                return new AbstractAdjustedWeighting(delegate) {
                    @Override public double calcEdgeWeight(EdgeIteratorState edge, boolean reverse) {
                        // QueryGraph can pass a VirtualEdgeIterator wrapper, not the state itself.
                        EdgeIteratorState state=edge.detach(false);
                        int key = state instanceof VirtualEdgeIteratorState
                            ? ((VirtualEdgeIteratorState) state).getOriginalEdgeKey() : state.getEdgeKey();
                        if (reverse) key ^= 1;
                        return blocked.contains(key) ? Double.POSITIVE_INFINITY
                            : super.calcEdgeWeight(edge, reverse);
                    }
                    @Override public String getName() { return delegate.getName(); }
                };
            };
        }
    }

    static GHRequest request(double fromLon, double toLon, Set<Integer> blocked, boolean alternatives) {
        return configure(new GHRequest(0, fromLon, 0, toLon),blocked,alternatives);
    }

    static GHRequest configure(GHRequest request, Set<Integer> blocked, boolean alternatives) {
        GHRequest req = request.setProfile("car")
            .setPathDetails(List.of("edge_key", "max_speed", "road_class"));
        req.putHint("ch.disable", true).putHint("lm.disable", true)
            .putHint("way_point_max_distance", 0).putHint(BLOCKS, Set.copyOf(blocked));
        if (alternatives) req.setAlgorithm("alternative_route")
            .putHint("alternative_route.max_paths", 3)
            .putHint("alternative_route.max_weight_factor", 4)
            .putHint("alternative_route.max_share_factor", 0.95);
        return req;
    }

    static GraphHopper importFixture(Path osm, Path graph) {
        require(!Files.exists(graph),"refusing existing graph");
        GraphHopper hopper=new IsolatedHopper();
        try {
            hopper.setOSMFile(osm.toString()).setGraphHopperLocation(graph.toString());
            hopper.setMinNetworkSize(0);
            hopper.setEncodedValuesString("car_access,car_average_speed,road_access,max_speed,road_class");
            hopper.setProfiles(new Profile("car").setCustomModel(GHUtility.loadCustomModelFromJar("car.json"))
                .setTurnCostsConfig(new TurnCostsConfig(List.of("motorcar","motor_vehicle"))));
            hopper.importOrLoad();
            return hopper;
        } catch(RuntimeException error) { hopper.close(); throw error; }
    }

    static Map<String,Object> turnFixture(Path root) throws Exception {
        Path osm=root.resolve("synthetic-turn.osm");
        Files.writeString(osm,"""
            <osm version="0.6" generator="Voyagr synthetic turn fixture">
              <node id="1" lat="0" lon="-0.01"/>
              <node id="2" lat="0" lon="0"/>
              <node id="3" lat="0.01" lon="0"/>
              <node id="4" lat="0" lon="0.01"/>
              <node id="5" lat="0.01" lon="0.01"/>
              <way id="100"><nd ref="1"/><nd ref="2"/>
                <tag k="highway" v="residential"/><tag k="name" v="approach"/></way>
              <way id="101"><nd ref="2"/><nd ref="3"/>
                <tag k="highway" v="residential"/><tag k="name" v="restricted_exit"/></way>
              <way id="102"><nd ref="2"/><nd ref="4"/><nd ref="5"/><nd ref="3"/>
                <tag k="highway" v="residential"/><tag k="name" v="legal_detour"/></way>
              <relation id="200">
                <member type="way" ref="100" role="from"/>
                <member type="node" ref="2" role="via"/>
                <member type="way" ref="101" role="to"/>
                <tag k="type" v="restriction"/><tag k="restriction" v="no_left_turn"/>
              </relation>
            </osm>
            """,StandardOpenOption.CREATE_NEW);
        GraphHopper hopper=importFixture(osm,root.resolve("synthetic-turn-graph"));
        try {
            var first=paths(hopper.route(configure(new GHRequest(0,-.01,0,0),Set.of(),false)),Set.of());
            var second=paths(hopper.route(configure(new GHRequest(0,0,.01,0),Set.of(),false)),Set.of());
            require(first.size()==1 && second.size()==1,"both independent legs must exist");
            int incoming=lastKey(first.get(0)), outgoing=firstKey(second.get(0));
            var in=hopper.getBaseGraph().getEdgeIteratorStateForKey(incoming);
            var out=hopper.getBaseGraph().getEdgeIteratorStateForKey(outgoing);
            require(in.getAdjNode()==out.getBaseNode(),"fixture edges must share via node");
            var turn=hopper.getEncodingManager().getTurnBooleanEncodedValue(
                com.graphhopper.routing.ev.TurnRestriction.key("car"));
            require(hopper.getBaseGraph().getTurnCostStorage().get(turn,incoming/2,in.getAdjNode(),outgoing/2),
                "OSM relation must be present in imported turn storage");
            var complete=paths(hopper.route(configure(new GHRequest(0,-.01,.01,0),Set.of(),false)),Set.of());
            require(complete.size()==1,"complete route must use legal detour");
            var reverse=paths(hopper.route(configure(new GHRequest(.01,0,0,-.01),Set.of(),false)),Set.of());
            require(reverse.size()==1,"opposite turn direction must remain usable");
            Set<Integer> continuationExclusions=Set.of(outgoing);
            var repaired=paths(hopper.route(configure(new GHRequest(0,0,.01,0),continuationExclusions,false)),continuationExclusions);
            require(repaired.size()==1,"fixture continuation detour must exist");
            return Map.of("forbidden_turn_pairs",List.of(List.of(incoming,outgoing)),
                "complete",complete,"reverse",reverse,"first_leg",first,"independent_second_leg",second,
                "continuation_second_leg",repaired,
                "visits",List.of(List.of(-.01,0),List.of(0,0),List.of(0,.01)));
        } finally { hopper.close(); }
    }

    @SuppressWarnings("unchecked")
    static List<List<Object>> trace(Map<String,Object> path) {
        return ((Map<String,List<List<Object>>>)path.get("details")).get("edge_key");
    }
    static int firstKey(Map<String,Object> path) { return ((Number)trace(path).get(0).get(2)).intValue(); }
    static int lastKey(Map<String,Object> path) {
        var trace=trace(path);return ((Number)trace.get(trace.size()-1).get(2)).intValue();
    }

    static List<Map<String,Object>> paths(GHResponse response, Set<Integer> blocked) {
        if (response.hasErrors()) {
            for(Throwable error:response.getErrors())
                if(!error.getClass().getName().equals("com.graphhopper.util.exceptions.ConnectionNotFoundException"))
                    throw new IllegalStateException("unexpected routing error",error);
            return List.of();
        }
        List<Map<String,Object>> paths = new ArrayList<>();
        for (ResponsePath path : response.getAll()) {
            List<PathDetail> trace = path.getPathDetails().get("edge_key");
            if (trace == null || trace.isEmpty()) throw new IllegalStateException("missing directed trace");
            for (PathDetail d : trace)
                if (blocked.contains(((Number)d.getValue()).intValue()))
                    throw new IllegalStateException("forbidden directed edge returned");
            List<List<Double>> coords = new ArrayList<>();
            for (int i=0;i<path.getPoints().size();i++)
                coords.add(List.of(path.getPoints().getLon(i),path.getPoints().getLat(i)));
            List<List<Object>> details = new ArrayList<>();
            for (PathDetail d : trace) details.add(List.of(d.getFirst(),d.getLast(),d.getValue()));
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("distance",path.getDistance()); row.put("time",path.getTime());
            row.put("points",Map.of("type","LineString","coordinates",coords));
            row.put("points_encoded",false); row.put("details",Map.of("edge_key",details));
            row.put("instruction_count",path.getInstructions().size()); paths.add(row);
        }
        return paths;
    }

    static void require(boolean value, String message) {
        if (!value) throw new IllegalStateException(message);
    }

    // Bounded exclusion search supplements GH's heuristic alternatives. Not a k-shortest proof.
    @SuppressWarnings("unchecked")
    static List<Map<String,Object>> candidates(GraphHopper hopper, Set<Integer> mandatory) {
        ArrayDeque<Set<Integer>> queue=new ArrayDeque<>(); queue.add(Set.copyOf(mandatory));
        Set<Set<Integer>> visited=new HashSet<>(); Set<String> seen=new HashSet<>();
        List<Map<String,Object>> result=new ArrayList<>();
        int calls=0;
        while(!queue.isEmpty() && result.size()<3 && calls<32) {
            Set<Integer> exclusions=queue.remove(); if(!visited.add(exclusions)) continue;
            calls++;
            for(Map<String,Object> path:paths(hopper.route(request(0,.02,exclusions,true)),exclusions)) {
                var details=(Map<String,List<List<Object>>>)path.get("details");
                List<List<Object>> trace=details.get("edge_key");
                String identity=trace.stream().map(d->d.get(2).toString()).toList().toString();
                if(seen.add(identity) && result.size()<3) result.add(path);
                for(List<Object> edge:trace) {
                    Set<Integer> next=new HashSet<>(exclusions);next.add(((Number)edge.get(2)).intValue());
                    if(!visited.contains(next)) queue.add(Set.copyOf(next));
                }
            }
        }
        require(calls<32 || queue.isEmpty() || result.size()==3,"candidate search budget exhausted");
        return result;
    }

    public static void main(String[] args) throws Exception {
        require(args.length==1,"temporary work directory required");
        Path root=Path.of(args[0]);
        Path graph=root.resolve("synthetic-graph");
        require(!Files.exists(graph),"refusing existing graph");
        Path osm=root.resolve("synthetic.osm");
        StringBuilder xml=new StringBuilder("<osm version='0.6' generator='Voyagr synthetic fixture'>");
        xml.append("<node id='1' lat='0' lon='0'/><node id='2' lat='0' lon='0.02'/>");
        double[] bends={0,0.003,-0.003};
        String[] names={"central","north","south"};
        for(int i=0;i<3;i++) xml.append("<node id='"+(i+3)+"' lat='"+bends[i]+"' lon='0.01'/>");
        for(int i=0;i<3;i++) xml.append("<way id='"+(i+10)+"'><nd ref='1'/><nd ref='"+(i+3)+"'/><nd ref='2'/>"
            +"<tag k='highway' v='residential'/><tag k='maxspeed' v='30 mph'/><tag k='name' v='"+names[i]+"'/></way>");
        xml.append("</osm>"); Files.writeString(osm,xml,StandardOpenOption.CREATE_NEW);
        GraphHopper hopper=importFixture(osm,graph);
        try {
            Map<String,Set<Integer>> forwards=new TreeMap<>(); Set<Integer> all=new HashSet<>();
            var edges=hopper.getBaseGraph().getAllEdges();
            while(edges.next()) {
                int key=edges.getEdgeKey();
                if(hopper.getBaseGraph().getNodeAccess().getLon(edges.getBaseNode())>0.01) key^=1;
                forwards.computeIfAbsent(edges.getName(),k->new HashSet<>()).add(key); all.add(key);
            }
            require(forwards.size()==3,"fixture must retain three named corridors");
            Map<String,Object> cases=new LinkedHashMap<>();
            Set<Integer> blocked=new HashSet<>();
            List<String> order=List.of("central","north","south");
            for(int remaining=3;remaining>=0;remaining--) {
                List<Map<String,Object>> result=candidates(hopper,blocked);
                require(result.size()==remaining,"expected "+remaining+" alternatives, got "+result.size());
                cases.put("alternatives_"+remaining,Map.of("paths",result,"blocked_keys",List.copyOf(blocked)));
                if(remaining>0) blocked.addAll(forwards.get(order.get(3-remaining)));
            }
            List<Map<String,Object>> reverse=paths(hopper.route(request(.02,0,all,false)),all);
            require(reverse.size()==1,"opposite direction must remain routable");
            cases.put("opposite_direction",Map.of("paths",reverse,"blocked_keys",List.copyOf(all)));
            Set<Integer> central=forwards.get("central");
            List<Map<String,Object>> virtual=paths(hopper.route(request(.002,.018,central,false)),central);
            // A forbidden origin may refuse or snap elsewhere; the adapter must check endpoint gaps.
            cases.put("virtual_endpoints",Map.of("paths",virtual,"blocked_keys",List.copyOf(central)));
            List<Map<String,Object>> virtualReverse=paths(hopper.route(request(.018,.002,all,false)),all);
            require(virtualReverse.size()==1,"virtual opposite direction must remain routable");
            cases.put("virtual_reverse",Map.of("paths",virtualReverse,"blocked_keys",List.copyOf(all)));
            List<Map<String,Object>> virtualBlocked=paths(hopper.route(request(.002,.018,all,false)),all);
            require(virtualBlocked.isEmpty(),"virtual endpoints cannot bypass all forward exclusions");
            cases.put("virtual_all_blocked",Map.of("paths",virtualBlocked,"blocked_keys",List.copyOf(all)));
            List<Map<String,Object>> clean=paths(hopper.route(request(0,.02,Set.of(),false)),Set.of());
            require(clean.size()==1,"restricted request must not mutate later requests");
            cases.put("isolation",Map.of("paths",clean,"blocked_keys",List.of()));
            ExecutorService pool=Executors.newFixedThreadPool(2);
            try {
                List<Future<Boolean>> checks=new ArrayList<>();
                for(int i=0;i<12;i++) {
                    boolean restricted=i%2==0;
                    checks.add(pool.submit(()-> {
                        Set<Integer> keys=restricted?Set.copyOf(all):Set.of();
                        return paths(hopper.route(request(0,.02,keys,false)),keys).size()==(restricted?0:1);
                    }));
                }
                for(Future<Boolean> check:checks) require(check.get(10,TimeUnit.SECONDS),"concurrent request leaked restrictions");
            } finally { pool.shutdownNow(); }
            System.out.println("VOYAGR_GH11_RESULT "+Jackson.newObjectMapper().writeValueAsString(
                Map.of("engine_version",Constants.VERSION,"java_runtime",System.getProperty("java.version"),
                    "cases",cases,"concurrent_checks",12,"turn_fixture",turnFixture(root),
                    "scope","synthetic_flexible_only")));
        } finally { hopper.close(); }
    }
}
