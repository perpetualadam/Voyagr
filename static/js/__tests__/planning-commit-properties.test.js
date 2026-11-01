const {install}=require('../../../scripts/browser/planning-commit-diagnostic.cjs');
const {CASES,exerciseCase}=require('./fixtures/planning-probe-properties.cjs');
// This is a class-double property/receiver test; the browser runner uses bundled MapLibre.
test.each(CASES)('descriptor-aware observer preserves %s',async name=>{
 const result=await exerciseCase({name,source:install.toString()});expect(result.passed).toBe(true);
});
