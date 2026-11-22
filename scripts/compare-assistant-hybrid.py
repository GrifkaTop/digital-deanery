"""Offline comparison using a read-only active-fragment export and a Qwen diagnostic run."""
import json
import re
import sys
import time
from pathlib import Path

import torch
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer

questions_path, results_path, fragments_path, model_path, output_path = sys.argv[1:]
questions = [json.loads(line) for line in Path(questions_path).read_text().splitlines()]
records = [json.loads(line) for line in Path(results_path).read_text().splitlines()]
assert records[-1] == {"completed": len(questions)}
results = {row["id"]: row for row in records[1:-1]}
fragments = json.loads(Path(fragments_path).read_text())
active = {row["number"]: row["revision"] for row in records[0]["run"]["publications"]}
assert all(active.get(row["number"]) == row["revision"] for row in fragments)
refs = [f'{row["number"]}:{row["position"]}' for row in fragments]
tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True)
model = AutoModel.from_pretrained(model_path, local_files_only=True).eval()
torch.set_num_threads(4)

def embed(texts):
    tokens = tokenizer(texts, max_length=512, padding=True, truncation=True, return_tensors="pt")
    with torch.inference_mode():
        hidden = model(**tokens).last_hidden_state
        mask = tokens["attention_mask"].unsqueeze(-1)
        return F.normalize((hidden * mask).sum(dim=1) / mask.sum(dim=1), p=2, dim=1)

def clean(text):
    match = re.search(r"(?m)^\d+\. ", text)
    return text[match.start():] if match else text

start = time.perf_counter()
vectors = torch.cat([embed(["passage: " + clean(row["text"]) for row in fragments[i:i+8]])
                     for i in range(0, len(fragments), 8)])
index_ms = (time.perf_counter() - start) * 1000
out = [{"model": "intfloat/multilingual-e5-small@614241f622f53c4eeff9890bdc4f31cfecc418b3",
        "fusion": "RRF k=60, equal weights, FTS top-8 and all vectors", "indexMs": round(index_ms),
        "fragments": len(refs)}]
for question in questions:
    result = results[question["id"]]
    start = time.perf_counter()
    query = embed(["query: " + question["question"]])
    semantic = torch.argsort((query @ vectors.T)[0], descending=True).tolist()
    semantic_refs = [refs[index] for index in semantic]
    lexical = [row["ref"] for row in result["direct"]]
    scores = {}
    for ranked in (lexical, semantic_refs):
        for rank, ref in enumerate(ranked, 1):
            scores[ref] = scores.get(ref, 0) + 1 / (60 + rank)
    hybrid = sorted(scores, key=lambda ref: (-scores[ref], ref))[:8]
    elapsed = (time.perf_counter() - start) * 1000
    trace = result["trace"]
    candidates = trace.get("candidates", trace.get("payments", {}).get("sources", []))
    out.append({"id": question["id"], "direct": lexical, "qwen": [x["ref"] for x in candidates],
                "hybrid": hybrid, "semantic": semantic_refs[:8], "hybridComputeMs": round(elapsed, 1)})
Path(output_path).write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in out))
