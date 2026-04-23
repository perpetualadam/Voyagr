#!/usr/bin/env python3
"""Emit GNU patch for GetKeywordSpotterConfig. Run from Voyagr: python3 scripts/patches/gen_sherpa_kws_patch.py"""
from pathlib import Path

def main() -> None:
    # Context: 4 + 10+ + 2. Old=6, new=4+10+2=16.
    t = [
        "--- a/sherpa-onnx/c-api/c-api.cc\n",
        "+++ b/sherpa-onnx/c-api/c-api.cc\n",
        "@@ -1001,6 +1001,16 @@ static sherpa_onnx::KeywordSpotterConfig GetKeywordSpotterConfig(\n",
    ]
    # All context (unchanged) lines: one leading space = diff marker, rest = file line
    t.append(" \n")  # 1001 empty: marker + (empty) -> single space
    t.append("   spotter_config.model_config.model_type =\n")
    t.append("      SHERPA_ONNX_OR(config->model_config.model_type, \"\");\n")
    t.append("  spotter_config.model_config.debug = config->model_config.debug;\n")
    t += [
        "+  spotter_config.model_config.modeling_unit =\n",
        "+      SHERPA_ONNX_OR(config->model_config.modeling_unit, \"cjkchar\");\n",
        "+\n",
        "+  if (spotter_config.model_config.modeling_unit.empty()) {\n",
        "+    spotter_config.model_config.modeling_unit = \"cjkchar\";\n",
        "+  }\n",
        "+\n",
        "+  spotter_config.model_config.bpe_vocab =\n",
        "+      SHERPA_ONNX_OR(config->model_config.bpe_vocab, \"\");\n",
        "+\n",
        " \n",  # 1005 empty
        "  spotter_config.max_active_paths = SHERPA_ONNX_OR(config->max_active_paths, 4);\n",
        "\n",
    ]
    p = Path(__file__).with_name("sherpa-onnx-kws-GetKeywordSpotterConfig-modeling.patch")
    p.write_text("".join(t), encoding="utf-8", newline="\n")
    print("Wrote", p, "bytes", p.stat().st_size)


if __name__ == "__main__":
    main()
