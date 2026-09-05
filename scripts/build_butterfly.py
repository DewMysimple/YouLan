"""Original stylized butterfly, editable source and a portable loop animation.

Run: Blender --factory-startup -b --python scripts/build_butterfly.py
Coordinates below are Three.js Y-up; B() converts them to Blender Z-up.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
B = lambda p: (p[0], -p[2], p[1])
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, roughness=.45):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    return m

dark = material('Midnight chitin', (.009, .018, .033))
body_mat = material('Velvet teal body', (.018, .085, .105))
gold = material('Pearl antenna tips', (.55, .69, .57))
wing_mat = material('Morpho wing scales', (1, 1, 1), .38)
bs = wing_mat.node_tree.nodes.get('Principled BSDF')
vc = wing_mat.node_tree.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'WingColor'
wing_mat.node_tree.links.new(vc.outputs['Color'], bs.inputs['Base Color'])
bs.inputs['Metallic'].default_value = .18

root = bpy.data.objects.new('Butterfly', None)
bpy.context.collection.objects.link(root)

def sphere(name, pos, scale, mat, parent=root):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=B(pos))
    o = bpy.context.object
    o.name = name
    o.scale = (scale[0], scale[2], scale[1])
    o.parent = parent
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    return o

def tube(name, points, radius, mat):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions = '3D'
    c.bevel_depth = radius
    c.bevel_resolution = 3
    s = c.splines.new('BEZIER')
    s.bezier_points.add(len(points)-1)
    for p, co in zip(s.bezier_points, points):
        p.co = B(co)
        p.handle_left_type = p.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    o.parent = root
    o.data.materials.append(mat)

sphere('Thorax', (0, .18, .08), (.17, .39, .18), body_mat)
sphere('Head', (0, .65, .1), (.19, .18, .16), dark)
for sign in (-1, 1):
    sphere('CompoundEye', (sign*.145, .70, .19), (.07, .085, .065), body_mat)
    tube('Antenna', [(sign*.09,.77,.1),(sign*.22,1.08,.12),(sign*.40,1.41,.13),
                     (sign*.47,1.49,.16)], .014, dark)
    sphere('AntennaClub', (sign*.47,1.49,.16), (.035,.067,.035), gold)
    for i in range(3):
        y=.30-i*.23
        tube('Leg', [(sign*.1,y,0),(sign*.34,y-.06,-.14),
                     (sign*.43,y-.25,-.2),(sign*.5,y-.36,-.17)], .012, dark)
for i in range(9):
    w=.13*(1-i*.068)
    sphere('Abdomen_%02d'%i, (0,-.23-i*.13,.025), (w,.106,w*.85), body_mat if i%2==0 else dark)

def catmull(points, t):
    n=len(points); a=t*n; i=int(a)%n; f=a-int(a)
    p0,p1,p2,p3=[Vector(points[j%n]) for j in (i-1,i,i+1,i+2)]
    return .5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f)

# Swept forewings and round, scalloped hindwings have distinct silhouettes.
fore=[(.02,.05),(.30,.82),(1.15,1.85),(2.17,2.29),(2.39,2.12),
      (2.33,1.63),(2.20,1.20),(2.03,.80),(1.76,.47),(1.43,.23),(.85,.04)]
hind=[(.02,.12),(.73,.34),(1.42,.27),(1.91,-.02),(1.94,-.44),(1.82,-.80),
      (1.64,-1.02),(1.44,-1.20),(1.19,-1.34),(.94,-1.40),(.68,-1.28),(.38,-.94),(.12,-.43)]

def mix(a,b,t): return tuple(x*(1-t)+y*t for x,y in zip(a,b))
def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)

def wing(name, outline, sign, back):
    pivot=bpy.data.objects.new(name+'Pivot', None)
    bpy.context.collection.objects.link(pivot)
    pivot.parent=root
    pivot.location=B((sign*.09,-.08 if back else .27,-.035 if back else 0))
    nr,na=48,240
    origin=Vector((.13,.03))
    verts=[]; colors=[]; faces=[]
    for r in range(nr+1):
        t=r/nr
        for j in range(na):
            a=j/na
            edge=catmull(outline,a)
            p=origin.lerp(edge,t)
            z=.09*math.sin(math.pi*t)*(1+.4*math.sin(a*12))
            verts.append(B((sign*p.x,p.y,z)))
            # Radial veins, dusky border, pearly marginal spots, fine scale bands.
            phase=a*12+.10*math.sin(t*5+a*8)
            vein=abs(math.sin(math.pi*phase))
            pigment=mix((.013,.13,.46),(.025,.62,.73),smooth(.05,.67,t))
            pigment=mix(pigment,(.22,.10,.43),smooth(.60,.91,t)*.6)
            scale=.90+.10*math.sin(t*420+a*32)
            pigment=tuple(c*scale for c in pigment)
            ink=(.007,.012,.033)
            vein_mask=(1-smooth(.025,.12,vein))*.91*smooth(.08,.24,t)
            pigment=mix(pigment,ink,vein_mask)
            pigment=mix(pigment,ink,smooth(.82,.89,t))
            pigment=mix(ink,pigment,smooth(.035,.24,t))
            spot=((t-.936)/.024)**2+((phase%1-.5)/.21)**2
            pigment=mix(pigment,(.66,.82,.78),1-smooth(.65,1.2,spot))
            colors.append((*pigment,1))
    for r in range(nr):
        for j in range(na):
            k=r*na+j; l=r*na+(j+1)%na
            # XY Three surface -> facing +Z, including the mirrored side.
            quad=(k,l,l+na,k+na)
            faces.append(quad if sign>0 else quad[::-1])
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    attr=mesh.color_attributes.new(name='WingColor',type='FLOAT_COLOR',domain='POINT')
    for item,color in zip(attr.data,colors): item.color=color
    o=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(o)
    o.parent=pivot
    mesh.materials.append(wing_mat)
    for p in mesh.polygons: p.use_smooth=True
    # An actual portable glTF animation, with a small hindwing phase lag.
    for frame in range(25):
        phase=frame/24*math.tau-(.16 if back else 0)
        angle=.18+.91*math.sin(phase)+.10*math.sin(phase*2)
        pivot.rotation_euler.z=-sign*angle*(.93 if back else 1)
        pivot.keyframe_insert(data_path='rotation_euler',frame=frame)
    action=pivot.animation_data.action
    action.name=name+'Flap'
    track=pivot.animation_data.nla_tracks.new()
    track.name='Wingbeat'
    track.strips.new('Wingbeat',0,action)
    pivot.animation_data.action=None
    return pivot

for sign,label in [(-1,'Left'),(1,'Right')]:
    wing(label+'Hindwing',hind,sign,True)
    wing(label+'Forewing',fore,sign,False)

scene=bpy.context.scene
scene.render.fps=30
scene.frame_start=0
scene.frame_end=24
scene.frame_set(0)
# Save a useful model-editing view in the original source.
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=8
        area.spaces.active.shading.type='MATERIAL'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source/Blue_Morpho_Butterfly.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/blue-morpho-butterfly.glb'),
    export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',
    export_force_sampling=True,export_frame_range=True,export_cameras=False,export_lights=False,
    export_all_vertex_colors=True)
print('Butterfly source and animated GLB exported.')
