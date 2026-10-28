import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import com.graphhopper.jackson.Jackson;
import com.graphhopper.util.CustomModel;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.operation.valid.IsValidOp;
import org.locationtech.jts.index.strtree.STRtree;
// Offline only. Outputs aggregate topology categories, never coordinates or raw exceptions.
public class AuditCameraAreas {
    public static void main(String[] args) throws Exception {
        try {
            Path input=Path.of(args[0]);
            if(Files.size(input)>16*1024*1024)throw new IllegalArgumentException();
            byte[] bytes;
            try(var stream=Files.newInputStream(input)){bytes=stream.readNBytes(16*1024*1024+1);}
            if(bytes.length>16*1024*1024)throw new IllegalArgumentException();
            String raw=new String(bytes,java.nio.charset.StandardCharsets.UTF_8);
            CustomModel model=Jackson.newObjectMapper().readValue("{\"areas\":"+raw+"}",CustomModel.class);
            if(model.getAreas().getFeatures().isEmpty())throw new IllegalArgumentException();
            int invalid=0, components=0, invalidParts=0, duplicates=0, overlapAreas=0, overlapPairs=0;
            Map<String,Integer> reasons=new TreeMap<>();
            Set<String> seen=new HashSet<>();
            for(var feature:model.getAreas().getFeatures()) {
                Geometry geometry=feature.getGeometry();
                if(geometry==null){invalid++;reasons.merge("missing_geometry",1,Integer::sum);continue;}
                if(!(geometry instanceof org.locationtech.jts.geom.Polygon) && !(geometry instanceof org.locationtech.jts.geom.MultiPolygon))throw new IllegalArgumentException();
                var error=new IsValidOp(geometry).getValidationError();
                if(error!=null){invalid++;reasons.merge(error.getMessage(),1,Integer::sum);}
                STRtree index=new STRtree();
                for(int i=0;i<geometry.getNumGeometries();i++)index.insert(geometry.getGeometryN(i).getEnvelopeInternal(),new Object[]{i,geometry.getGeometryN(i)});
                boolean hasOverlap=false;
                for(int i=0;i<geometry.getNumGeometries();i++) {
                    components++;
                    Geometry part=geometry.getGeometryN(i);
                    if(!part.isValid())invalidParts++;
                    else for(Object candidate:index.query(part.getEnvelopeInternal())) {
                        Object[] row=(Object[])candidate;
                        if((Integer)row[0]>i && part.intersection((Geometry)row[1]).getArea()>0){overlapPairs++;hasOverlap=true;}
                    }
                    Geometry normalized=part.copy();normalized.normalize();
                    String digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalized.toText().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                    if(!seen.add(digest))duplicates++;
                }
                if(hasOverlap)overlapAreas++;
            }
            int areas=model.getAreas().getFeatures().size();
            int unique=CustomModel.getAreasAsMap(model.getAreas()).size();
            System.out.println("{\"status\":\""+(invalid==0?"PASS":"FAIL")+"\",\"scope\":\"offline_JTS_not_installed_engine\",\"areas\":"+areas+",\"unique_ids\":"+unique+",\"invalid_areas\":"+invalid+",\"components\":"+components+",\"invalid_components\":"+invalidParts+",\"exact_duplicate_components\":"+duplicates+",\"areas_with_positive_area_component_overlap\":"+overlapAreas+",\"overlap_component_pairs\":"+overlapPairs+",\"reasons\":"+Jackson.newObjectMapper().writeValueAsString(reasons)+"}");
            if(invalid!=0)System.exit(2);
        } catch(Exception error) {
            System.out.println("{\"status\":\"FAIL\",\"category\":\"parser_or_structure_error\"}");System.exit(1);
        }
    }
}
