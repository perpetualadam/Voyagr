// Deterministic product-pipeline replay. Synthetic data only; no external requests.
const fixtures=require('../tests/fixtures/phase7/directional-replay-v1.json');
const {replay}=require('./lib/navigation-replay.cjs');
const results=fixtures.scenarios.map(s=>({name:s.name,rows:replay({...s,road_context:fixtures.contexts[s.context]},s.route)}));
process.stdout.write(JSON.stringify(results,null,2)+'\n');
