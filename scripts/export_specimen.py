import os
import sys

import bpy


TARGET_OBJECT = "SPECIMEN_FRAME_MATERIAL_SLOTS"
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

    bpy.ops.object.select_all(action="DESELECT")

    target.hide_set(False)
    target.hide_render = False
    target.select_set(True)

    bpy.context.view_layer.objects.active = target

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
    print(f"SPECIMEN_EXPORT_MATERIAL_SLOTS={','.join(MATERIAL_SLOTS)}")


if __name__ == "__main__":
    main()

