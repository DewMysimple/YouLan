"""Generate small deterministic panorama fixtures using Blender, without a .blend save.

blender --background --factory-startup --python tests/generateEnvironmentFixtures.py -- OUTPUT
"""
import bpy
import os
import sys

output = sys.argv[sys.argv.index("--") + 1]
os.makedirs(output, exist_ok=True)
image = bpy.data.images.new("environment-test", width=64, height=32, float_buffer=True)
image.pixels = [component for y in range(32) for x in range(64)
                for component in (x / 63, y / 31, 0.25, 1.0)]
scene = bpy.context.scene
scene.view_settings.view_transform = "Standard"
for format_name, extension in [("HDR", "hdr"), ("OPEN_EXR", "exr"), ("PNG", "png"), ("JPEG", "jpg")]:
    scene.render.image_settings.file_format = format_name
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "32" if format_name in {"OPEN_EXR", "HDR"} else "8"
    image.save_render(os.path.join(output, "panorama." + extension), scene=scene)
bpy.data.images.remove(image)
print("Environment fixtures generated:", output)
