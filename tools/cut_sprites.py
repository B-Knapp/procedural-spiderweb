"""Cut art/rig-sheet.png into the body and leg-segment sprites in assets/.
Each leg piece is rotated so its proximal (body) end is on the left; meta.json records
the joint points and which way the piece curves. The body is split at the waist
(pedicel) so the abdomen can pivot."""
import json, pathlib
import numpy as np, cv2
from scipy import ndimage as ndi
root = pathlib.Path(__file__).resolve().parent.parent
im = cv2.imread(str(root / 'art/rig-sheet.png'), cv2.IMREAD_UNCHANGED)
lab, _ = ndi.label(im[:, :, 3] > 40)
BC = np.array([770.0, 430.0])  # body centre on the sheet

def piece(idx, scale, body=False):
    m = lab == idx; ys, xs = np.nonzero(m)
    x0, x1, y0, y1 = xs.min() - 4, xs.max() + 5, ys.min() - 4, ys.max() + 5
    crop = im[y0:y1, x0:x1].copy(); crop[~m[y0:y1, x0:x1]] = 0
    pts = np.stack([xs - x0, ys - y0], 1).astype(float)
    if body: ang, prox, far = 90.0, None, None
    else:
        c = pts.mean(0); ax = np.linalg.svd(pts - c, full_matrices=False)[2][0]; pr = (pts - c) @ ax
        e1 = pts[pr < np.percentile(pr, 6)].mean(0); e2 = pts[pr > np.percentile(pr, 94)].mean(0); g = np.array([x0, y0])
        if np.linalg.norm(e1 + g - BC) > np.linalg.norm(e2 + g - BC): e1, e2 = e2, e1
        prox = e1; d = np.hypot(*(pts - prox).T); far = pts[d > np.percentile(d, 99)].mean(0)
        ang = np.degrees(np.arctan2(*(far - prox)[::-1]))
    h, w = crop.shape[:2]; D = int(np.hypot(h, w)) + 10
    M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0); M[0, 2] += D / 2 - w / 2; M[1, 2] += D / 2 - h / 2
    f = crop.astype(np.float32); f[:, :, :3] *= f[:, :, 3:4] / 255
    r = np.clip(cv2.warpAffine(f, M, (D, D), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0, 0)), 0, 255)
    ys2, xs2 = np.nonzero(r[:, :, 3] > 8); X0, Y0 = xs2.min(), ys2.min()
    info = {}
    if not body:
        P = M @ [*prox, 1]; F = M @ [*far, 1]
        info = dict(px=P[0] - X0, py=P[1] - Y0, fx=F[0] - X0, fy=F[1] - Y0)
    r = r[Y0:ys2.max() + 1, X0:xs2.max() + 1]
    r = cv2.resize(r, (int(r.shape[1] * scale), int(r.shape[0] * scale)), interpolation=cv2.INTER_AREA)
    a = r[:, :, 3:4]; out = r.copy(); out[:, :, :3] = np.where(a > 0, r[:, :, :3] * 255 / np.maximum(a, 1), 0)
    out = np.clip(out, 0, 255).astype(np.uint8)
    info = {k: round(float(v * scale), 2) for k, v in info.items()}; info.update(w=out.shape[1], h=out.shape[0])
    return out, info

meta = {}
body, bi = piece(1, 0.5, body=True)
for name, sl, x0 in [('body_abd', slice(0, 216), 0), ('body_ceph', slice(204, None), 204)]:
    part = body[:, sl]; cv2.imwrite(str(root / f'assets/{name}.png'), part); meta[name] = {'w': part.shape[1], 'h': part.shape[0], 'x0': x0}
for name, idx in [('fem_a', 14), ('fem_b', 17), ('fem_c', 7), ('tib_a', 11), ('tib_b', 3), ('tib_c', 20), ('tar_a', 16), ('tar_b', 6), ('tar_c', 30), ('tar_d', 29)]:
    img, info = piece(idx, 0.5)
    a = img[:, :, 3].astype(float); half = a[:, int(img.shape[1] * 0.55):]; cy = (half.sum(1) * np.arange(img.shape[0])).sum() / half.sum()
    info['curve'] = 1 if cy > info['py'] else -1
    cv2.imwrite(str(root / f'assets/{name}.png'), img); meta[name] = info
(root / 'assets/meta.json').write_text(json.dumps(meta, indent=1))
print('sprites:', ', '.join(meta))
