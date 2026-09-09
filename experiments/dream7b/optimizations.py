"""Optional equivalent shortcut for Dream's greedy margin confidence calculation."""
import torch

def margin_top2(original):
    def sample(logits, temperature=0.0, top_p=None, top_k=None,
               margin_confidence=False, neg_entropy=False):
        if not margin_confidence or temperature != 0 or top_p is not None or top_k is not None or neg_entropy:
            return original(logits, temperature, top_p, top_k, margin_confidence, neg_entropy)
        probs = torch.softmax(logits, dim=-1)
        top = torch.topk(probs, 2, dim=-1).values
        # Preserve the reference argmax tie-breaking; topk alone may pick a different token.
        tokens = probs.max(dim=-1).indices
        return top[:, 0] - top[:, 1], tokens
    return sample

def verify_margin_top2(original):
    optimized = margin_top2(original)
    generator = torch.Generator(device='cuda').manual_seed(814)
    for dtype in (torch.float32, torch.bfloat16):
        random = torch.randn(32, 152064, device='cuda', dtype=dtype, generator=generator)
        tied = torch.zeros(4, 32, device='cuda', dtype=dtype)
        for logits in (random, tied):
            reference = original(logits, margin_confidence=True)
            actual = optimized(logits, margin_confidence=True)
            for expected, observed in zip(reference, actual):
                torch.testing.assert_close(observed, expected, rtol=0, atol=0)
