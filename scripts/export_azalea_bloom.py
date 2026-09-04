import hashlib
import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector
from mathutils.kdtree import KDTree


SOURCE_OBJECT = "杜鹃花_高模"
SOURCE_CAMERA = "相机_杜鹃花英雄视角"
SOURCE_MATERIAL = "杜鹃花_四通道材质"
SUBSURFACE_IMAGE = "杜鹃花_次表面_rhododendron_subsur.png"
PETAL_COMPONENTS = 5
TARGET_BLOOM_RADIUS = 3.0


def output_paths_from_arguments():
    if "--" not in sys.argv:
        raise RuntimeError("缺少杜鹃花 GLB 输出路径。")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 2:
        raise RuntimeError("导出脚本需要 GLB 与次表面贴图两个输出路径。")
    return tuple(os.path.abspath(path) for path in arguments)


def file_hash(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def connected_components(mesh):
    adjacency = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        first, second = edge.vertices
        adjacency[first].append(second)
        adjacency[second].append(first)

    seen = set()
    components = []
    for vertex_index in range(len(mesh.vertices)):
        if vertex_index in seen:
            continue
        pending = [vertex_index]
        seen.add(vertex_index)
        component = []
        while pending:
            current = pending.pop()
            component.append(current)
            for neighbor in adjacency[current]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    pending.append(neighbor)
        components.append(component)
    return sorted(components, key=len, reverse=True)


def average(vectors):
    result = Vector((0.0, 0.0, 0.0))
    for vector in vectors:
        result += vector
    return result / max(len(vectors), 1)


def smoothstep(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def make_subset_object(name, source_mesh, selected_vertices, transformed_positions, material):
    selected = set(selected_vertices)
    old_to_new = {}
    vertices = []
    for old_index in sorted(selected):
        old_to_new[old_index] = len(vertices)
        vertices.append(transformed_positions[old_index])

    faces = []
    source_polygons = []
    for polygon in source_mesh.polygons:
        if all(vertex_index in selected for vertex_index in polygon.vertices):
            faces.append([old_to_new[vertex_index] for vertex_index in polygon.vertices])
            source_polygons.append(polygon)

    mesh = bpy.data.meshes.new(f"{name}_GEOMETRY")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()

    source_uv = source_mesh.uv_layers.active
    if source_uv:
        target_uv = mesh.uv_layers.new(name="UVMap")
        for target_polygon, source_polygon in zip(mesh.polygons, source_polygons):
            for target_loop_index, source_loop_index in zip(
                target_polygon.loop_indices,
                source_polygon.loop_indices,
            ):
                target_uv.data[target_loop_index].uv = source_uv.data[source_loop_index].uv

    for polygon in mesh.polygons:
        polygon.use_smooth = True

    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj["sourceVertexCount"] = len(selected)
    obj["sourcePolygonCount"] = len(faces)
    return obj, old_to_new


def main():
    output_glb, output_subsurface = output_paths_from_arguments()
    source_path = bpy.data.filepath
    source_hash = file_hash(source_path)

    flower = bpy.data.objects.get(SOURCE_OBJECT)
    if flower is None or flower.type != "MESH":
        raise RuntimeError(f"缺少杜鹃花网格：{SOURCE_OBJECT}")
    camera = bpy.data.objects.get(SOURCE_CAMERA)
    material = bpy.data.materials.get(SOURCE_MATERIAL)
    if camera is None or material is None:
        raise RuntimeError("杜鹃花源文件缺少英雄相机或四通道材质。")

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = flower.evaluated_get(depsgraph)
    source_mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        components = connected_components(source_mesh)
        if len(components) != 32:
            raise RuntimeError(f"杜鹃花连通区域应为 32，实际为 {len(components)}。")
        petal_components = components[:PETAL_COMPONENTS]
        if min(len(component) for component in petal_components) < 1400:
            raise RuntimeError("前五个连通区域不再符合五片主花瓣特征。")

        world = flower.matrix_world
        world_positions = [world @ vertex.co for vertex in source_mesh.vertices]
        petal_indices = {index for component in petal_components for index in component}
        remainder_indices = set(range(len(source_mesh.vertices))) - petal_indices

        remainder_tree = KDTree(len(remainder_indices))
        for slot, vertex_index in enumerate(remainder_indices):
            remainder_tree.insert(world_positions[vertex_index], slot)
        remainder_tree.balance()

        roots = []
        component_roots = []
        for component in petal_components:
            closest = sorted(
                ((remainder_tree.find(world_positions[index])[2], index) for index in component),
                key=lambda item: item[0],
            )[:24]
            root = average([world_positions[index] for _, index in closest])
            roots.append(root)
            component_roots.append(root)
        bloom_center = average(roots)

        facing = (camera.matrix_world.translation - bloom_center).normalized()
        target_facing = Vector((0.0, -1.0, 0.0))
        facing_rotation = facing.rotation_difference(target_facing)

        rotated_positions = [facing_rotation @ (position - bloom_center) for position in world_positions]
        petal_extent = max(rotated_positions[index].length for index in petal_indices)
        if petal_extent <= 0:
            raise RuntimeError("杜鹃花花瓣尺寸无效。")
        scale = TARGET_BLOOM_RADIUS / petal_extent
        transformed_positions = [position * scale for position in rotated_positions]
        transformed_roots = [facing_rotation @ (root - bloom_center) * scale for root in component_roots]

        export_material = material.copy()
        export_material.name = "AZALEA_PBR"
        export_material.use_backface_culling = False

        bloom, bloom_old_to_new = make_subset_object(
            "AZALEA_BLOOM",
            source_mesh,
            petal_indices,
            transformed_positions,
            export_material,
        )
        branch, _ = make_subset_object(
            "AZALEA_BRANCH",
            source_mesh,
            remainder_indices,
            transformed_positions,
            export_material,
        )

        basis = bloom.shape_key_add(name="Basis")
        closed = bloom.shape_key_add(name="Closed")
        basis.value = 0.0
        closed.value = 0.0
        blossom_axis = Vector((0.0, -1.0, 0.0))

        for component_index, component in enumerate(petal_components):
            root = transformed_roots[component_index]
            component_positions = [transformed_positions[index] for index in component]
            centroid = average(component_positions)
            radial = centroid - root
            radial -= blossom_axis * radial.dot(blossom_axis)
            if radial.length < 1e-5:
                radial = Vector((1.0, 0.0, 0.0))
            radial.normalize()
            tangent = radial.cross(blossom_axis).normalized()
            maximum = max(max((position - root).dot(radial), 0.0) for position in component_positions)
            maximum = max(maximum, 1e-5)

            for old_index in component:
                new_index = bloom_old_to_new[old_index]
                relative = transformed_positions[old_index] - root
                progress = smoothstep(max(0.0, relative.dot(radial)) / maximum)
                angle = math.radians(76.0) * (progress ** 0.72)
                bent = Quaternion(tangent, angle) @ relative
                tangent_amount = bent.dot(tangent)
                width_scale = 1.0 - 0.48 * progress
                bent += tangent * tangent_amount * (width_scale - 1.0)
                bent *= 1.0 - 0.10 * progress
                closed.data[new_index].co = root + bent

        bloom["morphTarget"] = "Closed"
        bloom["bloomCenter"] = (0.0, 0.0, 0.0)
        bloom["bloomFacing"] = (0.0, -1.0, 0.0)
        bloom["petalComponents"] = PETAL_COMPONENTS
        bloom["bloomRadius"] = TARGET_BLOOM_RADIUS
        branch["bloomCenter"] = (0.0, 0.0, 0.0)

        bpy.ops.object.select_all(action="DESELECT")
        bloom.select_set(True)
        branch.select_set(True)
        bpy.context.view_layer.objects.active = bloom

        os.makedirs(os.path.dirname(output_glb), exist_ok=True)
        os.makedirs(os.path.dirname(output_subsurface), exist_ok=True)
        subsurface = bpy.data.images.get(SUBSURFACE_IMAGE)
        if subsurface is None or not subsurface.packed_file:
            raise RuntimeError("杜鹃花次表面贴图未内嵌在源文件中。")
        with open(output_subsurface, "wb") as destination:
            destination.write(subsurface.packed_file.data)

        result = bpy.ops.export_scene.gltf(
            filepath=output_glb,
            check_existing=False,
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_apply=True,
            export_materials="EXPORT",
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_extras=True,
            export_morph=True,
            export_morph_normal=True,
            export_morph_tangent=True,
        )
        if "FINISHED" not in result:
            raise RuntimeError(f"杜鹃花 GLB 导出失败：{result}")

        if file_hash(source_path) != source_hash:
            raise RuntimeError("杜鹃花源文件在导出过程中发生了变化。")

        print(f"AZALEA_EXPORT_OK={output_glb}")
        print(f"AZALEA_SUBSURFACE_OK={output_subsurface}")
        print(f"AZALEA_SOURCE_SHA256={source_hash}")
        print(f"AZALEA_COMPONENTS={len(components)};PETALS={PETAL_COMPONENTS}")
        print(f"AZALEA_BLOOM_VERTICES={len(bloom.data.vertices)}")
        print(f"AZALEA_BRANCH_VERTICES={len(branch.data.vertices)}")
        print(f"AZALEA_SCALE={scale:.8f}")
    finally:
        evaluated.to_mesh_clear()


if __name__ == "__main__":
    main()
