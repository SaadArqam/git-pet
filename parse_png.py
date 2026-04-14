from PIL import Image

im = Image.open('test_card.png')
print(f"Size: {im.size}")
print(f"Mode: {im.mode}")
colors = im.getcolors(maxcolors=100000)
if colors:
    print(f"Unique colors: {len(colors)}")
    # get 10 most common colors
    common = sorted(colors, reverse=True)[:10]
    print(f"Most common colors: {common}")
else:
    print("Too many colors!")
