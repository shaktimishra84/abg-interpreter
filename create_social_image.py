#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import math

# Create a 1200x630 image
width, height = 1200, 630
image = Image.new('RGB', (width, height))
draw = ImageDraw.Draw(image, 'RGBA')

# Draw gradient background (blue)
for y in range(height):
    # Gradient from #0052CC to #1E40AF
    r = int(0 + (30 - 0) * (y / height))
    g = int(82 + (64 - 82) * (y / height))
    b = int(204 + (175 - 204) * (y / height))
    draw.rectangle([(0, y), (width, y+1)], fill=(r, g, b))

# Draw blood drop shape (red circle on left)
drop_x, drop_y = 200, 315
drop_radius = 100

# Create red gradient circle for blood drop
for r in range(drop_radius, 0, -1):
    alpha = int(255 * (1 - r / drop_radius) * 0.3)
    shade = int(255 - (r / drop_radius) * 50)
    draw.ellipse(
        [(drop_x - r, drop_y - r), (drop_x + r, drop_y + r)],
        fill=(shade, 30, 60, alpha)
    )

# Draw main blood drop (solid red)
draw.ellipse(
    [(drop_x - 80, drop_y - 100), (drop_x + 80, drop_y + 80)],
    fill=(255, 45, 85, 255)
)

# Draw highlight on drop
draw.ellipse(
    [(drop_x - 40, drop_y - 60), (drop_x - 10, drop_y - 20)],
    fill=(255, 150, 170, 180)
)

# Draw heartbeat line (EKG style)
hb_y = drop_y - 20
draw.line([(drop_x - 60, hb_y), (drop_x - 40, hb_y)], fill=(255, 255, 255, 255), width=3)
draw.line([(drop_x - 40, hb_y), (drop_x - 30, hb_y - 30)], fill=(255, 255, 255, 255), width=3)
draw.line([(drop_x - 30, hb_y - 30), (drop_x - 20, hb_y + 20)], fill=(255, 255, 255, 255), width=3)
draw.line([(drop_x - 20, hb_y + 20), (drop_x - 10, hb_y)], fill=(255, 255, 255, 255), width=3)
draw.line([(drop_x - 10, hb_y), (drop_x + 60, hb_y)], fill=(255, 255, 255, 255), width=3)

# Draw text on right side
text_x = 450
text_y = 200

# Try to use system fonts
try:
    title_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 72)
    subtitle_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
    description_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
except:
    title_font = ImageFont.load_default()
    subtitle_font = ImageFont.load_default()
    description_font = ImageFont.load_default()

# Draw accent bar
draw.rectangle([(text_x, text_y - 80), (text_x + 60, text_y - 76)], fill=(255, 45, 85, 255))

# Draw subtitle
draw.text((text_x, text_y - 60), "CLINICAL INTERPRETER", font=subtitle_font, fill=(240, 240, 240, 255))

# Draw title
draw.text((text_x, text_y - 10), "ABG Analysis", font=title_font, fill=(255, 255, 255, 255))

# Draw description
description = "Rule-based clinical calculator for arterial blood gas analysis.\nInterpret pH, O₂, CO₂ and more."
draw.text((text_x, text_y + 100), description, font=description_font, fill=(230, 230, 230, 255))

# Save the image
image.save('/Volumes/Crucial X9/ABG app/images/abg-social-preview-new.png')
print("Social preview image created successfully!")
print("Size: 1200x630px")
print("Path: /Volumes/Crucial X9/ABG app/images/abg-social-preview-new.png")
