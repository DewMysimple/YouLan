import os
import sys

import bpy


TARGET_OBJECTS = (
    "SPECIMEN_OUTER_FRAME",
    "SPECIMEN_INNER_PANEL",
)


def output_path_from_arguments():
    if "--" not in sys.argv:
        raise RuntimeError("缺少 GLB 输出路径。")

    script_arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(script_arguments) != 1:
        raise RuntimeError("导出脚本需要且只接受一个 GLB 输出路径。")

    return os.path.abspath(script_arguments[0])


def main():
    missing = [name for name in TARGET_OBJECTS if bpy.data.objects.get(name) is None]
    if missing:
        raise RuntimeError(f"Blender 文件缺少目标对象：{', '.join(missing)}")

    bpy.ops.object.select_all(action="DESELECT")

    targets = [bpy.data.objects[name] for name in TARGET_OBJECTS]
    for target in targets:
        if target.type != "MESH":
            raise RuntimeError(f"目标对象 {target.name} 不是网格。")
        target.hide_set(False)
        target.hide_render = False
        target.select_set(True)

    bpy.context.view_layer.objects.active = targets[0]

    output_path = output_path_from_arguments()
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    result = bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="NONE",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )

    if "FINISHED" not in result:
        raise RuntimeError(f"GLB 导出失败：{result}")

    print(f"SPECIMEN_EXPORT_OK={output_path}")
    print(f"SPECIMEN_EXPORT_OBJECTS={','.join(TARGET_OBJECTS)}")


if __name__ == "__main__":
    main()

