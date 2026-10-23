import math

import gradio as gr
from optimum.onnxruntime import ORTModelForSequenceClassification
from optimum.pipelines import pipeline as ort_pipeline
from transformers import AutoTokenizer, pipeline

TRANSLATION_MODEL = "Helsinki-NLP/opus-mt-sv-en"
TOXICITY_MODEL = "dcferreira/detoxify-optimized"
THRESHOLD = 0.5
CHUNK_TOKENS = 384
TOXIC_LABELS = {
    "toxicity", "severe_toxicity", "obscene", "identity_attack", "insult", "threat", "sexual_explicit",
}

translator = pipeline("translation", model=TRANSLATION_MODEL, device=-1)
toxicity_tokenizer = AutoTokenizer.from_pretrained(TOXICITY_MODEL)
toxicity_model = ORTModelForSequenceClassification.from_pretrained(
    TOXICITY_MODEL, file_name="model_optimized.onnx", provider="CPUExecutionProvider"
)
classifier = ort_pipeline(
    "text-classification",
    model=toxicity_model,
    tokenizer=toxicity_tokenizer,
    accelerator="ort",
    function_to_apply="sigmoid",
    top_k=None,
)


def _chunks(text, tokenizer):
    tokens = tokenizer.encode(text, add_special_tokens=False)
    for start in range(0, len(tokens), CHUNK_TOKENS):
        yield tokenizer.decode(tokens[start:start + CHUNK_TOKENS], skip_special_tokens=True)


def moderate(text: str) -> dict:
    if not isinstance(text, str) or not text.strip() or len(text) > 20000:
        raise ValueError("Texten måste innehålla mellan 1 och 20000 tecken.")
    translations = [
        translator(chunk, truncation=False, max_new_tokens=512)[0]["translation_text"]
        for chunk in _chunks(text, translator.tokenizer)
    ]
    translated_text = " ".join(translations)
    if not translated_text.strip():
        raise ValueError("Texten kunde inte översättas.")
    score = 0.0
    for chunk in _chunks(translated_text, toxicity_tokenizer):
        labels = {item["label"]: float(item["score"]) for item in classifier(chunk, truncation=False)}
        if not TOXIC_LABELS.issubset(labels):
            raise ValueError("Modellens svar saknar toxicitetsvärden.")
        scores = [labels[label] for label in TOXIC_LABELS]
        if any(not math.isfinite(value) or not 0 <= value <= 1 for value in scores):
            raise ValueError("Modellen returnerade ogiltiga toxicitetsvärden.")
        score = max(score, *scores)
    return {"flagged": score >= THRESHOLD, "translated_text": translated_text, "score": score}


demo = gr.Interface(fn=moderate, inputs=gr.Textbox(), outputs=gr.JSON(), api_name="moderate")

if __name__ == "__main__":
    demo.queue(max_size=32, default_concurrency_limit=1).launch()