# -*- coding: utf-8 -*-
"""Build a low-memory ONNX copy of AnuarSv/kokoro-tts-kazakh.

Run this during the Render build, never on a request.  The source checkpoint is
Apache-2.0 and remains on Hugging Face; the generated ONNX/numpy artifacts live
in the service build filesystem and are not committed to Git.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import onnx
import torch
from huggingface_hub import hf_hub_download
from kokoro import KModel
from kokoro.model import KModelForONNX
from misaki import espeak
from onnxruntime.quantization import QuantType, quantize_dynamic

REPO = os.environ.get("KOKORO_KK_REPO", "AnuarSv/kokoro-tts-kazakh").strip()
ROOT = Path(os.environ.get("KOKORO_KK_ONNX_DIR", "app/ai/kokoro_kazakh_runtime")).resolve()
ROOT.mkdir(parents=True, exist_ok=True)


def main() -> None:
    source_dir = ROOT / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = Path(hf_hub_download(repo_id=REPO, filename="kokoro_kazakh.pth", local_dir=source_dir))
    voice_path = Path(hf_hub_download(repo_id=REPO, filename="km_m1.pt", local_dir=source_dir))
    config_path = Path(hf_hub_download(repo_id=REPO, filename="config.json", local_dir=source_dir))

    config = json.loads(config_path.read_text(encoding="utf-8"))
    model = KModel(repo_id="hexgrad/Kokoro-82M", config=str(config_path), model=str(checkpoint), disable_complex=True).eval()
    export_model = KModelForONNX(model).eval()

    g2p = espeak.EspeakG2P(language="kk")
    phonemes, _ = g2p("Сәлем! Бұл қазақ тіліндегі дауыс сынағы.")
    ids = [model.vocab[p] for p in phonemes if p in model.vocab]
    if not ids:
        raise RuntimeError("Kazakh G2P produced no Kokoro tokens")

    voicepack = torch.load(voice_path, map_location="cpu", weights_only=True).float()
    style = voicepack[min(len(phonemes) - 1, voicepack.shape[0] - 1)]
    if style.ndim == 1:
        style = style.unsqueeze(0)

    input_ids = torch.LongTensor([[0, *ids, 0]])
    speed = torch.tensor(1.0, dtype=torch.float32)
    fp32 = ROOT / "kokoro_kazakh_fp32.onnx"
    q8 = ROOT / "kokoro_kazakh_q8.onnx"

    with torch.inference_mode():
        torch.onnx.export(
            export_model,
            args=(input_ids, style, speed),
            f=str(fp32),
            export_params=True,
            input_names=["input_ids", "style", "speed"],
            output_names=["waveform", "duration"],
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
            dynamic_axes={
                "input_ids": {1: "input_ids_len"},
                "waveform": {0: "num_samples"},
            },
        )

    checked = onnx.load(str(fp32))
    onnx.checker.check_model(checked)

    # QInt8 dynamic weight quantization avoids loading the 82M fp32 PyTorch
    # checkpoint at request time and is dramatically smaller on CPU.
    quantize_dynamic(str(fp32), str(q8), weight_type=QuantType.QInt8)
    q8_model = onnx.load(str(q8))
    onnx.checker.check_model(q8_model)

    np.save(ROOT / "km_m1.npy", voicepack.cpu().numpy().astype(np.float32), allow_pickle=False)
    (ROOT / "config.json").write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    (ROOT / "BUILD_INFO.json").write_text(
        json.dumps({
            "repo": REPO,
            "voice": "km_m1",
            "sampleRate": 24000,
            "fp32Bytes": fp32.stat().st_size,
            "q8Bytes": q8.stat().st_size,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Runtime only needs the quantized graph, numpy voicepack and config.
    fp32.unlink(missing_ok=True)
    for item in source_dir.iterdir():
        if item.is_file() or item.is_symlink():
            item.unlink(missing_ok=True)
    try:
        source_dir.rmdir()
    except OSError:
        pass

    print("KOKORO_KK_ONNX_BUILD_OK", q8.stat().st_size)


if __name__ == "__main__":
    main()
