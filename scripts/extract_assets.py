from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "reminders_landing.png"

CROPS = [
    (30, 28, 260, 245),
    (1200, 30, 1422, 225),
    (610, 38, 925, 98),
    (80, 345, 140, 456),
    (704, 350, 780, 460),
    (82, 615, 141, 709),
    (699, 613, 762, 711),
    (84, 847, 141, 956),
    (697, 847, 760, 958),
    (615, 960, 875, 1007),
    (1442, 155, 1491, 211),
    (1444, 342, 1490, 388),
    (1444, 503, 1490, 550),
    (1443, 638, 1491, 694),
    (1444, 782, 1491, 832),
    (1440, 913, 1493, 976),
]


def main() -> None:
    source = Image.open(SOURCE)
    for index, box in enumerate(CROPS, start=1):
        source.crop(box).save(ROOT / f"image_{index}.png", optimize=True)


if __name__ == "__main__":
    main()
