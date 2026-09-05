"""Reproducible ivory / rose butterfly, textured wings and collision-safe wingbeat.
Run: Blender --factory-startup -b --python scripts/build_butterfly.py
Authored in Three.js Y-up; B converts coordinates to Blender Z-up.
Textures are original procedural pigment / scale fields, not cropped reference images.
"""
import bpy
import math
import random
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
B = lambda p: (p[0], -p[2], p[1])
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, roughness=.65):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    return m

ivory = material('Warm ivory cuticle', (.73, .66, .57))
fur_mat = material('Ivory silk down', (.87, .81, .72), .82)
rose = material('Dusty rose antennae', (.34, .085, .11), .46)
eye = material('Garnet compound eyes', (.19, .043, .052), .32)
root = bpy.data.objects.new('Butterfly', None)
bpy.context.collection.objects.link(root)

def sphere(name, pos, scale, mat, parent=root):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=B(pos))
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
    c.resolution_u = 16
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

sphere('Thorax', (0, .20, 0), (.088, .27, .087), ivory)
sphere('Head', (0, .53, .01), (.093, .105, .085), ivory)
for sign in (-1, 1):
    # Small anatomical sockets bridge the hinge to the thorax without a floating root.
    sphere('WingSocket', (sign*.108,.15,.022), (.080,.066,.041), ivory)
    sphere('CompoundEye', (sign*.080, .54, .042), (.038, .058, .046), eye)
    tube('Antenna', [(sign*.04,.60,.025),(sign*.18,.94,.02),
                     (sign*.43,1.50,.005),(sign*.50,1.61,.02)], .006, rose)
    club = sphere('AntennaClub', (sign*.49,1.60,.018), (.027,.083,.024), rose)
    club.rotation_euler.y = -sign*.36
    for i in range(3):
        y=.32-i*.16
        tube('Leg', [(sign*.06,y,-.03),(sign*.14,y-.08,-.13),
                     (sign*.19,y-.28,-.20),(sign*.24,y-.39,-.19)], .006, ivory)
# A continuous abdomen with shallow segment grooves, not separate bead meshes.
verts=[];faces=[]
for j in range(181):
    t=j/180
    w=.079*(1-.55*t)*math.sqrt(max(.0001,1-t**5))
    w*=1-.045*math.exp(-math.sin(t*math.pi*9)**2/.03)
    for k in range(32):
        a=k*math.tau/32
        verts.append(B((w*math.cos(a),-.045-t*.83,-.014+w*.85*math.sin(a))))
for j in range(180):
    for k in range(32):
        faces.append((j*32+k,j*32+(k+1)%32,(j+1)*32+(k+1)%32,(j+1)*32+k))
faces.extend([tuple(range(31,-1,-1)),tuple(180*32+k for k in range(32))])
mesh=bpy.data.meshes.new('Continuous segmented abdomen');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('Abdomen',mesh);bpy.context.collection.objects.link(o);o.parent=root
mesh.materials.append(ivory)
for p in mesh.polygons:p.use_smooth=True

# One merged mesh of tapered 3D strands; it reads as down, including from the side.
rng=random.Random(61025)
verts=[]; faces=[]
for center, radii, count in [((0,.20,0),(.089,.27,.088),1800), ((0,.53,.01),(.094,.106,.086),400)]:
    for i in range(count):
        y=rng.uniform(-1,1); a=rng.uniform(0,math.tau)
        n=Vector((math.sqrt(1-y*y)*math.cos(a),y,math.sqrt(1-y*y)*math.sin(a)))
        p=Vector(center)+Vector(tuple(n[k]*radii[k] for k in range(3)))
        length=rng.uniform(.023,.062)
        direction=(n*.45+Vector((0,-.85,.18))).normalized()
        tangent=direction.cross(Vector((1,0,0))).normalized()
        bitangent=direction.cross(tangent).normalized()
        start=len(verts)
        for j in range(3):
            t=j/2
            c=p+direction*(length*t)+n*(.008*math.sin(t*math.pi))
            radius=.0028*(1-t)+.00018
            for k in range(3):
                q=c+(tangent*math.cos(k*math.tau/3)+bitangent*math.sin(k*math.tau/3))*radius
                verts.append(B(q))
        for j in range(2):
            for k in range(3):
                faces.append((start+j*3+k,start+j*3+(k+1)%3,start+(j+1)*3+(k+1)%3,start+(j+1)*3+k))
mesh=bpy.data.meshes.new('Silk down fibers');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('ThoraxDown',mesh);bpy.context.collection.objects.link(o);o.parent=root
mesh.materials.append(fur_mat)
for p in mesh.polygons:p.use_smooth=True

def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)

def noise(x,y,seed):
    ix=np.floor(x);iy=np.floor(y);fx=x-ix;fy=y-iy
    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
    def h(a,b):
        v=np.sin(a*127.1+b*311.7+seed*74.7)*43758.5453
        return v-np.floor(v)
    return ((h(ix,iy)*(1-fx)+h(ix+1,iy)*fx)*(1-fy)
            +(h(ix,iy+1)*(1-fx)+h(ix+1,iy+1)*fx)*fy)

def image(name, rgb, color_space='sRGB'):
    h,w=rgb.shape[:2]
    im=bpy.data.images.new(name,width=w,height=h,alpha=False)
    im.colorspace_settings.name=color_space
    rgba=np.ones((h,w,4),dtype=np.float32);rgba[:,:,:3]=np.clip(rgb,0,1)
    im.pixels.foreach_set(rgba.ravel());im.pack()
    return im

# XY projection UVs preserve thin, branching veins without radial triangle artifacts.
def wing_material(back):
    size=1536
    xmin,xmax=0,2.45
    ymin,ymax=(-1.65,.30) if back else (-.10,2.62)
    x,y=np.meshgrid(np.linspace(xmin,xmax,size,dtype=np.float32),np.linspace(ymin,ymax,size,dtype=np.float32))
    n0=noise(x*5,y*5,2);n1=noise(x*23,y*23,8);n2=noise(x*92,y*92,4);grain=noise(x*390,y*390,9)
    warp=(n0-.5)*.12+(n1-.5)*.055
    field=np.zeros_like(x)
    # Disconnected, ragged pigment islands, with ivory windows between the marks.
    patches=([(1.03,-.29,.56,.19),(1.57,-.42,.25,.18),(.66,-.62,.13,.24),
              (.80,-.90,.13,.23),(1.02,-1.15,.14,.15),(1.57,-.82,.12,.26)] if back else
             [(1.25,1.46,.44,.50),(.87,.92,.28,.40),(1.57,1.89,.25,.31),
              (.63,.47,.15,.20),(1.66,.58,.13,.30),(1.92,.90,.095,.29),
              (1.86,1.50,.065,.075),(1.99,1.82,.065,.08)])
    for cx,cy,rx,ry in patches:
        d=((x+warp-cx)/rx)**2+((y+warp*.7-cy)/ry)**2
        field=np.maximum(field,1-smooth(.63,1.2,d+(n1-.5)*.8))
    rootfade=smooth(.16,.50,np.sqrt(x*x+y*y))
    # Multiscale erosion creates rose flecks and pale, scaly gaps within the pigment.
    coverage=field*rootfade*smooth(.20,.48,.42*n1+.38*n2+.20*grain)
    cream=np.stack([.94+.035*n0,.90+.038*n0,.85+.045*n0],axis=-1)
    blush=np.stack([.46+.14*n2,.06+.10*n2,.10+.12*n2],axis=-1)
    rgb=cream*(1-coverage[:,:,None])+blush*coverage[:,:,None]
    stain=field*.12*(1-coverage)
    rgb=rgb*(1-stain[:,:,None])+np.array([.81,.49,.50])*stain[:,:,None]
    # Hand-authored vein fans with curved branches, a pale raised ridge and rose shadow.
    vein=np.full_like(x,100)
    endpoints=([(2.05,-.12),(2.03,-.47),(1.88,-.80),(1.64,-1.12),(1.28,-1.39),(.86,-1.50),(.43,-1.23)] if back else
               [(2.11,2.46),(2.22,2.10),(2.14,1.73),(2.07,1.32),(1.95,.95),(1.67,.57),(1.16,.23)])
    for k,(ex,ey) in enumerate(endpoints):
        t=np.clip(x/ex,0,1)
        curve=ey*t+(.06 if back else -.11)*np.sin(t*math.pi)
        dist=np.abs(y-curve)/math.sqrt(1+(ey/ex)**2)
        vein=np.minimum(vein,np.where(x<=ex,dist,100))
        for branch in (.52,.72):
            branchcurve=curve+(x-ex*branch)*(.22 if back else .28)
            bd=np.abs(y-branchcurve)/math.sqrt(1+(ey/ex+.25)**2)
            vein=np.minimum(vein,np.where((t>branch)&(t<branch+.19),bd,100))
    ridge=np.exp(-(vein/.0024)**2)*rootfade
    shadow=np.exp(-(vein/.006)**2)*rootfade
    rgb*=1-shadow[:,:,None]*.22
    rgb=rgb*(1-ridge[:,:,None]*.42)+np.array([.98,.94,.88])*ridge[:,:,None]*.42
    # Fine scales stay low contrast; avoid the old broad glossy stripes.
    scales=(grain-.5)*.027+(n2-.5)*.018
    rgb+=scales[:,:,None]
    base=image(('Hind' if back else 'Fore')+' rose pigment and scales',rgb)
    height=.33*ridge+.14*grain+.12*n2
    dy,dx=np.gradient(height)
    normal=np.stack([-dx*.55,-dy*.55,np.ones_like(x)],axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    normal=image(('Hind' if back else 'Fore')+' scale relief',normal*.5+.5,'Non-Color')
    m=material(('Hind' if back else 'Fore')+' ivory rose wing membrane',(1,1,1),.72)
    nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF')
    tex=nodes.new('ShaderNodeTexImage');tex.image=base;links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    tex=nodes.new('ShaderNodeTexImage');tex.image=normal
    nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45
    links.new(tex.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    return m,(xmin,xmax,ymin,ymax)

fore=[(.012,.02),(.28,.61),(.83,1.46),(1.55,2.24),(2.08,2.49),(2.22,2.37),
      (2.19,1.97),(2.09,1.48),(1.98,.88),(1.78,.29),(1.39,.05),(.72,-.025)]
hind=[(.012,-.02),(.62,.18),(1.34,.22),(1.85,-.025),(2.02,-.56),
      (1.92,-.91),(1.69,-1.23),(1.33,-1.45),(.93,-1.50),(.58,-1.27),(.26,-.74),(.06,-.23)]

def catmull(points,t):
    n=len(points);a=t*n;i=int(a)%n;f=a-int(a)
    p0,p1,p2,p3=[Vector(points[j%n]) for j in (i-1,i,i+1,i+2)]
    return .5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f)

materials={back:wing_material(back) for back in (False,True)}
def wing(name,outline,sign,back):
    pivot=bpy.data.objects.new(name+'Pivot',None);bpy.context.collection.objects.link(pivot)
    pivot.parent=root
    # Entire wing stays lateral to the narrow thorax, even at 82 degrees upstroke.
    pivot.location=B((sign*.160,.15,.022))
    nr,na=22,180;origin=Vector((.018,-.055 if back else .04))
    verts=[];uvs=[];faces=[]
    mat,(xmin,xmax,ymin,ymax)=materials[back]
    for r in range(nr+1):
        t=r/nr
        for j in range(na):
            a=j/na;edge=catmull(outline,a);p=origin.lerp(edge,t)
            p.x=max(.009,p.x)
            scallop=.007*math.sin(a*math.tau*29)*t**12
            p.x+=scallop*t
            # Overlapping silhouettes, disjoint depth slabs. The separation is in
            # hinge-local geometry, so it rotates with the wings even when folded.
            z=(0 if back else .022)+.006*math.sin(math.pi*t)**2
            verts.append(B((sign*p.x,p.y,z)))
            uvs.append(((p.x-xmin)/(xmax-xmin),(p.y-ymin)/(ymax-ymin)))
    for r in range(nr):
        for j in range(na):
            k=r*na+j;l=r*na+(j+1)%na
            quad=(k,l,l+na,k+na);faces.append(quad if sign>0 else quad[::-1])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='WingUV')
    for loop in mesh.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.parent=pivot
    mesh.materials.append(mat)
    for p in mesh.polygons:p.use_smooth=True
    for frame in range(25):
        phase=frame/24*math.tau
        # Same-side wings are coupled: phase lag previously caused their surfaces to cross.
        # +82 degrees dorsally, -43 ventrally; keep the existing 0.8 second rhythm.
        angle=math.radians(19.5+62.5*math.sin(phase))
        pivot.rotation_euler.z=-sign*angle
        pivot.keyframe_insert(data_path='rotation_euler',frame=frame)
    action=pivot.animation_data.action;action.name=name+'Flap'
    track=pivot.animation_data.nla_tracks.new();track.name='Wingbeat';track.strips.new('Wingbeat',0,action)
    pivot.animation_data.action=None

for sign,label in [(-1,'Left'),(1,'Right')]:
    wing(label+'Hindwing',hind,sign,True)
    wing(label+'Forewing',fore,sign,False)
scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=0;scene.frame_end=24;scene.frame_set(0)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=8
        area.spaces.active.shading.type='MATERIAL'
bpy.context.preferences.filepaths.save_version=0
# Retain the established asset paths so existing scene links and loading recovery remain compatible.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source/Blue_Morpho_Butterfly.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/blue-morpho-butterfly.glb'),
    export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',
    export_force_sampling=True,export_frame_range=True,export_cameras=False,export_lights=False)
print('Ivory rose butterfly source and animated GLB exported.')
