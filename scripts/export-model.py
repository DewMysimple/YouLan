from pathlib import Path

import bpy


MODEL_NAME = "SPECIMEN_FRAME_MERGED"
OUTPUT_NAME = "Specimen_Frame_Transparent_Merged.glb"
ENVIRONMENT_NAME = "HDRI_SPECIMEN_FRAME_STUDIO"
ENVIRONMENT_OUTPUT_NAME = "Specimen_Frame_Studio.exr"


def main():
    source_path = Path(bpy.data.filepath).resolve()
    project_root = source_path.parent.parent
    output_path = project_root / "public" / "models" / OUTPUT_NAME
    output_path.parent.mkdir(parents=True, exist_ok=True)
    environment_path = project_root / "public" / "environments" / ENVIRONMENT_OUTPUT_NAME
    environment_path.parent.mkdir(parents=True, exist_ok=True)

    model = bpy.data.objects.get(MODEL_NAME)
    if model is None or model.type != "MESH":
        raise RuntimeError(f"Mesh object not found: {MODEL_NAME}")

    bpy.ops.object.select_all(action="DESELECT")
    model.select_set(True)
    bpy.context.view_layer.objects.active = model

    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception:
        # The exporter is bundled in Blender builds that expose export_scene.gltf.
        pass

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        check_existing=False,
        export_format="GLB",
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_apply=True,
        export_yup=True,
        use_selection=True,
    )

    environment = bpy.data.images.get(ENVIRONMENT_NAME)
    if environment is not None and environment.size[0] > 0:
        environment.file_format = "OPEN_EXR"
        environment.save(filepath=str(environment_path))
        print(f"Exported environment: {environment_path}")

    print(f"Exported GLB: {output_path}")


if __name__ == "__main__":
    main()
