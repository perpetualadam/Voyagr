const Policy=require('../modules/privacy/consent-policy');
test.each([null,{},true,'granted',{recordHistory:true},{schema:1,policyVersion:'old',choices:{history:{enabled:true,recordedAt:1}}}])('missing, legacy and unknown grants stay off: %p',record=>{
 for(const category of Policy.CATEGORIES)expect(Policy.allowed(record,category)).toBe(false);
});
test('independent choices record the current policy and changing one does not grant another',()=>{
 const history=Policy.choose(null,'history',true,123);
 expect(history).toMatchObject({schema:1,policyVersion:Policy.VERSION,choices:{history:{enabled:true,recordedAt:123}}});
 expect(Policy.allowed(history,'history')).toBe(true);expect(Policy.allowed(history,'analytics')).toBe(false);
 const both=Policy.choose(history,'analytics',true,124),withdrawn=Policy.choose(both,'history',false,125);
 expect(Policy.allowed(withdrawn,'history')).toBe(false);expect(Policy.allowed(withdrawn,'analytics')).toBe(true);
});
test.each(['cloudSync','dashcamBackup','diagnostics'])('%s cannot be enabled before implementation and enforcement',category=>{
 expect(()=>Policy.choose(null,category,true)).toThrow('unavailable');
 expect(Policy.allowed({schema:1,policyVersion:Policy.VERSION,choices:{[category]:{enabled:true,recordedAt:1}}},category)).toBe(false);
});
test('a new policy requires fresh category consent, not automatic migration of grants',()=>{
 const old=Policy.choose(null,'history',true);old.policyVersion='future';const fresh=Policy.choose(old,'analytics',true);
 expect(Policy.allowed(fresh,'history')).toBe(false);expect(Policy.allowed(fresh,'analytics')).toBe(true);
});
test('malformed records and invalid categories are not consent',()=>{
 const malformed={schema:1,policyVersion:Policy.VERSION,choices:{history:{enabled:'true',recordedAt:NaN}}};
 expect(Policy.allowed(malformed,'history')).toBe(false);expect(()=>Policy.choose(null,'unknown',true)).toThrow();
});
test('default OFF is distinguishable from an explicit denial in the recorded receipt',()=>{
 const record=Policy.choose(null,'history',true,10);expect(record.choices.history.source).toBe('explicit');
 expect(record.choices.analytics).toEqual({enabled:false,recordedAt:null,source:'default'});
 const denied=Policy.choose(record,'analytics',false,20);expect(denied.choices.analytics).toEqual({enabled:false,recordedAt:20,source:'explicit'});
});
