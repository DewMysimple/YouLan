"""Run with Blender --factory-startup -b --python scripts/export_paper_orbit.py.

Creates lightweight runtime copies; never saves either source asset.
"""
import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
PLANE = ROOT / 'source/papierfliegerswap.blend'
EARTH = next((ROOT / 'source').glob('C1123*/*fbx.fbx'))
OUTPUT = ROOT / 'public/models'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .85
    return mat


def export(objects, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / filename), export_format='GLB',
                              use_selection=True, export_animations=False,
                              export_cameras=False, export_lights=False)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    hashes = {path.relative_to(ROOT).as_posix(): digest(path) for path in (PLANE, EARTH)}
    bpy.ops.wm.open_mainfile(filepath=str(PLANE))
    plane = bpy.data.objects['Plane']
    original_vertices = len(plane.data.vertices)
    # The other mesh is the studio backdrop. +Y is the source aircraft nose;
    # glTF converts Blender -Y to +Z, our runtime forward axis.
    plane.parent = None
    plane.matrix_world = Matrix.Identity(4)
    for vertex in plane.data.vertices:
        vertex.co = Vector((vertex.co.x / 2, -vertex.co.y / 2, vertex.co.z / 2))
    bpy.ops.object.select_all(action='DESELECT')
    plane.select_set(True)
    bpy.context.view_layer.objects.active = plane
    dissolve = plane.modifiers.new('Preserve paper creases', 'DECIMATE')
    dissolve.decimate_type = 'DISSOLVE'
    dissolve.angle_limit = math.radians(1)
    bpy.ops.object.modifier_apply(modifier=dissolve.name)
    plane.data.calc_loop_triangles()
    if len(plane.data.loop_triangles) > 180:
        reduction = plane.modifiers.new('Flight instance budget', 'DECIMATE')
        reduction.ratio = 180 / len(plane.data.loop_triangles)
        bpy.ops.object.modifier_apply(modifier=reduction.name)
    plane.name = 'PaperPlane'
    plane.data.materials.clear()
    plane.data.materials.append(material('Ivory paper', (.94, .91, .83)))
    plane.data.calc_loop_triangles()
    triangles = len(plane.data.loop_triangles)
    export([plane], 'paper-plane.glb')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    # This legacy FBX contains obsolete Cycles light fields. Lights are excluded
    # from the export; bypass only their decoder in this temporary process.
    from io_scene_fbx import import_fbx
    original_light_reader = import_fbx.blen_read_light
    try:
        import_fbx.blen_read_light = lambda *args: bpy.data.lights.new('Unused source light', 'POINT')
        bpy.ops.import_scene.fbx(filepath=str(EARTH))
    finally:
        import_fbx.blen_read_light = original_light_reader
    ocean, land = bpy.data.objects['sea'], bpy.data.objects['land']
    ocean_points = [ocean.matrix_world @ v.co for v in ocean.data.vertices]
    center = Vector(tuple((min(v[i] for v in ocean_points) + max(v[i] for v in ocean_points)) / 2 for i in range(3)))
    objects = [ocean, land]
    points = [[obj.matrix_world @ v.co - center for v in obj.data.vertices] for obj in objects]
    radius = max(v.length for group in points for v in group)
    for obj, vertices, name, color in zip(objects, points, ['EarthOcean', 'EarthLand'],
                                         [(.23, .38, .65), (.31, .72, .66)]):
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        for vertex, position in zip(obj.data.vertices, vertices):
            vertex.co = position * (3 / radius)
        obj.name = name
        obj.data.materials.clear()
        obj.data.materials.append(material(name, color))
        for face in obj.data.polygons:
            face.material_index = 0
            face.use_smooth = False
    export(objects, 'paper-orbit-earth.glb')
    assert hashes == {path.relative_to(ROOT).as_posix(): digest(path) for path in (PLANE, EARTH)}, 'Source changed'
    report = {'sources': hashes, 'planeOriginalVertices': original_vertices,
              'planeTriangles': triangles, 'planetMaxRadius': 3,
              'planetSourceObjects': ['sea', 'land'], 'planeForward': '+Z'}
    (OUTPUT / 'paper-orbit-assets.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
