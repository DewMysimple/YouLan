import os
import sys

import bpy
import bmesh


TARGET_OBJECT = "SPECIMEN_OUTER_FRAME"
EXPORT_OBJECT = "SPECIMEN_FRAME_MATERIAL_SLOTS"
MATERIAL_SLOTS = (
    "MAT_OuterFrame_TranslucentWhite",
    "MAT_InnerPanel_TransparentLavender",
)


def output_path_from_arguments():
    if "--" not in sys.argv:
        raise RuntimeError("缺少 GLB 输出路径。")

    script_arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(script_arguments) != 1:
        raise RuntimeError("导出脚本需要且只接受一个 GLB 输出路径。")

    return os.path.abspath(script_arguments[0])


def main():
    target = bpy.data.objects.get(TARGET_OBJECT)
    if target is None or target.type != "MESH":
        raise RuntimeError(f"Blender 文件缺少目标网格：{TARGET_OBJECT}")

    slot_names = tuple(slot.material.name if slot.material else None
                       for slot in target.material_slots)
    if slot_names != MATERIAL_SLOTS:
        raise RuntimeError(f"材质槽必须依次为外框、内框：{MATERIAL_SLOTS}，实际为 {slot_names}")
    if {polygon.material_index for polygon in target.data.polygons} != {0, 1}:
        raise RuntimeError("模型面必须且只能使用外框槽位 0 和内框槽位 1。")

    # The supplied mesh shares vertices across the two colored regions; it is
    # not two independent closed solids. Four internal panel walls produce
    # eight three-face edges. Derive one closed shell in this export session.
    # Never save this temporary data block back to the source .blend.
    target.data = target.data.copy()
    mesh = bmesh.new()
    try:
        mesh.from_mesh(target.data)
        mesh.normal_update()
        walls = [face for face in mesh.faces if face.material_index == 1
                 and abs(face.normal.x) < 0.01
                 and sum(len(edge.link_faces) == 3 for edge in face.edges) == 2]
        if len(walls) != 4 or len(mesh.faces) != 18:
            raise RuntimeError("源模型拓扑已改变；必须重新检查内部壁，不能盲目删除。")
        bmesh.ops.delete(mesh, geom=walls, context="FACES_ONLY")
        wires = [edge for edge in mesh.edges if not edge.link_faces]
        bmesh.ops.delete(mesh, geom=wires, context="EDGES")
        mesh.normal_update()
        if len(mesh.faces) != 14 or any(len(edge.link_faces) != 2 for edge in mesh.edges):
            raise RuntimeError("移除内部壁后未得到封闭的连续外壳。")
        mesh.to_mesh(target.data)
        target.data.update()
        print("SPECIMEN_SHELL=continuous;removed_internal_quads=4;triangles=28")
    finally:
        mesh.free()

    bpy.ops.object.select_all(action="DESELECT")

    target.hide_set(False)
    target.hide_render = False
    target.select_set(True)

    bpy.context.view_layer.objects.active = target

    # Normalize only this in-memory export session, never save the .blend.
    if bpy.data.objects.get(EXPORT_OBJECT) not in (None, target):
        raise RuntimeError(f"导出名称已被其他对象占用：{EXPORT_OBJECT}")
    target.name = EXPORT_OBJECT

    output_path = output_path_from_arguments()
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    result = bpy.ops.export_scene.gltf(
        filepath=output_path,
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="EXPORT",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )

    if "FINISHED" not in result:
        raise RuntimeError(f"GLB 导出失败：{result}")

    print(f"SPECIMEN_EXPORT_OK={output_path}")
    print(f"SPECIMEN_EXPORT_OBJECT={TARGET_OBJECT}")
    print(f"SPECIMEN_EXPORT_RUNTIME_OBJECT={EXPORT_OBJECT}")
    print(f"SPECIMEN_EXPORT_MATERIAL_SLOTS={','.join(MATERIAL_SLOTS)}")


if __name__ == "__main__":
    main()

