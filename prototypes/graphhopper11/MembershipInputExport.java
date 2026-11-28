import com.graphhopper.*;
import com.graphhopper.jackson.Jackson;
import com.graphhopper.storage.index.*;
import com.graphhopper.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.File;
import java.util.*;

// Geometry/metadata export only. Never calls index queries, routing or import.
public class MembershipInputExport {
 public static void main(String[] args)throws Exception {
  if(args.length!=2)throw new IllegalArgumentException("expected config and graph");
  var root=new ObjectMapper(new YAMLFactory()).readTree(new File(args[0]));
  var config=Jackson.newObjectMapper().treeToValue(root.get("graphhopper"),GraphHopperConfig.class);
  config.putObject("graph.location",args[1]).putObject("graph.dataaccess.default_type","MMAP").putObject("datareader.file","");
  var hopper=new GraphHopper();
  try {
   hopper.init(config).setAllowWrites(false);
   if(!hopper.load() || !(hopper.getLocationIndex() instanceof LocationIndexTree tree))
    throw new IllegalStateException("existing tree graph required");
   var graph=hopper.getBaseGraph();
   var grid=IndexStructureInfo.create(graph.getBounds(),tree.getMinResolutionInMeter());
   var bounds=grid.getBounds();var edges=new ArrayList<Object>();int vertices=0;
   var iterator=graph.getAllEdges();
   while(iterator.next()) {
    if(edges.size()>=1000)throw new IllegalStateException("edge budget");
    var shape=iterator.fetchWayGeometry(FetchMode.ALL);vertices+=shape.size();
    if(vertices>10000 || shape.size()<2)throw new IllegalStateException("geometry budget");
    var points=new ArrayList<Object>();
    for(int i=0;i<shape.size();i++)points.add(List.of(Double.toString(shape.getLon(i)),Double.toString(shape.getLat(i))));
    edges.add(Map.of("id",iterator.getEdge(),"points",points));
   }
   var result=new LinkedHashMap<String,Object>();result.put("engine_version",Constants.VERSION);
   result.put("java_runtime",System.getProperty("java.version"));result.put("index_version",Constants.VERSION_LOCATION_IDX);
   result.put("bounds",List.of(Double.toString(bounds.minLon),Double.toString(bounds.maxLon),Double.toString(bounds.minLat),Double.toString(bounds.maxLat)));
   result.put("entries",grid.getEntries());result.put("resolution_m",tree.getMinResolutionInMeter());
   result.put("checksum",graph.getNodes() ^ graph.getAllEdges().length());result.put("edge_id_bound",graph.getEdges());
   result.put("edges",edges);
   System.out.println("VOYAGR_GH11_MEMBERSHIP_INPUT "+new ObjectMapper().writeValueAsString(result));
  }finally{hopper.close();}
 }
}
