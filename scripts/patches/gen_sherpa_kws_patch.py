#!/usr/bin/env python3
"""Emit GNU patch for GetKeywordSpotterConfig. Run: python3 scripts/patches/gen_sherpa_kws_patch.py

Each hunk data line = one leading diff marker (space / +) + *exact* file line content.
Omitting the first column caused context lines to be one space short and patch(1) to fail.
"""
from pathlib import Path


def c(line: str) -> str:
    """Unchanged (context) line: marker ' ' + line as in source (empty string = empty file line)."""
    return " " + line + "\n"


def p(line: str) -> str:
    """Added line: marker '+' + file line. Use line '' for empty line inside addition."""
    return "+" + line + "\n"


def main() -> None:
    t = [
        "--- a/sherpa-onnx/c-api/c-api.cc\n",
        "+++ b/sherpa-onnx/c-api/c-api.cc\n",
        "@@ -1001,6 +1001,16 @@ static sherpa_onnx::KeywordSpotterConfig GetKeywordSpotterConfig(\n",
    ]
    # 1001-1004 (4 lines) + 10 insert + 1005-1006 (2 lines) = 16 in new, 6 in old
    t += [
        c(""),
        c("  spotter_config.model_config.model_type ="),
        c("      SHERPA_ONNX_OR(config->model_config.model_type, \"\");"),
        c("  spotter_config.model_config.debug = config->model_config.debug;"),
        p("  spotter_config.model_config.modeling_unit ="),
        p("      SHERPA_ONNX_OR(config->model_config.modeling_unit, \"cjkchar\");"),
        p(""),
        p("  if (spotter_config.model_config.modeling_unit.empty()) {"),
        p("    spotter_config.model_config.modeling_unit = \"cjkchar\";"),
        p("  }"),
        p(""),
        p("  spotter_config.model_config.bpe_vocab ="),
        p("      SHERPA_ONNX_OR(config->model_config.bpe_vocab, \"\");"),
        p(""),
        c(""),
        c("  spotter_config.max_active_paths = SHERPA_ONNX_OR(config->max_active_paths, 4);"),
        "\n",
    ]
    out = Path(__file__).with_name("sherpa-onnx-kws-GetKeywordSpotterConfig-modeling.patch")
    out.write_text("".join(t), encoding="utf-8", newline="\n")
    print("Wrote", out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
