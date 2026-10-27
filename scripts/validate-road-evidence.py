#!/usr/bin/env python3
"""Read-only QC of an operator-supplied evidence file. Never upgrades coverage."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from voyagr.utils.road_evidence import read_bounded,validate_evidence,MAX_EVIDENCE_BYTES
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input',type=Path);args=p.parse_args()
    try:result=validate_evidence(json.loads(read_bounded(args.input,MAX_EVIDENCE_BYTES)))
    except (ValueError,OSError) as error:result={'valid':False,'errors':[str(error)]}
    print(json.dumps(result,indent=2));sys.exit(0 if result['valid'] else 1)
