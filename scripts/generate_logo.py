from pathlib import Path

from PIL import Image, ImageDraw


output = Path(__file__).resolve().parents[1] / "assets" / "logo.png"
output.parent.mkdir(parents=True, exist_ok=True)

scale = 4
image = Image.new("RGBA", (44 * scale, 44 * scale), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)

draw.rounded_rectangle((3 * scale, 3 * scale, 41 * scale, 41 * scale), radius=9 * scale, fill="#4F6BED")
draw.rounded_rectangle((10 * scale, 9 * scale, 27 * scale, 34 * scale), radius=3 * scale, fill="white")
draw.line((14 * scale, 16 * scale, 23 * scale, 16 * scale), fill="#4F6BED", width=2 * scale)
draw.line((14 * scale, 22 * scale, 23 * scale, 22 * scale), fill="#4F6BED", width=2 * scale)
draw.line((14 * scale, 28 * scale, 20 * scale, 28 * scale), fill="#4F6BED", width=2 * scale)
draw.ellipse((25 * scale, 22 * scale, 38 * scale, 35 * scale), fill="#21B573", outline="white", width=2 * scale)
draw.line((28 * scale, 28 * scale, 31 * scale, 31 * scale, 36 * scale, 25 * scale), fill="white", width=2 * scale, joint="curve")

image.resize((44, 44), Image.Resampling.LANCZOS).save(output)
