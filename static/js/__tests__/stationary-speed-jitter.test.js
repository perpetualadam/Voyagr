const SG=require('../modules/navigation/speed-gps');
const NOW=1800000000000;
const fix=(north,t,accuracy=12)=>({lat:53.5+north/111195,lon:-1.4,timestamp:NOW+t*1000,accuracy});
const empty=()=>({lastGoodRawPickMph:0,consecutiveDisplacementMoves:0});
test.each([null,0,8.5])('overlapping stationary uncertainty cannot create a 19 mph reading with sensor %p',sensor=>{
 const history=[fix(0,0),fix(9,1)];
 const result=SG.stepPickRawSpeedMph(empty(),sensor,history,12);
 expect(result.value).toBe(0);expect(result.state.consecutiveDisplacementMoves).toBe(0);
});
test('repeated jitter cannot gradually promote itself into confirmed movement',()=>{
 let state=empty();const history=[];
 for(let i=0;i<20;i++){
  history.push(fix(i%2?9:0,i));
  const result=SG.stepPickRawSpeedMph(state,i%2?8.5:0,history,12);state=result.state;
  if(i>0)expect(result.value).toBe(0);
 }
});
test('real travel out of the uncertainty envelope is still displayed',()=>{
 const history=[fix(0,0),fix(9,1),fix(18,2),fix(27,3)];
 expect(SG.stepPickRawSpeedMph(empty(),8.5,history,12).value).toBeGreaterThan(15);
});
test('established moving speed does not disappear just because consecutive fixes overlap',()=>{
 expect(SG.stepPickRawSpeedMph({lastGoodRawPickMph:19,consecutiveDisplacementMoves:4},8.5,[fix(0,0),fix(9,1)],12).value).toBeGreaterThan(15);
});
test('unknown accuracy does not invent a stopped-position conclusion',()=>{
 expect(SG.stepPickRawSpeedMph(empty(),8.5,[fix(0,0,null),fix(9,1,null)],null).value).toBeGreaterThan(15);
});

test('an explicit stopped sample clears a previous moving reading inside the uncertainty envelope',()=>{
 const result=SG.stepPickRawSpeedMph({lastGoodRawPickMph:19,consecutiveDisplacementMoves:8},0,[fix(0,0),fix(9,1)],12);
 expect(result.value).toBe(0);expect(result.state.consecutiveDisplacementMoves).toBe(0);
});
