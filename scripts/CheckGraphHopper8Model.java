import java.nio.file.*;
import com.graphhopper.jackson.Jackson;
import com.graphhopper.util.CustomModel;
// Offline parser-only harness. No engine, graph or network access.
public class CheckGraphHopper8Model {
    public static void main(String[] args) throws Exception {
        try {
            CustomModel model=Jackson.newObjectMapper().readValue(Files.readString(Path.of(args[0])), CustomModel.class);
            long invalid=model.getAreas().getFeatures().stream().filter(f -> f.getGeometry()==null || !f.getGeometry().isValid()).count();
            System.out.println("PARSED areas="+model.getAreas().getFeatures().size()+" unique="+CustomModel.getAreasAsMap(model.getAreas()).size()+" invalid_geometry="+invalid);
            if(invalid!=0)System.exit(2);
        } catch (Exception e) {
            Throwable root=e;while(root.getCause()!=null)root=root.getCause();
            System.out.println("REJECTED type="+root.getClass().getSimpleName()+" duplicate_area="+String.valueOf(root.getMessage()).startsWith("Cannot handle duplicate area"));
            System.exit(1);
        }
    }
}
