# End-to-end tests

`npm run e2e` builds nothing — run `npm run build` first. It serves `dist/` and drives
Chromium with a fake camera:

- Without `FAKE_VIDEO`, Chromium's synthetic test pattern is the camera (no face): the
  test checks that the camera starts, MediaPipe loads, and the UI renders.
- With `FAKE_VIDEO=/abs/path/clip.y4m`, the clip becomes the camera and the tests check
  that faces are tracked, expressions are named, and calibration succeeds.

Convert any face video to Y4M (uncompressed, 4:2:0) for Chromium, e.g.:

```sh
ffmpeg -i clip.mp4 -pix_fmt yuv420p clip.y4m
```
