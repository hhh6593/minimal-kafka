"""Undo the 20-byte XOR the game's resource bundles are stored with: dexor.py IN OUT."""
import sys
import numpy as np
KEY_PLAIN = b'UnityFS\x00\x00\x00\x00\x085.x.x\x00'
def key_of(head):
    k = [a ^ b for a, b in zip(head, KEY_PLAIN)]
    return bytes(k + [head[38], head[39]])
src, dst = sys.argv[1], sys.argv[2]
raw = np.fromfile(src, dtype=np.uint8)
key = np.frombuffer(key_of(bytes(raw[:40])), dtype=np.uint8)
reps = -(-len(raw) // 20)
(raw ^ np.tile(key, reps)[:len(raw)]).tofile(dst)
